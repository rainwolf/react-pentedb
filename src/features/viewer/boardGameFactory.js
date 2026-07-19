// Builds a replayed GameClass instance for the board view from a variant id + move list, and
// derives per-player capture scores from it. GameClass is the single source of truth for board
// state, captures, and side-to-move (Task 2 contract); the viewer never re-implements rules.
import { Game, GameState } from '../../game/GameClass';

// A GameClass replayed through `moves`, marked STARTED so currentColor()/hover behave as in a
// live game. Cheap (a handful of addMove calls); callers memoize on the move list.
export function buildBoardGame(gameId, moves) {
  const g = new Game();
  g.setGame(gameId);
  g.gameState = { ...g.gameState, state: GameState.State.STARTED };
  (moves || []).forEach((m) => g.addMove(m));
  return g;
}

// Stones each colour has captured off the opponent (Pente scoring): colour c's score is the
// number of opponent (3-c) stones removed, which GameClass accumulates in captures[3-c]
// (captures is indexed by the CAPTURED stone's colour — see winCheck.test.js fixtures).
export function capturesByColor(game) {
  if (!game || !game.captures) return { 1: 0, 2: 0 };
  return { 1: game.captures[2] || 0, 2: game.captures[1] || 0 };
}
