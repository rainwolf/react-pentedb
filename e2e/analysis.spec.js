const { test, expect } = require('@playwright/test');
const { cell, activeMovesLen, activeTreeWire, waitBoardReady } = require('./helpers/board');
const { deleteAnalysis, sweep } = require('./helpers/cleanup');

// Analysis (authed). Build a branched, tagged, commented variation tree, save it, then prove it
// survives a full reload AND a reopen from the saved-analyses list — comparing the tree in
// id-stripped wire form (deep-equal via the window.__PENTEDB__ hook), since fromWire reassigns
// node ids on load. Cleans up the created analysis afterward.
const NAME = `e2e-analysis-${Date.now()}`;

test.describe.serial('analysis', () => {
  const created = [];

  test.afterAll(async ({ request }) => {
    for (const aid of created) await deleteAnalysis(request, aid);
    await sweep(request, { marker: 'e2e-analysis', games: [] });
  });

  test('branch/tag/comment survive save, reload, and reopen (tree deep-equal)', async ({ page }) => {
    await page.goto('/p/1/180');
    await waitBoardReady(page);

    // Mainline 180-200-220, then a variation 180-200-240 (branch off node 200).
    await cell(page, 200).click();
    await expect.poll(() => activeMovesLen(page)).toBe(2);
    await cell(page, 220).click();
    await expect.poll(() => activeMovesLen(page)).toBe(3);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => activeMovesLen(page)).toBe(2);
    await cell(page, 240).click();
    await expect.poll(() => activeMovesLen(page)).toBe(3);

    // Open the analysis tray; tag + comment the cursor node (240).
    await page.getByRole('button', { name: 'Show variation tree' }).click();
    await page.getByRole('button', { name: 'Good', exact: true }).click(); // glyph '!'
    await page.getByLabel('Comment').fill('e2e branch note');

    // Wait for the 500ms comment autosave to land in the tree, then snapshot it.
    await expect
      .poll(async () => JSON.stringify(await activeTreeWire(page)))
      .toContain('e2e branch note');
    const before = await activeTreeWire(page);

    // Save as a named analysis (POST -> aid; tab re-keys to /a/:aid).
    await page.getByRole('button', { name: 'Save analysis' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save analysis' });
    await dialog.getByLabel('Name').fill(NAME);
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/a\/\d+/);
    const aid = Number(page.url().match(/\/a\/(\d+)/)[1]);
    created.push(aid);

    // Reload: the tree is rebuilt from the server copy and must deep-equal the pre-save tree.
    await page.reload();
    await waitBoardReady(page);
    await expect
      .poll(async () => JSON.stringify(await activeTreeWire(page)))
      .toContain('e2e branch note');
    expect(await activeTreeWire(page)).toEqual(before);

    // Reopen from the "My analyses" list -> same tree once more.
    await page.goto('/');
    await page.getByRole('tab', { name: 'My analyses' }).click();
    await page.getByText(NAME).click();
    await expect(page).toHaveURL(new RegExp(`/a/${aid}(\\b|$)`));
    await waitBoardReady(page);
    await expect
      .poll(async () => JSON.stringify(await activeTreeWire(page)))
      .toContain('e2e branch note');
    expect(await activeTreeWire(page)).toEqual(before);
  });
});
