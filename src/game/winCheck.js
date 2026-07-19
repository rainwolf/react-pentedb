// Client-side win/game-over detection for the analysis workbench.
//
// WHY THIS EXISTS: the copied `GameClass` has ZERO win detection — in the live room the
// server is authoritative and the client only renders. The workbench replays lines locally
// (play-vs-AI, analysis banners) and must decide "is this line over, and who won" itself.
//
// It is built strictly on top of GameClass's own replayed state: the derived board
// (`abstractBoard`, for n-in-a-row) and the capture counters (`captures`, for threshold
// wins). Nothing here re-implements the capture rules; it only reads what GameClass computed.
//
// SCOPE (v1): row wins and capture-threshold wins only. Renju forbidden-point auto-loss
// (double-three / double-four / overline for black) is NOT modelled — a Renju overline of
// six here is simply reported as a normal 5+ row win, and forbidden moves are not flagged.
// Go scoring is out of scope (returns "not over"). Both are noted deliberately.
import { Game } from './GameClass';
import { variantKey, gridSizeForGame, isGoBoard } from '../board/boardGeometry';

// Capture-win thresholds are counted in *stones removed from the board*. Each Pente bracket
// capture removes a pair (2 stones); each Keryo capture can remove a pair or a tria (3).
// GameClass stores removed stones as `captures[colourRemoved]`, so the capturing colour
// (3 - colourRemoved) has won once that counter reaches the threshold.
//
// The Keryo family membership mirrors GameClass.critical_captures's own grouping (game ids
// 3/4, 17/18, 25/26 => keryo-pente, dk-pente, o-pente), which all run the keryo tria-capture
// engine and share the 15-stone target. Everything else that captures is a Pente-family
// pair-capture variant with a 10-stone target.
const KERYO_FAMILY = new Set(['keryo-pente', 'dk-pente', 'swap2-keryo', 'o-pente']);
const PENTE_FAMILY = new Set(['pente', 'd-pente', 'g-pente', 'poof-pente', 'boat-pente', 'swap2-pente']);

// Stones-captured threshold for a capture win, or null for variants with no capture win
// (Gomoku, Connect6, Renju, Go).
export function captureThreshold(gameId) {
  const key = variantKey(gameId);
  if (KERYO_FAMILY.has(key)) return 15;
  if (PENTE_FAMILY.has(key)) return 10;
  return null;
}

// Length of an in-a-row win: Connect6 (ids 13/14) needs six; everything else needs five.
function winLength(gameId) {
  return variantKey(gameId) === 'connect6' ? 6 : 5;
}

// Four scan directions; each maximal run is inspected once by only starting a count where
// the preceding cell in that direction breaks the run.
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [-1, 1]];

function rowWinner(board, size, need) {
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const v = board[x][y];
      if (v !== 1 && v !== 2) continue;
      for (const [dx, dy] of DIRECTIONS) {
        const px = x - dx;
        const py = y - dy;
        if (px >= 0 && px < size && py >= 0 && py < size && board[px][py] === v) continue; // mid-run
        let n = 0;
        let cx = x;
        let cy = y;
        while (cx >= 0 && cx < size && cy >= 0 && cy < size && board[cx][cy] === v) {
          n += 1;
          cx += dx;
          cy += dy;
        }
        if (n >= need) return v;
      }
    }
  }
  return 0;
}

// Evaluate whether a line is over.
//   gameId — numeric variant id (as understood by GameClass / boardGeometry)
//   moves  — array of flat board-index moves in play order (variations already flattened)
// Returns { over, winner /* 0 | 1 | 2 */, reason /* 'row' | 'captures' | null */ }, where
// `winner` is the board colour value (1 or 2) that GameClass assigns to that player's stones.
export function evaluateGame(gameId, moves) {
  const notOver = { over: false, winner: 0, reason: null };

  // Go: win is by territory score, not modelled here.
  if (isGoBoard(gameId)) return notOver;

  const game = new Game();
  game.setGame(gameId);
  (moves || []).forEach((m) => game.addMove(m));

  const size = gridSizeForGame(gameId);

  // 1. n-in-a-row.
  const rowWin = rowWinner(game.abstractBoard, size, winLength(gameId));
  if (rowWin) return { over: true, winner: rowWin, reason: 'row' };

  // 2. capture threshold (only for variants that have capture wins).
  const threshold = captureThreshold(gameId);
  if (threshold != null) {
    if (game.captures[2] >= threshold) return { over: true, winner: 1, reason: 'captures' };
    if (game.captures[1] >= threshold) return { over: true, winner: 2, reason: 'captures' };
  }

  return notOver;
}
