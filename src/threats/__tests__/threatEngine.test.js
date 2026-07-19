// Golden tests for the threat-analysis engine port (src/threats/threatEngine.js).
//
// Every case in threat-engine-port.md §12 (the spec's own worked assertions) is
// transcribed here, driven end-to-end through analyzePosition() on a real board — so the
// full pipeline (findLines two-phase scan → Line.split → findThreat → addThreat dedup) is
// exercised, not a hand-built Line buffer. Plus: edge-of-board non-wrap (columns A and T),
// the captured-stone filter (c != (i%2)+1), and the empty board.
//
// PATTERN HARNESS: patterns are laid horizontally (or vertically) on a 19x19 board with the
// own colour = player 1. The driver rescans the whole move history and applies the
// captured-stone filter `getPosition(m) === (i%2)+1`, so the move list MUST strictly
// alternate P1,P2,P1,P2,...  buildLine() places all own (P1) stones on EVEN move indices and
// all opponent (P2) stones + parity fillers on ODD indices; fillers are scattered far from
// the pattern (top rows, widely spaced) so they stay isolated (myLen 1 → no threat) and
// never interact with the pattern or each other.

import { describe, it, expect } from 'vitest';
import { analyzePosition } from '../threatEngine';
import {
  TYPE_BLOCKED,
  TYPE_POTENTIAL_CAPTURE,
  TYPE_POTENTIAL_THREE_SPLIT,
  TYPE_POTENTIAL_THREE_PAIR,
  TYPE_POTENTIAL_FOUR,
  TYPE_TRIA,
  TYPE_CLOSED_FOUR,
  TYPE_OPEN_FOUR,
  RANKS_OFFENSE,
  RANKS_DEFENSE,
  TYPE_PRIOR,
} from '../threatConstants';

const W = 19;
const H = 19;

// ---- harness -------------------------------------------------------------------------

// Scatter parity fillers far from the pattern: filler k at (row=k, col=4k). No two share a
// row/column/diagonal (Δrow=1, Δcol=4), and they sit in the top rows, far from a mid-board
// pattern. Each is an isolated stone (myLen 1 → no threat, no capture).
function fillerPos(k) {
  const row = k;
  const col = 4 * k;
  if (col >= W) throw new Error('too many fillers for harness');
  return row * W + col;
}

// Build an analyzePosition input from a 1-D pattern string.
//   chars: 'X' own (P1), 'O' opponent (P2), '_' or '0' empty, others advance the cursor.
//   dir: 'h' (col+1), 'v' (row+1).
// Returns {game, moves, boardW, boardH}. Own stones land on even move indices, opponent +
// fillers on odd, so alternation holds and no pattern stone is filtered out.
function buildLine(pattern, { row = 9, col, dir = 'h' } = {}) {
  const cells = pattern.split('');
  const start = col == null ? Math.floor((W - cells.length) / 2) : col;
  const posOf = (k) => (dir === 'v' ? (row + k) * W + start : row * W + (start + k));

  const own = [];
  const opp = [];
  cells.forEach((c, k) => {
    if (c === 'X') own.push(posOf(k));
    else if (c === 'O') opp.push(posOf(k));
  });
  if (opp.length > own.length) {
    throw new Error(`buildLine: pattern needs opp<=own (got ${opp.length}>${own.length})`);
  }

  const oddCount = Math.max(own.length - 1, opp.length);
  const odds = opp.slice();
  for (let k = 0; odds.length < oddCount; k++) odds.push(fillerPos(k));

  const board = new Map();
  own.forEach((p) => board.set(p, 1));
  opp.forEach((p) => board.set(p, 2));
  odds.slice(opp.length).forEach((p) => board.set(p, 2)); // fillers

  // interleave: even idx = own (colour 1), odd idx = odds (colour 2)
  const moves = [];
  for (let k = 0; k < Math.max(own.length, odds.length); k++) {
    if (k < own.length) moves.push(own[k]);
    if (k < odds.length) moves.push(odds[k]);
  }

  return {
    game: { getPosition: (p) => board.get(p) || 0, captures: [undefined, 0, 0] },
    moves,
    boardW: W,
    boardH: H,
    _own: own,
    _opp: opp,
  };
}

