const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { cell, activeMoves, activeTreeWire, waitBoardReady } = require('./helpers/board');
const { sweep } = require('./helpers/cleanup');

// Import / export (authed). Two round-trips over the real exchange codecs + backend:
//   1. An analysis's tree exported as "SGF (analysis tree)" and re-imported "as analysis" must
//      round-trip identically (deep-equal via the window.__PENTEDB__ tree hook).
//   2. A PGN "as games" import: a duplicate and an invalid record are summarized, and scope=mine
//      Explorer stats then count the imported game.
// The exchange Export lives inside the analysis tray (TreeView's "Export tree" menu). All created
// rows are cleaned up afterward.
const TMP = path.join(__dirname, '.tmp');

async function ensureTrayOpen(page) {
  const exportBtn = page.getByRole('button', { name: 'Export tree' });
  if (!(await exportBtn.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Show variation tree' }).click();
    await expect(exportBtn).toBeVisible();
  }
}

async function exportVia(page, menuItem, outName) {
  await ensureTrayOpen(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: 'Export tree' }).click();
      await page.getByRole('menuitem', { name: menuItem }).click();
    })(),
  ]);
  const out = path.join(TMP, outName);
  await download.saveAs(out);
  return out;
}

async function openImportDialog(page) {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Import games' })).toBeVisible();
}

test.describe.serial('import / export', () => {
  const createdAnalyses = [];

  test.beforeAll(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    // These specs build unsaved (dirty) scratch positions and then navigate — which snapshots
    // them for recovery and pops the modal "Restore unsaved work?" dialog on the next load,
    // whose backdrop would block later clicks. Clear the recovery snapshot on every navigation
    // so the dialog never appears. (No test exercises recovery; cookies are unaffected.)
    await page.addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch {
        /* ignore */
      }
    });
  });

  test.afterAll(async ({ request }) => {
    for (const aid of createdAnalyses) await request.delete(`/api/db/analyses/${aid}`);
    // Sweep the imported analysis (named from the scratch title) + wipe the test account's
    // collection (empty baseline, so a full sweep is safe).
    await sweep(request, { marker: 'Position 1', games: [1] });
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  test('export analysis SGF -> re-import as analysis -> tree deep-equal', async ({ page, request }) => {
    await page.goto('/p/1/180');
    await waitBoardReady(page);

    // Free-form branch tree (analysis path stores the tree verbatim — no game-rule replay).
    await cell(page, 200).click();
    await page.keyboard.press('ArrowLeft'); // back to the root move [180]
    await cell(page, 240).click(); // branch: node 180 now has kids [200, 240]
    await page.getByRole('button', { name: 'Show variation tree' }).click();
    await page.getByRole('button', { name: 'Good', exact: true }).click(); // tag glyph '!'
    const originalWire = await activeTreeWire(page);

    const sgfPath = await exportVia(page, 'SGF (analysis tree)', 'analysis.sgf');

    const preAids = new Set(
      ((await (await request.get('/api/db/analyses')).json()).analyses || []).map((a) => a.aid)
    );

    await openImportDialog(page);
    await page.locator('input[type="file"]').setInputFiles(sgfPath);
    await page.getByRole('button', { name: 'As analysis' }).click(); // (already default; asserts intent)
    await page.getByRole('button', { name: /^Import \(/ }).click();
    await expect(page.getByText(/saved as analyses/)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    const newAid = ((await (await request.get('/api/db/analyses')).json()).analyses || [])
      .map((a) => a.aid)
      .find((id) => !preAids.has(id));
    expect(newAid).toBeTruthy();
    createdAnalyses.push(newAid);

    await page.goto(`/a/${newAid}`);
    await waitBoardReady(page);
    await expect.poll(async () => (await activeTreeWire(page)) != null).toBe(true);
    expect(await activeTreeWire(page)).toEqual(originalWire);
  });

  test('PGN import: duplicate + invalid summarized; scope=mine includes the import', async ({ page }) => {
    test.slow(); // opens a game + two exports + two backend imports + navigation — triple the budget
    // A real archived game — real player names, so the backend accepts the collection import.
    await page.goto('/');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const firstResult = page.locator('[data-testid^="result-row-"]').first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();
    await expect(page).toHaveURL(/\/g\/\d+/);
    await waitBoardReady(page);
    const firstMove = (await activeMoves(page))[0];
    const goodPgn = await exportVia(page, 'PGN', 'good.pgn');

    // An off-centre scratch game — parses fine, but the client flags it invalid on import.
    await page.goto('/');
    await waitBoardReady(page);
    await cell(page, 100).click();
    await cell(page, 120).click();
    const badPgn = await exportVia(page, 'PGN', 'bad.pgn');

    // Import the good game once -> it lands in the collection.
    await openImportDialog(page);
    await page.locator('input[type="file"]').setInputFiles(goodPgn);
    await page.getByRole('button', { name: /^Import \(/ }).click();
    await expect(page.getByText(/[1-9]\d* imported/)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // Re-import the good game (now a duplicate) alongside the invalid off-centre one.
    await openImportDialog(page);
    await page.locator('input[type="file"]').setInputFiles([goodPgn, badPgn]);
    await expect(page.getByLabel('invalid')).toBeVisible(); // the off-centre row is flagged
    await page.getByRole('button', { name: /^Import \(/ }).click();
    await expect(page.getByText(/duplicate\(s\) skipped/)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // scope=mine: the Explorer stats at the imported game's opening now count it (small personal
    // corpus, not the ~1M archive).
    await page.goto(`/p/1/${firstMove}`);
    const summary = page.getByTestId('explorer-summary');
    await expect(summary).toContainText(/\d+\s+games/); // archive count first
    await page.getByRole('button', { name: 'Mine', exact: true }).click(); // ScopeToggle
    const count = async () => {
      const m = ((await summary.textContent()) || '').match(/(\d+)\s+games/);
      return m ? Number(m[1]) : -1;
    };
    // Wait for the mine-scoped refetch to replace the ~1M archive count with the small personal
    // corpus (the game just imported), then confirm it counts at least that one game.
    await expect.poll(count).toBeLessThan(1000);
    expect(await count()).toBeGreaterThanOrEqual(1);
  });
});
