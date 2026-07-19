// The variant game-state enums — the shared vocabulary for the per-variant phase machine.
// Lives in its own module (rather than inside the 1500-line GameClass) so the pure
// opening-phase logic can import it without an import cycle back through GameClass.
// GameClass re-exports GameState, so existing `import {GameState} from '.../GameClass'`
// call sites keep working unchanged.
export const GameState = {
  State: {
    NOT_STARTED: 1,
    STARTED: 2,
    PAUSED: 3,
    HALFSET: 4,
  },
  DPenteState: {
    NO_CHOICE: 0,
    SWAPPED: 1,
    NOT_SWAPPED: 2,
  },
  Swap2State: {
    NO_CHOICE: 0,
    SWAPPED: 1,
    NOT_SWAPPED: 2,
    SWAP2PASS: 3,
  },
  GoState: {
    PLAY: 0,
    MARK_STONES: 1,
    EVALUATE_STONES: 2,
  },
};

// Fresh Renju (Taraguchi-10) opening tracking — the client mirror of the server's
// openingComplete / awaitingSwap / branchChosen / tenOffer / offeredFifth / selectedFifth.
// A plain object (not an enum) because it accumulates several decision variables from the
// opening echoes; renjuPhase() in openingPhase.js classifies it. New object each call so
// GameClass.reset() never aliases a shared array.
export function freshRenjuTracking() {
  return { complete: false, awaitingSwap: false, branchChosen: false, tenOffer: false, offered: [], selected: null, swapTaken: false };
}
