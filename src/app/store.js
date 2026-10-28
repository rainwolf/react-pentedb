// Redux store: the document-tabs model, a `ui` slice placeholder (a later task fleshes
// it out — filter drafts, panel layout, selection), and the RTK Query api slice with its
// middleware. `setupListeners` enables refetchOnFocus / refetchOnReconnect for endpoints
// that opt in.
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import docsReducer, { selectActivePosition } from '../model/docSlice';
import { toWire } from '../model/gameTree';
import uiReducer from './uiSlice';
import aiReducer from '../features/ai/aiSlice';
import { api } from './api';
import { subscriptionGuard } from './subscriptionGuard';
import { venueGuard } from './venueGuard';

// The ui slice + its actions/selector live in ./uiSlice so they can be imported without
// pulling in the real api slice (see uiSlice.js). Re-export for existing import sites.
export { setScope, selectScope, selectEffectiveScope } from './uiSlice';
export { uiReducer };

export const store = configureStore({
  reducer: {
    docs: docsReducer,
    ui: uiReducer,
    ai: aiReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware, subscriptionGuard, venueGuard),
});

setupListeners(store.dispatch);

// --- E2E test hook (dev builds only) -------------------------------------------------------
// The Playwright suite (e2e/) reads the live document model through this hook to assert things
// the DOM cannot express cheaply — e.g. an analysis tree's structural equality across a
// save+reload+reopen, compared in id-stripped `toWire` form (fromWire reassigns node ids, so a
// raw deep-equal of the in-memory trees would spuriously differ). Gated on `import.meta.env.DEV`
// so `rsbuild build` dead-code-eliminates it from production bundles; it never runs for real
// users. Read-only: exposes selectors, never dispatches.
if (typeof window !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  window.__PENTEDB__ = {
    store,
    // The active document's canonical position: { game, moves, cursorPath } (or null).
    activePos() {
      return selectActivePosition(store.getState());
    },
    // The active tab's variation tree in id-stripped wire form (or null) — stable across a
    // save/reload round-trip, so specs can assert structural equality.
    activeTreeWire() {
      const d = store.getState().docs;
      const tab = d.tabs.find((t) => t.id === d.activeTabId);
      return tab ? toWire(tab.tree) : null;
    },
  };
}
