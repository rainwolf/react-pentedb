// Transient UI state for the live Renju opening. Sits beside `modals` as a no-op-by-default
// sub-slice (same reference returned for unrelated actions). It does double duty: suppresses
// the decision modal (open gate) and arms the board — `placing` routes board taps to a
// renjuSwap(swap:false) decline/Branch-A move, `offering` accumulates the 10-pick selection.
// On SENDING a decision the UI goes to `pending` (modal + board both suppressed); it returns
// to idle ONLY when a server echo advances the opening (ADVANCING_EVENTS) — so the UI never
// changes except in response to the server, and the choice modal can't flash back up in the
// gap between the click and the echo. Cancel / table-exit reset it too.

const BEGIN_PLACE = 'RENJU_UI/BEGIN_PLACE';
const BEGIN_OFFER = 'RENJU_UI/BEGIN_OFFER';
const TOGGLE_PICK = 'RENJU_UI/TOGGLE_PICK';
const MARK_PENDING = 'RENJU_UI/MARK_PENDING';
const RESET = 'RENJU_UI/RESET';

// Server echoes that advance the opening (or end / reset the table, or reject a decision).
// Receiving any of these means a pending decision/move was applied (or rejected, or the game
// was reset), so the transient UI resets to idle and lets the (now-updated) phase decide what
// shows next — keeping the opening UI strictly server-driven. The game/table-reset events and
// the move-error event are included so a mid-opening mode can't leak into the next game and a
// server rejection unlocks `pending`.
const ADVANCING_EVENTS = new Set([
  'dsgMoveTableEvent',
  'dsgSwapSeatsTableEvent',
  'dsgRenjuTaraguchiSwapTableEvent',
  'dsgRenjuTaraguchiOffer10TableEvent',
  'dsgRenjuTaraguchi10Select1TableEvent',
  'dsgGameStateTableEvent',
  'dsgChangeStateTableEvent',
  'dsgMoveTableErrorEvent',
  'dsgExitTableEvent',
  'dsgBootTableEvent',
]);

export const renjuBeginPlace = () => ({ type: BEGIN_PLACE });
export const renjuBeginOffer = () => ({ type: BEGIN_OFFER });
export const renjuTogglePick = (move) => ({ type: TOGGLE_PICK, move });
export const renjuMarkPending = () => ({ type: MARK_PENDING });
export const renjuResetOpeningUi = () => ({ type: RESET });

export const INITIAL = { mode: 'idle', picks: [] };

export function renjuOpeningUiReducer(state = INITIAL, action) {
  switch (action.type) {
    case BEGIN_PLACE:
      return { mode: 'placing', picks: [] };
    case BEGIN_OFFER:
      return { mode: 'offering', picks: [] };
    case TOGGLE_PICK: {
      if (state.mode !== 'offering') return state;
      const picks = state.picks.includes(action.move)
        ? state.picks.filter((m) => m !== action.move)
        : [...state.picks, action.move];
      return { ...state, picks };
    }
    case MARK_PENDING:
      // a decision/move was just SENT; suppress the modal + board until the server echoes back
      return { mode: 'pending', picks: [] };
    case RESET:
      return state.mode === 'idle' && state.picks.length === 0 ? state : INITIAL;
    default:
      if (ADVANCING_EVENTS.has(action.type)) {
        return state.mode === 'idle' && state.picks.length === 0 ? state : INITIAL;
      }
      return state;
  }
}
