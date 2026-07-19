// Redux store: the document-tabs model, a `ui` slice placeholder (a later task fleshes
// it out — filter drafts, panel layout, selection), and the RTK Query api slice with its
// middleware. `setupListeners` enables refetchOnFocus / refetchOnReconnect for endpoints
// that opt in.
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import docsReducer from '../model/docSlice';
import { api } from './api';

// Placeholder UI slice — intentionally empty; later tasks add reducers/actions.
const uiSlice = createSlice({ name: 'ui', initialState: {}, reducers: {} });
export const uiReducer = uiSlice.reducer;

export const store = configureStore({
  reducer: {
    docs: docsReducer,
    ui: uiReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

setupListeners(store.dispatch);
