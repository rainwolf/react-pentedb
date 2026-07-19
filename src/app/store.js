// Redux store: the document-tabs model, a `ui` slice placeholder (a later task fleshes
// it out — filter drafts, panel layout, selection), and the RTK Query api slice with its
// middleware. `setupListeners` enables refetchOnFocus / refetchOnReconnect for endpoints
// that opt in.
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import docsReducer from '../model/docSlice';
import uiReducer from './uiSlice';
import aiReducer from '../features/ai/aiSlice';
import { api } from './api';

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
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

setupListeners(store.dispatch);
