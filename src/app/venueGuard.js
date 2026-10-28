// Store-level invariant: the applied filters' per-variant venue fields (site/event/round/section)
// are dropped whenever the ACTIVE tab's game changes - by any path (tab switch, opening a game,
// /g/:gid, switchToVariant) and whether or not FilterForm is mounted. Chips and requests both read
// the store, so they can never show/send another variant's site.
import { syncFiltersGame } from './uiSlice';

function activeGame(state) {
  const d = state.docs;
  if (!d) return null;
  const t = d.tabs.find((x) => x.id === d.activeTabId);
  return t && t.game != null ? t.game : null;
}

export const venueGuard = (storeApi) => (next) => (action) => {
  const result = next(action);
  const state = storeApi.getState();
  if (state.ui) {
    const g = activeGame(state);
    if (g != null && g !== state.ui.filtersGame) storeApi.dispatch(syncFiltersGame(g));
  }
  return result;
};
