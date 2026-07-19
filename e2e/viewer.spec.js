const { test, expect } = require('@playwright/test');
const { activeMovesLen, waitBoardReady } = require('./helpers/board');

// Viewer (anonymous). Open a real archived game from a search result, then exercise the four
// navigation/inspection affordances: keyboard stepping, mouse-wheel stepping, the rotation
// control, and the per-player capture counter.
test.describe('viewer', () => {
  test('open a search result; keyboard + wheel nav; rotation; capture counter', async ({ page }) => {
    await page.goto('/');

    // Left panel opens on the Search tab (wide layout). Run the default Pente archive search.
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const firstResult = page.locator('[data-testid^="result-row-"]').first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    await expect(page).toHaveURL(/\/g\/\d+/);
    await waitBoardReady(page);

    // Capture counters render as non-negative integers for both players.
    await expect(page.getByTestId('captures-1')).toHaveText(/^\d+$/);
    await expect(page.getByTestId('captures-2')).toHaveText(/^\d+$/);

    // The game opens at its final position. Move focus off the search button (a non-interactive
    // element) so window-level keyboard nav is not swallowed by an input, then step the cursor.
    const full = await activeMovesLen(page);
    expect(full).toBeGreaterThan(0);
    await page.getByTestId('captures-1').click();

    await page.keyboard.press('Home');
    await expect.poll(() => activeMovesLen(page)).toBe(0);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => activeMovesLen(page)).toBe(1);

    // Mouse wheel over the board steps prev / next. Dispatch a real, bubbling WheelEvent (with a
    // genuine deltaY) so React's delegated onWheel listener at the root container receives it.
    // Cursor is at move 1; wheeling up steps back to 0 and down returns to 1 — works for any game
    // with at least one move (some archived games are short forfeits).
    const pane = page.getByTestId('board-pane');
    const wheel = (deltaY) =>
      pane.evaluate((el, dy) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true })), deltaY);
    await wheel(-120);
    await expect.poll(() => activeMovesLen(page)).toBe(0);
    await wheel(120);
    await expect.poll(() => activeMovesLen(page)).toBe(1);

    // Rotation is a pure view control: rotating reveals a reset affordance; resetting removes it.
    await page.getByRole('button', { name: 'Rotate board' }).click();
    const reset = page.getByRole('button', { name: 'Reset board orientation' });
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(reset).toHaveCount(0);
  });
});
