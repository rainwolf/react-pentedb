// Shared board / model helpers for the specs.
//
// Board cells are SVG <rect> whose DOM id is the (quote-wrapped) canonical cell index, e.g.
// id='"180"' for the centre. At rotation 0 (the default) the displayed cell index equals the
// canonical one, so a cell number maps straight to a selector. Scoped to the main board pane so
// the Explorer's mini heat preview can't collide.
const { expect } = require('@playwright/test');

// A locator for the clickable rect of canonical cell `c` on the main board.
function cell(page, c) {
  return page.getByTestId('board-pane').locator(`[id='"${c}"']`).first();
}

// Read the active document's move line via the dev-only test hook (window.__PENTEDB__).
function activeMoves(page) {
  return page.evaluate(() => {
    const api = window.__PENTEDB__;
    const pos = api && api.activePos();
    return pos ? pos.moves.slice() : null;
  });
}

function activeMovesLen(page) {
  return page.evaluate(() => {
    const api = window.__PENTEDB__;
    const pos = api && api.activePos();
    return pos ? pos.moves.length : -1;
  });
}

// The active analysis tree in id-stripped wire form (stable across save/reload).
function activeTreeWire(page) {
  return page.evaluate(() => {
    const api = window.__PENTEDB__;
    return api ? api.activeTreeWire() : null;
  });
}

// Wait until the board pane and the test hook are both live for the current document.
async function waitBoardReady(page) {
  await expect(page.getByTestId('board-pane')).toBeVisible();
  await expect.poll(() => activeMovesLen(page)).toBeGreaterThanOrEqual(0);
}

module.exports = { cell, activeMoves, activeMovesLen, activeTreeWire, waitBoardReady };