// Build from an explicit stone list + move order (for capture / edge / filter cases where
// alternation needs manual control). stones: array of {pos, color}. moves: play order.
function buildRaw(stones, moves, caps = [undefined, 0, 0]) {
  const board = new Map();
  stones.forEach(({ pos, color }) => board.set(pos, color));
  return {
    game: { getPosition: (p) => board.get(p) || 0, captures: caps },
    moves,
    boardW: W,
    boardH: H,
  };
}

const p1 = (r) => r.threats.filter((t) => t.player === 1);
const p2 = (r) => r.threats.filter((t) => t.player === 2);
const pairsP2 = (r) => r.pairs.filter((t) => t.player === 2);
const types = (list) => list.map((t) => t.type).sort((a, b) => a - b);

// ---- ranking constants (assert directly, §8.3) ---------------------------------------

describe('ranking constants (VERBATIM §8.3)', () => {
  it('RANKS_OFFENSE / RANKS_DEFENSE / TYPE_PRIOR', () => {
    expect(RANKS_OFFENSE).toEqual([1, 2, 10, 10, 1000, 1000, 100000, 100000]);
    expect(RANKS_DEFENSE).toEqual([1, 2, 5, 5, 5, 100, 10000, 10000]);
    expect(TYPE_PRIOR).toEqual([0, 0, 0, 0, 0, 3, 5, 5]);
  });
});

// ---- 17 golden cases (§12) -----------------------------------------------------------

