const { test, expect } = require('@playwright/test');
const { cell, activeMovesLen, waitBoardReady } = require('./helpers/board');

// Mobile (390x844, touch => coarse pointer). The narrow layout swaps the side rails for a bottom
// tab bar; the Explorer flow runs through it, and board move entry uses the coarse-pointer
// tap-confirm path (tap arms a pending stone, a Confirm button commits it).
test.describe('mobile', () => {
  test('explorer flow via bottom tabs', async ({ page }) => {
    await page.goto('/p/1/180');
    await waitBoardReady(page);

    await page.getByRole('tab', { name: 'Explorer' }).click();
    const summary = page.getByTestId('explorer-summary');
    await expect(summary).toContainText(/\d{4,}\s+games/);

    const topRow = page.locator('[data-testid^="stats-row-"]').first();
    await expect(topRow).toBeVisible();
    const move = (await topRow.getAttribute('data-testid')).replace('stats-row-', '');
    await topRow.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/p/1/180-${move}`);
  });

  test('tap-confirm move entry on the board', async ({ page }) => {
    await page.goto('/p/1/180');
    await waitBoardReady(page);

    // Coarse pointer: tapping an empty cell arms a pending stone that Confirm commits.
    await cell(page, 200).click();
    const confirm = page.getByRole('button', { name: 'Confirm move' });
    await expect(confirm).toBeVisible();
    await confirm.click();
    await expect.poll(() => activeMovesLen(page)).toBe(2);
  });
});
