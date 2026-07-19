import {variantKey, gridSizeForGame} from "../board/boardGeometry";

// Display name per variant, keyed by the canonical variantKey so the game-id range partition
// is not re-encoded here. Go is the only variant with board-size variants, so its name is
// looked up by gridSizeForGame rather than a flat key. An even game id is the "Speed" timing
// variant of the preceding odd id.
const VARIANT_NAMES = {
   'pente': 'Pente',
   'keryo-pente': 'Keryo-Pente',
   'gomoku': 'Gomoku',
   'd-pente': 'D-Pente',
   'g-pente': 'G-Pente',
   'poof-pente': 'Poof-Pente',
   'connect6': 'Connect6',
   'boat-pente': 'Boat-Pente',
   'dk-pente': 'DK-Pente',
   'o-pente': 'O-Pente',
   'swap2-pente': 'Swap2-Pente',
   'swap2-keryo': 'Swap2-Keryo',
   'renju': 'Renju',
};

const GO_NAMES = {
   19: 'Go',
   9: 'Go (9x9)',
   13: 'Go (13x13)',
};

export function game_name(g) {
   const key = variantKey(g);
   const base = key === 'go' ? GO_NAMES[gridSizeForGame(g)] : VARIANT_NAMES[key];
   return g % 2 === 0 ? 'Speed ' + base : base;
}