describe('golden findThreat cases (§12)', () => {
  // #1 lone X → null
  it('lone X → no threat', () => {
    const r = analyzePosition(buildLine('X'));
    expect(p1(r)).toHaveLength(0);
  });

  // #2 ?OXXO? dead pair → null
  it('OXXO (dead pair) → no threat', () => {
    const r = analyzePosition(buildLine('OXXO'));
    expect(p1(r)).toHaveLength(0);
  });

  // #3 ?_XX_? open pair → TYPE_POTENTIAL_THREE_PAIR, mtw 5
  it('_XX_ (open pair) → THREE_PAIR mtw5', () => {
    const r = analyzePosition(buildLine('_XX_'));
    expect(p1(r)).toHaveLength(1);
    expect(p1(r)[0].type).toBe(TYPE_POTENTIAL_THREE_PAIR);
    expect(p1(r)[0].movesToWin).toBe(5);
  });

  // #4 X_X / X__X gapped pair → TYPE_POTENTIAL_THREE_SPLIT, mtw 5
  it('X_X (gapped pair) → THREE_SPLIT mtw5', () => {
    const r = analyzePosition(buildLine('X_X'));
    expect(p1(r)).toHaveLength(1);
    expect(p1(r)[0].type).toBe(TYPE_POTENTIAL_THREE_SPLIT);
    expect(p1(r)[0].movesToWin).toBe(5);
  });
  it('X__X (gapped pair) → THREE_SPLIT mtw5', () => {
    const r = analyzePosition(buildLine('X__X'));
    expect(p1(r)).toHaveLength(1);
    expect(p1(r)[0].type).toBe(TYPE_POTENTIAL_THREE_SPLIT);
    expect(p1(r)[0].movesToWin).toBe(5);
  });

  // #5 _XOXX / XXOXX (not OXOXX) → BLOCKED, blockedMtw 3; XXOXX → blockedMtw 1
  it('_XOXX → BLOCKED blockedMtw3', () => {
    const r = analyzePosition(buildLine('_XOXX'));
    const t = p1(r).find((x) => x.type === TYPE_BLOCKED);
    expect(t).toBeTruthy();
    expect(t.blockedMovesToWin).toBe(3);
  });
  it('XXOXX → BLOCKED blockedMtw1', () => {
    const r = analyzePosition(buildLine('XXOXX'));
    const t = p1(r).find((x) => x.type === TYPE_BLOCKED);
    expect(t).toBeTruthy();
    expect(t.blockedMovesToWin).toBe(1);
  });

  // #6 ?OXXXO? with outer own → BLOCKED, typeSinceBlocked=TRIA, blockedMtw1, mtw0; else null
  it('XOXXXO (outer own) → BLOCKED typeSinceBlocked=TRIA blockedMtw1 mtw0', () => {
    const r = analyzePosition(buildLine('XOXXXO'));
    const t = p1(r).find((x) => x.type === TYPE_BLOCKED);
    expect(t).toBeTruthy();
    expect(t.typeSinceBlocked).toBe(TYPE_TRIA);
    expect(t.blockedMovesToWin).toBe(1);
    expect(t.movesToWin).toBe(0);
  });
  it('OXXXO (no outer own) → no threat', () => {
    const r = analyzePosition(buildLine('OXXXO'));
    expect(p1(r)).toHaveLength(0);
  });

  // #7 ?OXXX__ → TYPE_POTENTIAL_FOUR, mtw 3
  it('OXXX__ → POTENTIAL_FOUR mtw3', () => {
    const r = analyzePosition(buildLine('OXXX__'));
    const t = p1(r).find((x) => x.type === TYPE_POTENTIAL_FOUR);
    expect(t).toBeTruthy();
    expect(t.movesToWin).toBe(3);
  });

  // #8 O_XXX_O → TYPE_POTENTIAL_FOUR, mtw 3
  it('O_XXX_O → POTENTIAL_FOUR mtw3', () => {
    const r = analyzePosition(buildLine('O_XXX_O'));
    const t = p1(r).find((x) => x.type === TYPE_POTENTIAL_FOUR);
    expect(t).toBeTruthy();
    expect(t.movesToWin).toBe(3);
  });

  // #9 ?_XXX_? open three → TYPE_TRIA, mtw 3
  it('__XXX__ (open three) → TRIA mtw3', () => {
    const r = analyzePosition(buildLine('__XXX__'));
    const t = p1(r).find((x) => x.type === TYPE_TRIA);
    expect(t).toBeTruthy();
    expect(t.movesToWin).toBe(3);
  });

  // #10 OXXXXO → BLOCKED, typeSinceBlocked=TRIA, blockedMtw 1
  it('OXXXXO → BLOCKED typeSinceBlocked=TRIA blockedMtw1', () => {
    const r = analyzePosition(buildLine('OXXXXO'));
    const t = p1(r).find((x) => x.type === TYPE_BLOCKED);
    expect(t).toBeTruthy();
    expect(t.typeSinceBlocked).toBe(TYPE_TRIA);
    expect(t.blockedMovesToWin).toBe(1);
  });

  // #11 XX__XX → TYPE_POTENTIAL_FOUR, mtw 3
  it('XX__XX → POTENTIAL_FOUR mtw3', () => {
    const r = analyzePosition(buildLine('XX__XX'));
    const t = p1(r).find((x) => x.type === TYPE_POTENTIAL_FOUR);
    expect(t).toBeTruthy();
    expect(t.movesToWin).toBe(3);
  });

  // #12 solid four open both ends → TYPE_OPEN_FOUR, mtw 1
  it('__XXXX__ (solid four, open both) → OPEN_FOUR mtw1', () => {
    const r = analyzePosition(buildLine('__XXXX__'));
    const t = p1(r).find((x) => x.type === TYPE_OPEN_FOUR);
    expect(t).toBeTruthy();
    expect(t.movesToWin).toBe(1);
  });

  // #13 solid four open one end → TYPE_CLOSED_FOUR, mtw 1
  it('OXXXX_ (solid four, open one) → CLOSED_FOUR mtw1', () => {
    const r = analyzePosition(buildLine('OXXXX_'));
    const t = p1(r).find((x) => x.type === TYPE_CLOSED_FOUR);
    expect(t).toBeTruthy();
    expect(t.movesToWin).toBe(1);
  });

  // #14 X_XXX_X → two TYPE_CLOSED_FOUR (split fires twice)
  it('X_XXX_X → two CLOSED_FOUR', () => {
    const r = analyzePosition(buildLine('X_XXX_X'));
    const fours = p1(r).filter((x) => x.type === TYPE_CLOSED_FOUR);
    expect(fours).toHaveLength(2);
  });

  // #15 X_XX_X → two TYPE_TRIA (open threes)
  it('X_XX_X → two TRIA', () => {
    const r = analyzePosition(buildLine('X_XX_X'));
    const trias = p1(r).filter((x) => x.type === TYPE_TRIA);
    expect(trias).toHaveLength(2);
  });

  // #16 X___X, 0X_X, 0X__X → intentionally NOT threats.
  //
  // X___X: three empty gaps between the two stones — the left/right scan stops at the 3rd gap
  // before reaching the far stone, so myLen stays 1 → null (genuine empty gaps).
  //
  // 0X_X / 0X__X: the spec's leading `0` here denotes an OPPONENT-adjacent block, NOT an empty
  // cell. The desktop author's own comment ("0X_X or 0X__X, don't worry about it") sits exactly
  // on the gapped-pair `moves[1]==op → return null` branch (Line.java), which is the only path
  // that makes these null. An EMPTY-left gapped pair (`_X_X`) is byte-for-byte golden #4 above
  // (X_X → THREE_SPLIT); the faithful port confirms it is a threat, so the `0` cannot mean
  // empty without contradicting #4. We therefore transcribe #16 as the opponent-blocked case,
  // where the port correctly returns null.
  it('X___X → no threat', () => {
    expect(p1(analyzePosition(buildLine('X___X')))).toHaveLength(0);
  });
  it('OX_X (opponent-blocked gapped pair) → no threat', () => {
    expect(p1(analyzePosition(buildLine('OX_X')))).toHaveLength(0);
  });
  it('OX__X (opponent-blocked gapped pair) → no threat', () => {
    expect(p1(analyzePosition(buildLine('OX__X')))).toHaveLength(0);
  });

  // #17a X·OO_ (findCaps) → TYPE_POTENTIAL_CAPTURE by p, captureMove=c3
  it('X O O _ → POTENTIAL_CAPTURE with captureMove at the empty square', () => {
    // row 9: X@col6(P1), O@col7(P2), O@col8(P2), empty@col9. Flank stone X can capture.
    const X = 9 * W + 6;
    const O1 = 9 * W + 7;
    const O2 = 9 * W + 8;
    const cap = 9 * W + 9;
    const filler = fillerPos(0); // P1 parity filler at idx2
    // moves: X(idx0,P1) O1(idx1,P2) filler(idx2,P1) O2(idx3,P2)
    const input = buildRaw(
      [
        { pos: X, color: 1 },
        { pos: O1, color: 2 },
        { pos: O2, color: 2 },
        { pos: filler, color: 1 },
      ],
      [X, O1, filler, O2],
    );
    const r = analyzePosition(input);
    const t = p1(r).find((x) => x.type === TYPE_POTENTIAL_CAPTURE);
    expect(t).toBeTruthy();
    expect(t.captureMove).toBe(cap);
    expect(t.cells.sort((a, b) => a - b)).toEqual([O1, O2]);
  });

  // #17b _XX_ (findCaps) → exposed pair in pairs[op], TYPE_POTENTIAL_THREE_PAIR
  it('_XX_ → exposed pair recorded for the opponent', () => {
    const r = analyzePosition(buildLine('_XX_'));
    const pr = pairsP2(r).find((x) => x.type === TYPE_POTENTIAL_THREE_PAIR);
    expect(pr).toBeTruthy();
  });
});

