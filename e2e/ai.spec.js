const { test, expect } = require('@playwright/test');
const { cell, activeMovesLen, waitBoardReady } = require('./helpers/board');
// The app's own coordinate codec: alphaToCell is the exact inverse of the moveLabel the
// suggestion chip renders, so hint legality is checked with production math, not a spec copy.
const { alphaToCell } = require('../src/export/coords');

// AI (anonymous, REAL wasm engine). Hint returns a LEGAL suggestion (on-board, unoccupied cell —
// two distinct for Connect6) for each of the six base engine variants at level 1; play-vs-AI has
// the engine answer two turns; an unsupported variant (D-Pente, game 7) shows the fallback.
const BASE_VARIANTS = [
  [1, 'Pente'],
  [3, 'Keryo-Pente'],
  [11, 'Poof-Pente'],
  [13, 'Connect6'],
  [15, 'Boat-Pente'],
  [25, 'O-Pente'],
];

async function openAiTab(page) {
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
}

async function setLevel1(page) {
  await page.getByRole('combobox', { name: 'Level' }).click();
  await page.getByRole('option', { name: '1', exact: true }).click();
}

test.describe('ai', () => {
  for (const [game, label] of BASE_VARIANTS) {
    test(`hint returns a legal suggestion for ${label} (game ${game}) at level 1`, async ({ page }) => {
      test.slow(); // the first hint cold-compiles the wasm engine; give it generous headroom
      await page.goto(`/p/${game}/180`);
      await waitBoardReady(page);
      await openAiTab(page);
      await setLevel1(page);
      await page.getByTestId('ai-opening-book').check();

      await page.getByTestId('ai-hint').click();

      const chip = page.getByTestId('ai-suggestion-chip');
      await expect(chip).toBeVisible({ timeout: 90_000 });
      await expect(chip).toContainText('AI suggests');
      await expect(page.getByTestId('ai-error')).toHaveCount(0);

      // Legality: parse the displayed coordinate(s) and map them back through the app's codec.
      // A regression suggesting an occupied or off-board cell fails here (bad count, or
      // alphaToCell throws, or the cell is out of range / the seeded stone).
      const shown = (await chip.textContent()).replace(/^AI suggests\s*/, '');
      const coords = [...shown.matchAll(/[A-HJ-T]\d{1,2}/g)].map((m) => m[0]);
      const expectedCount = game === 13 ? 2 : 1; // Connect6 plays a two-stone turn
      expect(coords).toHaveLength(expectedCount);
      const cells = coords.map((c) => alphaToCell(c)); // throws on any off-board/malformed coord
      for (const c of cells) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(360);
        expect(c).not.toBe(180); // the seeded centre stone must not be re-suggested
      }
      if (game === 13) expect(new Set(cells).size).toBe(2); // two DISTINCT cells
    });
  }

  test('play vs AI: the engine answers two turns', async ({ page }) => {
    await page.goto('/'); // empty Pente scratch (game 1)
    await waitBoardReady(page);
    await openAiTab(page);
    await setLevel1(page);
    await page.getByTestId('ai-opening-book').check();

    // AI plays first (Black): toggle play on, then choose "First" so the engine opens.
    await page.getByTestId('ai-play-toggle').check();
    await page.getByTestId('ai-color-first').click();
    await expect.poll(() => activeMovesLen(page), { timeout: 45_000 }).toBe(1); // AI opening (turn 1)

    // Human reply is move 2, but the engine answers move 3 almost immediately — assert the
    // stable end state (len 3) rather than the transient len 2 the auto-answer blows past.
    await cell(page, 200).click();
    await expect.poll(() => activeMovesLen(page), { timeout: 45_000 }).toBe(3); // AI answers turn 2
  });

  test('unsupported variant (D-Pente, game 7) shows the fallback', async ({ page }) => {
    // D-Pente is game id 7 (variantKey range 7-8); it is not in the engine's SUPPORTED set, so
    // the AI panel renders the fallback instead of the controls. (The brief's "id 5" is Gomoku,
    // also unsupported — either proves the fallback; 7 matches the D-Pente label it names.)
    await page.goto('/p/7/180');
    await waitBoardReady(page);
    await openAiTab(page);
    const fallback = page.getByTestId('ai-unavailable');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText('D-Pente');
  });
});
