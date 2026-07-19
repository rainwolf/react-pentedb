const { test, expect } = require('@playwright/test');

// Explorer (anonymous / archive). The Pente start position — the forced centre stone [180] —
// shows archive position-stats, and three successive descents (clicking the busiest candidate-move
// row each time) deepen the line, updating BOTH the stats summary (the "games list") and the URL
// to /p/1/<moves>.
test.describe('explorer', () => {
  test('start position shows stats; three descents update list + URL', async ({ page }) => {
    await page.goto('/p/1/180');

    const summary = page.getByTestId('explorer-summary');
    await expect(summary).toContainText('win for mover');
    await expect(summary).toContainText(/\d{4,}\s+games/); // ~1M archive games through [180]

    let path = '/p/1/180';
    let prev = (await summary.textContent()).trim();

    for (let i = 0; i < 3; i++) {
      const topRow = page.locator('[data-testid^="stats-row-"]').first();
      await expect(topRow).toBeVisible();
      const move = (await topRow.getAttribute('data-testid')).replace('stats-row-', '');

      await topRow.click();

      path = `${path}-${move}`;
      await expect.poll(() => new URL(page.url()).pathname).toBe(path);
      // The stats reload for the deeper (smaller) position — the summary must change.
      await expect.poll(async () => (await summary.textContent()).trim()).not.toBe(prev);
      prev = (await summary.textContent()).trim();
    }
  });
});
