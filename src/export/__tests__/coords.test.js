import { describe, test, expect } from 'vitest';
import { cellToAlpha, alphaToCell } from '../coords';

// Alpha-numeric coordinate text per sgf-pgn-formats.md §1.2 / §7.3: columns A..H,J..T
// (letter I skipped), row = 19 - y, cell = x + y*19.
//
// DOC INCONSISTENCY (resolved in favour of the §1.2 rule): the §7.3 table row
// "| 360 | 0 | 18 | A | 1 | A1 |" is an arithmetic slip — with cell = x + y*19 and x=0,y=18
// the bottom-left cell is 0 + 18*19 = 342, not 360 (the author used width 20). The §1.2 rule
// and the spec-VERBATIM center value K10 = 180 (= 9 + 9*19) both confirm the ×19 formula, so
// the authoritative values are A1 = 342 and cell 360 = T1 (x=18,y=18).

describe('cellToAlpha — the §7.3 worked values (bottom-left corrected to the §1.2 rule)', () => {
  test.each([
    [180, 'K10'], // center: x=9,y=9 -> J bumped to K, row 10 (spec-verbatim)
    [0, 'A19'], //   top-left
    [342, 'A1'], //  bottom-left (0 + 18*19; the doc's "360 -> A1" is a width-20 slip)
    [360, 'T1'], //  bottom-right (x=18,y=18) — what 360 actually is under cell = x + y*19
    [8, 'J19'], //   x=8 -> I skipped -> J
    [7, 'H19'], //   x=7 -> H (last before the skip)
  ])('cell %i -> %s', (cell, token) => {
    expect(cellToAlpha(cell)).toBe(token);
  });
});

describe('alphaToCell — inverse of the §7.3 values', () => {
  test.each([
    ['K10', 180],
    ['A19', 0],
    ['A1', 342],
    ['T1', 360],
    ['J19', 8],
    ['H19', 7],
  ])('%s -> cell %i', (token, cell) => {
    expect(alphaToCell(token)).toBe(cell);
  });
});

describe('round-trip: every one of the 361 cells', () => {
  test('cellToAlpha then alphaToCell is identity for 0..360', () => {
    for (let cell = 0; cell < 361; cell += 1) {
      expect(alphaToCell(cellToAlpha(cell))).toBe(cell);
    }
  });

  test('the letter I never appears in any of the 361 column letters', () => {
    for (let cell = 0; cell < 361; cell += 1) {
      const token = cellToAlpha(cell);
      expect(token[0]).not.toBe('I');
    }
  });

  test('column letters are exactly A..H,J..T (I skipped) across the top row', () => {
    const letters = [];
    for (let x = 0; x < 19; x += 1) letters.push(cellToAlpha(x)[0]);
    expect(letters.join('')).toBe('ABCDEFGHJKLMNOPQRST');
  });
});

describe('alphaToCell — malformed input throws RangeError', () => {
  test.each([
    'I5', //   the skipped column letter is not a valid coordinate
    'K0', //   row 0 is below the board
    'K20', //  row 20 is above the board
    'U10', //  column past T
    'K', //    no row number
    '10', //   no column letter
    '', //     empty
    'K10K', // trailing garbage
  ])('%s throws RangeError', (bad) => {
    expect(() => alphaToCell(bad)).toThrow(RangeError);
  });
});
