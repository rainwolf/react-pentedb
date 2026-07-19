// Personal-collection tests (P3 Task 6, brief Step 1):
//   - CollectionList mirrors ResultsList for useCollectionQuery rows (source "mine"), plus a
//     per-row delete that confirms then calls useDeleteCollectionGameMutation(wgid).
//   - CollectionList is auth-gated: anonymous users see a sign-in hint and the query is
//     skipped (no 401 fired); a query error surfaces a visible message (the P2 pickup).
//   - ScopeToggle shows Archive/Mine/Both only when logged in and writes the ui slice.
//   - panelErrorMessage turns the JsonHttp error envelope into a human string.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer from '../../model/docSlice';
import uiReducer from '../../app/uiSlice';

vi.mock('../../app/api', () => ({
  usePingQuery: vi.fn(),
  useCollectionQuery: vi.fn(),
  useCollectionGameQuery: vi.fn(),
  useDeleteCollectionGameMutation: vi.fn(),
  useGameQuery: vi.fn(),
}));

// eslint-disable-next-line import/first
import {
  usePingQuery,
  useCollectionQuery,
  useCollectionGameQuery,
  useDeleteCollectionGameMutation,
  useGameQuery,
} from '../../app/api';
// eslint-disable-next-line import/first
import CollectionList from './CollectionList';
// eslint-disable-next-line import/first
import ScopeToggle from './ScopeToggle';
// eslint-disable-next-line import/first
import { panelErrorMessage } from '../../shell/PanelError';

const theme = createTheme();

const MINE = {
  gid: 5001,
  source: 'mine',
  game: 1,
  player1: { name: 'alice', rating: 1800 },
  player2: { name: 'bob', rating: 1700 },
  winner: 1,
  site: 'Pente.org',
  event: 'Imported',
  moveCount: 12,
};

function makeStore() {
  return configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
}

function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
    </Provider>
  );
}

const deleteTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({ ok: true }) }));

beforeEach(() => {
  usePingQuery.mockReset();
  useCollectionQuery.mockReset();
  useCollectionGameQuery.mockReset();
  useDeleteCollectionGameMutation.mockReset();
  useGameQuery.mockReset();
  usePingQuery.mockReturnValue({ data: { auth: 'iostest' } });
  useCollectionQuery.mockReturnValue({ data: { total: 0, games: [] }, isFetching: false, error: undefined });
  useCollectionGameQuery.mockReturnValue({ data: undefined });
  useGameQuery.mockReturnValue({ data: undefined });
  deleteTrigger.mockClear();
  useDeleteCollectionGameMutation.mockReturnValue([deleteTrigger, { isLoading: false }]);
});

afterEach(() => cleanup());

// ===================================================================================
// panelErrorMessage — the shared error-envelope helper (P2 pickup)
// ===================================================================================
describe('panelErrorMessage', () => {
  test('returns null when there is no error', () => {
    expect(panelErrorMessage(undefined)).toBeNull();
  });

  test('a 401 asks the user to sign in', () => {
    expect(panelErrorMessage({ status: 401 })).toMatch(/sign in/i);
  });

  test('other errors surface the envelope message when present', () => {
    expect(panelErrorMessage({ status: 500, data: { error: { message: 'boom' } } })).toBe('boom');
  });

  test('falls back to a generic message with no envelope text', () => {
    expect(panelErrorMessage({ status: 500 })).toMatch(/./);
  });
});

// ===================================================================================
// CollectionList
// ===================================================================================
describe('CollectionList', () => {
  test('anonymous sees a sign-in hint and the query is skipped', () => {
    usePingQuery.mockReturnValue({ data: { auth: null } });
    renderWith(makeStore(), <CollectionList game={1} />);
    expect(screen.getByText(/log in/i)).toBeTruthy();
    // skip:true was passed so no personal query is fired for an anonymous user
    const opts = useCollectionQuery.mock.calls.at(-1)[1];
    expect(opts && opts.skip).toBe(true);
  });

  test('renders collection rows from useCollectionQuery', () => {
    useCollectionQuery.mockReturnValue({ data: { total: 1, games: [MINE] }, isFetching: false });
    renderWith(makeStore(), <CollectionList game={1} />);
    expect(screen.getByText(/alice/)).toBeTruthy();
  });

  test('empty collection shows a friendly empty state (not an error)', () => {
    renderWith(makeStore(), <CollectionList game={1} />);
    expect(screen.getByText(/no games/i)).toBeTruthy();
  });

  test('a query error surfaces a visible message (P2 pickup)', () => {
    useCollectionQuery.mockReturnValue({ data: undefined, isFetching: false, error: { status: 500, data: { error: { message: 'server sad' } } } });
    renderWith(makeStore(), <CollectionList game={1} />);
    expect(screen.getByText('server sad')).toBeTruthy();
  });

  test('deleting a row confirms then calls the delete mutation with the wgid', () => {
    useCollectionQuery.mockReturnValue({ data: { total: 1, games: [MINE] }, isFetching: false });
    renderWith(makeStore(), <CollectionList game={1} />);
    fireEvent.click(screen.getByLabelText(/delete/i));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(deleteTrigger).toHaveBeenCalledWith(MINE.gid);
  });
});

// ===================================================================================
// ScopeToggle
// ===================================================================================
describe('ScopeToggle', () => {
  test('anonymous users get no scope toggle at all', () => {
    usePingQuery.mockReturnValue({ data: { auth: null } });
    renderWith(makeStore(), <ScopeToggle />);
    expect(screen.queryByLabelText('Mine')).toBeNull();
  });

  test('logged-in shows Archive/Mine/Both and writes the ui slice on change', () => {
    const store = makeStore();
    renderWith(store, <ScopeToggle />);
    expect(screen.getByLabelText('Archive')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Mine'));
    expect(store.getState().ui.scope).toBe('mine');
  });
});