// ---- edge-of-board non-wrap (columns A and T) ----------------------------------------

describe('edge-of-board line non-wrap (isValidPosition row-wrap guard)', () => {
  // Right edge (column T = 18): a horizontal step from col 18 lands on col 0 of the NEXT
  // row. A bare bounds check would treat (9,18) and (10,0) as adjacent (Δpos = 1) and forge
  // a pair; the row-wrap guard must reject it.
  it('column T: (9,18) and (10,0) do not form a wrapped pair', () => {
    const a = 9 * W + 18;
    const b = 10 * W + 0;
    const filler = fillerPos(0);
    const r = analyzePosition(
      buildRaw(
        [
          { pos: a, color: 1 },
          { pos: b, color: 1 },
          { pos: filler, color: 2 },
        ],
        [a, filler, b],
      ),
    );
    expect(p1(r)).toHaveLength(0);
  });

  // Left edge (column A = 0): a horizontal step from col 0 going left lands on col 18 of the
  // PREVIOUS row. (9,0) and (8,18) must not form a wrapped pair.
  it('column A: (9,0) and (8,18) do not form a wrapped pair', () => {
    const a = 9 * W + 0;
    const b = 8 * W + 18;
    const filler = fillerPos(0);
    const r = analyzePosition(
      buildRaw(
        [
          { pos: a, color: 1 },
          { pos: b, color: 1 },
          { pos: filler, color: 2 },
        ],
        [a, filler, b],
      ),
    );
    expect(p1(r)).toHaveLength(0);
  });

  // Sanity: the guard is not over-eager. A same-column VERTICAL step at edge column T (18)
  // does NOT wrap (oldX == newX == 18), so a vertical open pair at column 18 is still detected.
  // (A horizontal pair flush against the wall, by contrast, is correctly null via the Line
  // wall-check moves[len-2]==WALL — that is expected, not a bug.)
  it('column T: a vertical pair in the edge column is still detected (guard not over-eager)', () => {
    const r = analyzePosition(buildLine('_XX_', { dir: 'v', row: 8, col: 18 })); // rows 9,10 @ col 18
    expect(p1(r).length).toBeGreaterThan(0);
  });
});

