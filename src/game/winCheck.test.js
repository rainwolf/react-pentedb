// Client-side win detection for the workbench. The copied GameClass has ZERO win/game-over
// logic (the live room is server-authoritative), so evaluateGame authors it on top of
// GameClass's replayed board (n-in-a-row) and capture counters (threshold wins).
//
// Fixtures are driven through real move sequences (GameClass.addMove), never hand-placed
// board state, so the capture counters they assert are the engine's own.
import { describe, test, expect } from 'vitest';
import { evaluateGame } from './winCheck';

const G = 19;
const cell = (x, y) => y * G + x;

// A run of standard-alternation player-1 stones, each followed by a harmless, well-spaced
// player-2 filler on the bottom edge (never 5-in-a-row, never a capture). Player-1 stones
// land on the odd move numbers, so `p1cells` are exactly player 1's moves.
function p1Line(p1cells, fillerRow = 18) {
  const moves = [];
  p1cells.forEach((c, i) => {
    moves.push(c);
    moves.push(cell(2 * i, fillerRow));
  });
  return moves;
}

// Mirror of p1Line but player 2 owns the line (player-1 gets the harmless fillers first).
function p2Line(p2cells, fillerRow = 0) {
  const moves = [];
  p2cells.forEach((c, i) => {
    moves.push(cell(2 * i, fillerRow));
    moves.push(c);
  });
  return moves;
}

// n bracket-capture blocks: player 1 captures a player-2 pair each block (+2 stones), so
// captures[2] === 2*n. Each block is 6 moves (anchor, s1, p1-filler, s2, closer, p2-filler)
// which keeps strict alternation and starts every block on a player-1 turn. Capture rows are
// spaced by 2 and fillers sit on the edges, so nothing ever forms an unintended 5-in-a-row.
function pairCaptures(n) {
  const moves = [];
  for (let k = 0; k < n; k++) {
    const r = 3 + 2 * k;
    moves.push(cell(4, r)); // P1 anchor
    moves.push(cell(5, r)); // P2 (to be captured)
    moves.push(cell(2 * k, 0)); // P1 filler (row 0, even cols -> gapped)
    moves.push(cell(6, r)); // P2 (to be captured)
    moves.push(cell(7, r)); // P1 closer -> brackets (5,r),(6,r) -> capture
    moves.push(cell(2 * k, 18)); // P2 filler (row 18, even cols -> gapped)
  }
  return moves;
}

describe('evaluateGame — n-in-a-row', () => {
  test('horizontal five is a win for player 1 (Gomoku, id 5)', () => {
    const seq = p1Line([cell(5, 5), cell(6, 5), cell(7, 5), cell(8, 5), cell(9, 5)]);
    expect(evaluateGame(5, seq)).toEqual({ over: true, winner: 1, reason: 'row' });
  });

  test('vertical five is a win', () => {
    const seq = p1Line([cell(5, 3), cell(5, 4), cell(5, 5), cell(5, 6), cell(5, 7)]);
    expect(evaluateGame(5, seq)).toEqual({ over: true, winner: 1, reason: 'row' });
  });

  test('down-right diagonal five is a win', () => {
    const seq = p1Line([cell(3, 3), cell(4, 4), cell(5, 5), cell(6, 6), cell(7, 7)]);
    expect(evaluateGame(5, seq)).toEqual({ over: true, winner: 1, reason: 'row' });
  });

  test('down-left (anti-)diagonal five is a win', () => {
    const seq = p1Line([cell(7, 3), cell(6, 4), cell(5, 5), cell(4, 6), cell(3, 7)]);
    expect(evaluateGame(5, seq)).toEqual({ over: true, winner: 1, reason: 'row' });
  });

  test('a five belonging to player 2 reports winner 2', () => {
    const seq = p2Line([cell(5, 10), cell(6, 10), cell(7, 10), cell(8, 10), cell(9, 10)]);
    expect(evaluateGame(5, seq)).toEqual({ over: true, winner: 2, reason: 'row' });
  });

  test('four in a row is NOT a win', () => {
    const seq = p1Line([cell(5, 5), cell(6, 5), cell(7, 5), cell(8, 5)]);
    expect(evaluateGame(5, seq)).toEqual({ over: false, winner: 0, reason: null });
  });
});

describe('evaluateGame — Connect6 needs six (ids 13/14)', () => {
  // Connect6 seating: player 1 plays move 1, then each side plays two per turn — player 1
  // owns move-lengths {1,4,5,8,9,12,...}. Feed p1cells onto those turns, fillers elsewhere.
  function connect6Seq(p1cells) {
    const moves = [];
    let pi = 0;
    let fi = 0;
    while (pi < p1cells.length) {
      const len = moves.length + 1;
      const seat = len % 4 === 1 || len % 4 === 0 ? 1 : 2;
      if (seat === 1) moves.push(p1cells[pi++]);
      else moves.push(cell(2 * fi++, 18));
    }
    return moves;
  }

  test('six in a row is a win', () => {
    const line = [cell(5, 5), cell(6, 5), cell(7, 5), cell(8, 5), cell(9, 5), cell(10, 5)];
    expect(evaluateGame(13, connect6Seq(line))).toEqual({ over: true, winner: 1, reason: 'row' });
  });

  test('five in a row is NOT a win for Connect6', () => {
    const line = [cell(5, 5), cell(6, 5), cell(7, 5), cell(8, 5), cell(9, 5)];
    expect(evaluateGame(13, connect6Seq(line))).toEqual({ over: false, winner: 0, reason: null });
  });
});

describe('evaluateGame — capture thresholds', () => {
  test('Pente (id 1): 5th captured pair (10 stones) wins', () => {
    expect(evaluateGame(1, pairCaptures(5))).toEqual({ over: true, winner: 1, reason: 'captures' });
  });

  test('Pente: 4 captured pairs (8 stones) is not yet a win', () => {
    expect(evaluateGame(1, pairCaptures(4))).toEqual({ over: false, winner: 0, reason: null });
  });

  test('Keryo (id 3): 5 pairs (10 stones) is NOT a win — threshold is 15', () => {
    expect(evaluateGame(3, pairCaptures(5))).toEqual({ over: false, winner: 0, reason: null });
  });

  test('Keryo (id 3): 8 pairs (16 stones) crosses the 15-stone threshold', () => {
    expect(evaluateGame(3, pairCaptures(8))).toEqual({ over: true, winner: 1, reason: 'captures' });
  });

  test('a would-be five broken by a capture is not a win', () => {
    // Player 2 plays five collinear cells on row 10, but the middle pair (5,10),(6,10) is
    // bracketed and captured by player 1 before the line completes, leaving 4,7 (P1) and
    // 8,9 (P2) — no five, only 2 stones captured (< 10).
    const seq = [
      cell(4, 10), // P1 anchor
      cell(5, 10), // P2
      cell(0, 0), // P1 filler
      cell(6, 10), // P2
      cell(7, 10), // P1 closer -> captures (5,10),(6,10)
      cell(8, 10), // P2
      cell(2, 0), // P1 filler
      cell(9, 10), // P2
    ];
    expect(evaluateGame(1, seq)).toEqual({ over: false, winner: 0, reason: null });
  });
});
