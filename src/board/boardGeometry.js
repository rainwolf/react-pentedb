// Board geometry + the game-id -> variant partition. This knowledge was scattered inside
// Board.js's render (a 13-branch style chain, the gridsize block, the star-point/circle
// placement) with the gridsize half duplicated in GameClass.setGame and the variant
// partition duplicated again in TableClass. Concentrating the game-id range logic here gives
// one tested home for the geometry and the canonical variant key.
//
// This is NOT the only place that switches on the game-id range: GameClass's per-variant
// replay dispatch and Utils.game_name (which sub-divides Go by board size) carry their own
// coarser/finer groupings on the same axis and are intentionally left out.
//
// Special-point "part" codes match BoardSquare: 51 = circle marker (non-go boards),
// 52 = star dot (go boards).

// The board grid size for a game: 9x9 and 13x13 only for the small Go variants, 19x19
// everywhere else. Used by both GameClass.setGame and Board.
export function gridSizeForGame(gameId) {
  if (gameId === 21 || gameId === 22) return 9;
  if (gameId === 23 || gameId === 24) return 13;
  if (gameId === 31 || gameId === 32 || gameId === 81) return 15;
  return 19;
}

// The canonical variant identity for a game id (range-keyed, lowest id first). The board CSS
// class IS this key (boardStyleClass), and TableClass looks up the lobby table-card colour
// (table_color) and the capture check (gameHasCaptures) from it — so style/colour/captures
// share one partition instead of re-deriving the same boundaries three times.
export function variantKey(gameId) {
  if (gameId < 3) return 'pente';
  if (gameId < 5) return 'keryo-pente';
  if (gameId < 7) return 'gomoku';
  if (gameId < 9) return 'd-pente';
  if (gameId < 11) return 'g-pente';
  if (gameId < 13) return 'poof-pente';
  if (gameId < 15) return 'connect6';
  if (gameId < 17) return 'boat-pente';
  if (gameId < 19) return 'dk-pente';
  if (gameId < 25) return 'go';
  if (gameId < 27) return 'o-pente';
  if (gameId < 29) return 'swap2-pente';
  if (gameId === 31 || gameId === 32 || gameId === 81) return 'renju';
  return 'swap2-keryo';
}

// The board's CSS class for a variant — the variant key doubles as the class name.
export const boardStyleClass = variantKey;

// The selectable game variants: the 15 "standard" (odd) game ids, one per variant (Go's
// three board sizes are three of them). Even ids are the "Speed" timing pair of the
// preceding odd id and are not separately selectable. This is the one list the game-picker
// dropdowns iterate, so they can't drift back to offering a nonexistent id.
export const STANDARD_GAME_IDS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];

// Is this game id a Go board (19..24)? The geometry definition of a go board; GameClass.isGo
// delegates here so the boundary lives in exactly one place.
export function isGoBoard(gameId) {
  return gameId > 18 && gameId < 25;
}

const CIRCLES = [120, 126, 180, 234, 240]; // non-go boards
// The star-dot layout is purely a function of the board grid size, so key the table by it
// (reusing gridSizeForGame) rather than re-deriving the id grouping.
const GO_DOTS = {
  19: [60, 66, 72, 174, 180, 186, 288, 294, 300], // 19x19 (games 19, 20)
  9: [20, 24, 40, 56, 60], // 9x9 (games 21, 22)
  13: [42, 45, 48, 81, 84, 87, 120, 123, 126], // 13x13 (games 23, 24)
};

// The marked board points for a variant: circles (part 51) on the non-go boards, star dots
// (part 52) on the go boards. Returns [{index, part}] so the caller stamps board[index].part.
export function boardSpecialPoints(gameId) {
  if (gameId === 31 || gameId === 32 || gameId === 81) {
    // 9 star points at cols/rows {3,7,11} on the 15x15 board (index = col + row*15; center 112).
    // Use the go-style dot (part 52); the non-go CIRCLES are 19x19-specific.
    return [48, 52, 56, 108, 112, 116, 168, 172, 176].map((index) => ({ index, part: 52 }));
  }
  if (!isGoBoard(gameId)) {
    return CIRCLES.map((index) => ({ index, part: 51 }));
  }
  return GO_DOTS[gridSizeForGame(gameId)].map((index) => ({ index, part: 52 }));
}