// ---- captured-stone filter (c != (i%2)+1) --------------------------------------------

describe('captured-stone filter (§9.1)', () => {
  // A middle stone was played (in the move list) but later captured: the board no longer
  // holds its colour, so it is skipped. X (captured) X collapses to a gapped pair (SPLIT),
  // NOT a solid three (TRIA).
  it('captured middle stone is excluded → X_X split, not a tria', () => {
    const A = 9 * W + 7;
    const B = 9 * W + 8; // captured: present in moves, board reads empty
    const C = 9 * W + 9;
    const f0 = fillerPos(0);
    const f1 = fillerPos(1);
    // moves: A(0,P1) f0(1,P2) B(2,P1→board 0) f1(3,P2) C(4,P1)
    const input = buildRaw(
      [
        { pos: A, color: 1 },
        { pos: C, color: 1 },
        { pos: f0, color: 2 },
        { pos: f1, color: 2 },
        // B intentionally absent from the board (captured)
      ],
      [A, f0, B, f1, C],
    );
    const r = analyzePosition(input);
    expect(p1(r).some((t) => t.type === TYPE_POTENTIAL_THREE_SPLIT)).toBe(true);
    expect(p1(r).some((t) => t.type === TYPE_TRIA)).toBe(false);
  });

  // Control: same three stones all present → solid TRIA (proves the filter is the cause).
  it('control: middle stone present → tria', () => {
    const A = 9 * W + 7;
    const B = 9 * W + 8;
    const C = 9 * W + 9;
    const f0 = fillerPos(0);
    const f1 = fillerPos(1);
    const input = buildRaw(
      [
        { pos: A, color: 1 },
        { pos: B, color: 1 },
        { pos: C, color: 1 },
        { pos: f0, color: 2 },
        { pos: f1, color: 2 },
      ],
      [A, f0, B, f1, C],
    );
    const r = analyzePosition(input);
    expect(p1(r).some((t) => t.type === TYPE_TRIA)).toBe(true);
  });
});

// ---- empty board ---------------------------------------------------------------------

describe('empty board', () => {
  it('no moves → no threats, no pairs, no ranks', () => {
    const r = analyzePosition({
      game: { getPosition: () => 0, captures: [undefined, 0, 0] },
      moves: [],
      boardW: W,
      boardH: H,
    });
    expect(r.threats).toHaveLength(0);
    expect(r.pairs).toHaveLength(0);
    expect(r.ranks).toHaveLength(0);
  });
});

// ---- vertical orientation sanity (scan is not horizontal-only) -----------------------

describe('orientation coverage', () => {
  it('a vertical open three is detected (TRIA)', () => {
    const r = analyzePosition(buildLine('__XXX__', { dir: 'v', row: 6, col: 9 }));
    expect(p1(r).some((t) => t.type === TYPE_TRIA)).toBe(true);
  });
});
