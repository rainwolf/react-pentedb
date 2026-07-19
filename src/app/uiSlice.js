// UI slice: cross-panel view state that is not document/tab data and not server cache.
// `scope` is the Archive/Mine/Both selector (P3 Task 6): it feeds position-stats and
// games-search and is shared by the ScopeToggle, SearchPanel and ExplorerPanel so all three
// stay in lockstep. Persisted here (not local component state) precisely so the explorer's
// stats and the search list can never disagree about which corpus they are showing.
//
// This lives in its own module (not store.js) so components and tests can import the actions
// and selector without pulling in the real api slice — tests that mock '../../app/api' would
// otherwise crash when store.js references `api.reducer`.
import { createSlice } from '@reduxjs/toolkit';

const SCOPES = ['archive', 'mine', 'both'];

const uiSlice = createSlice({
  name: 'ui',
  initialState: { scope: 'archive' },
  reducers: {
    setScope(state, action) {
      if (SCOPES.includes(action.payload)) state.scope = action.payload;
    },
  },
});

export const { setScope } = uiSlice.actions;

// Defensive read: some tests build stores without the ui slice (docs-only reducers), so fall
// back to 'archive' rather than crash when `state.ui` is absent.
export function selectScope(state) {
  return (state.ui && state.ui.scope) || 'archive';
}

// The EFFECTIVE scope every consumer must query with. mine/both require auth, so a lapsed
// session (within-session logout OR expiry) must fall back to 'archive' — otherwise the stored
// scope keeps firing authed position-stats / games-search that 401 and leave the panels stuck
// on "Sign in to view this" until reload. Kept as a pure (auth, scope) function rather than a
// store selector so uiSlice stays free of any api/auth import; callers already hold both.
export function selectEffectiveScope(authName, scope) {
  return authName ? scope : 'archive';
}

export default uiSlice.reducer;
