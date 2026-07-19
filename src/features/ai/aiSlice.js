// aiSlice — UI state for the AI advisor panel (P4 Task 2). Deliberately holds only *state*:
// the async engine call lives in aiClient (the worker seam) and is orchestrated by AiPanel,
// which dispatches these plain actions across the request lifecycle. Keeping the thunking out
// of the slice keeps it pure/serialisable and lets tests drive it by dispatching directly.
//
// The suggestion + thinking flags are shared across two disjoint subtrees of the workbench —
// the AiPanel (right rail) produces them; BoardPane (centre) renders the ghost and locks the
// board from them — so they must live in the store rather than component state.
//
// NOTE (wasm-ai-contract.md §6): the engine exposes only getAIMove. There is no evaluation
// score / thinking feed to hold here — do NOT add one. Copy says "suggestion", not "eval".
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  level: 2, // engine search level 1..12
  openingBook: false, // forwarded to requestMove as openingBook 0|1
  status: 'idle', // 'idle' | 'thinking' | 'error' — single in-flight; 'thinking' locks the board
  error: null, // user-visible message when status === 'error'
  // A Hint suggestion, bound to the position it was computed for: { game, cells, sig } — 1 cell,
  // or 2 for a Connect6 pair. `sig` is positionSig() of the request's line; the ghost + chip only
  // render while the active position still matches it, so navigating away can't play a stale cell.
  suggestion: null,
  play: { on: false, aiPlayer: 2 }, // play-vs-AI: aiPlayer 1 (moves first) | 2 (moves second)
};

// The identity of a board position a suggestion was computed for: variant + the exact line to the
// cursor. A suggestion is valid only while the active position still equals this; after any
// navigation (navNext/navPrev/node click) the ghost + clickable chip must vanish so an old cell is
// never appended onto a different position (onPlaySuggestion has no legality check).
export function positionSig(pos) {
  return pos ? `${pos.game}:${(pos.moves || []).join('-')}` : '';
}

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    setLevel(state, action) {
      state.level = action.payload;
    },
    setOpeningBook(state, action) {
      state.openingBook = !!action.payload;
    },
    setPlayOn(state, action) {
      state.play.on = !!action.payload;
    },
    setAiPlayer(state, action) {
      state.play.aiPlayer = action.payload;
    },
    // Request lifecycle. thinkingStarted clears any stale suggestion/error so the board never
    // shows a ghost from a superseded request while a new one is running.
    thinkingStarted(state) {
      state.status = 'thinking';
      state.error = null;
      state.suggestion = null;
    },
    suggestionReceived(state, action) {
      state.status = 'idle';
      state.suggestion = action.payload; // { game, cells }
    },
    // A play-vs-AI reply was applied into the tree — clear the busy flag, leave no ghost.
    requestSettled(state) {
      state.status = 'idle';
    },
    requestFailed(state, action) {
      state.status = 'error';
      state.error = action.payload;
      state.suggestion = null;
    },
    // A cancelled request is intentional (navigation / tab switch): return to idle silently,
    // never surfacing an error.
    requestCancelled(state) {
      state.status = 'idle';
      state.error = null;
    },
    clearSuggestion(state) {
      state.suggestion = null;
    },
    clearError(state) {
      state.error = null;
    },
    resetAi() {
      return initialState;
    },
  },
});

export const {
  setLevel,
  setOpeningBook,
  setPlayOn,
  setAiPlayer,
  thinkingStarted,
  suggestionReceived,
  requestSettled,
  requestFailed,
  requestCancelled,
  clearSuggestion,
  clearError,
  resetAi,
} = aiSlice.actions;

// Selectors are defensive about a missing `ai` slice: BoardPane consumes them, and some
// board/viewer tests build a store with only the `docs` reducer. A missing slice reads as
// "no AI activity" rather than throwing.
export const selectAi = (s) => s.ai || initialState;
export const selectAiSuggestion = (s) => (s.ai ? s.ai.suggestion : null);
export const selectAiThinking = (s) => (s.ai ? s.ai.status === 'thinking' : false);
export const selectAiError = (s) => (s.ai ? s.ai.error : null);
export const selectAiPlay = (s) => (s.ai ? s.ai.play : initialState.play);

export default aiSlice.reducer;
