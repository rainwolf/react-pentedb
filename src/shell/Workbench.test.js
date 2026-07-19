// Workbench routing/shell tests (P2 Task 5, brief Step 1):
//   - /p/1/180-199 opens a scratch tab with a 2-move line, cursor at the end
//   - /g/123 calls useGameQuery(123) (mocked) and opens a game tab
//   - tab close/activate updates docSlice state
//   - stepping the cursor syncs the URL via replaceState (history length stable);
//     switching tabs pushes instead
//
// Board is stubbed out — its own rendering is covered elsewhere (board/__tests__ +
// the Playwright smoke test); these tests are about routing/tabs/URL sync, and a real
// <Board> would only add unrelated surface area to fail on.
import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, BrowserRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab } from '../model/docSlice';
import { ThemeModeProvider } from './theme';
import AppRoutes from '../app/router';

vi.mock('../board/Board', () => ({
  default: () => <div data-testid="board-stub" />,
}));

vi.mock('../app/api', () => ({
  useGameQuery: vi.fn(() => ({ data: undefined, isLoading: true, isSuccess: false })),
  useAnalysisQuery: vi.fn(() => ({ data: undefined, isLoading: true, isSuccess: false })),
}));

// eslint-disable-next-line import/first
import { useGameQuery, useAnalysisQuery } from '../app/api';

function makeStore() {
  return configureStore({ reducer: { docs: docsReducer } });
}

const theme = createTheme();

function renderWithMemoryRouter(url, store) {
  return render(
    <Provider store={store}>
      <ThemeModeProvider>
        <ThemeProvider theme={theme}>
          <MemoryRouter initialEntries={[url]}>
            <AppRoutes />
          </MemoryRouter>
        </ThemeProvider>
      </ThemeModeProvider>
    </Provider>
  );
}

// Optional initialPath sets window.history to the target URL *before* the first
// render, mirroring renderWithMemoryRouter's initialEntries — this avoids a transient
// first render at whatever URL window.location already happens to be at (which would
// spuriously open a default '/' tab before the route-loader effect ever sees the real
// params; see the "URL sync" tests below).
function renderWithBrowserRouter(store, initialPath) {
  if (initialPath) {
    window.history.replaceState(null, '', initialPath);
  }
  return render(
    <Provider store={store}>
      <ThemeModeProvider>
        <ThemeProvider theme={theme}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ThemeProvider>
      </ThemeModeProvider>
    </Provider>
  );
}

beforeEach(() => {
  useGameQuery.mockReset();
  useAnalysisQuery.mockReset();
  useGameQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false });
  useAnalysisQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false });
});

// vitest.config.js does not set test.globals = true, so @testing-library/react's
// auto-cleanup (which only registers when a *global* afterEach exists) never fires.
// Without this, every render() in this file stays mounted in the shared jsdom
// document/window for the rest of the file — accumulating duplicate elements, live
// Redux subscriptions, and (for the BrowserRouter tests) popstate listeners across
// tests, which was hanging the "URL sync" tests when run after the earlier ones.
afterEach(() => {
  cleanup();
});

describe('routing -> docSlice', () => {
  test('/p/1/180-199 opens a scratch tab with a 2-move line, cursor at the end', async () => {
    const store = makeStore();
    renderWithMemoryRouter('/p/1/180-199', store);

    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));

    const tab = store.getState().docs.tabs[0];
    expect(tab.kind).toBe('scratch');
    expect(tab.game).toBe(1);
    expect(tab.cursorPath).toEqual([0, 0]);

    const { selectActivePosition } = await import('../model/docSlice');
    const pos = selectActivePosition(store.getState());
    expect(pos.moves).toEqual([180, 199]);
    expect(pos.cursorPath).toEqual([0, 0]);
  });

  test('invalid /p/ params redirect to /', async () => {
    const store = makeStore();
    renderWithMemoryRouter('/p/1/abc-199', store);

    // Falls through to the root loader, which opens the default empty scratch tab.
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    const tab = store.getState().docs.tabs[0];
    expect(tab.kind).toBe('scratch');
    expect(tab.game).toBe(1);
    expect(tab.cursorPath).toEqual([]);
  });

  test('/g/123 calls useGameQuery(123) and opens a game tab once loaded', async () => {
    useGameQuery.mockReturnValue({
      data: {
        header: { gid: 123, game: 1, player1: { name: 'Alice' }, player2: { name: 'Bob' } },
        moves: [180, 199, 210],
      },
      isLoading: false,
      isSuccess: true,
    });

    const store = makeStore();
    renderWithMemoryRouter('/g/123', store);

    expect(useGameQuery).toHaveBeenCalled();
    expect(useGameQuery.mock.calls[0][0]).toBe(123);

    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    const tab = store.getState().docs.tabs[0];
    expect(tab.kind).toBe('game');
    expect(tab.gid).toBe(123);
    expect(tab.game).toBe(1);
    expect(tab.title).toBe('Alice vs Bob');
    expect(tab.cursorPath).toEqual([0, 0, 0]);
  });
});

describe('tab strip', () => {
  test('activating and closing tabs updates docSlice state', async () => {
    const store = makeStore();
    store.dispatch(openTab({ id: 't1', kind: 'scratch', title: 'First', game: 1 }));
    store.dispatch(openTab({ id: 't2', kind: 'scratch', title: 'Second', game: 1 }));
    expect(store.getState().docs.activeTabId).toBe('t2');

    renderWithMemoryRouter('/', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(2));

    fireEvent.click(screen.getByText('First'));
    expect(store.getState().docs.activeTabId).toBe('t1');

    fireEvent.click(screen.getByLabelText('Close First'));
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    expect(store.getState().docs.tabs.map((t) => t.id)).toEqual(['t2']);
    expect(store.getState().docs.activeTabId).toBe('t2');
  });
});

describe('URL sync', () => {
  test('stepping the cursor replaces the URL and keeps history length stable', async () => {
    const store = makeStore();
    renderWithBrowserRouter(store, '/p/1/180-199');

    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    await waitFor(() => expect(window.location.pathname).toBe('/p/1/180-199'));

    const baseLength = window.history.length;
    const pushSpy = vi.spyOn(window.history, 'pushState');

    fireEvent.click(screen.getByLabelText('Previous move'));

    await waitFor(() => expect(window.location.pathname).toBe('/p/1/180'));
    expect(window.history.length).toBe(baseLength);
    expect(pushSpy).not.toHaveBeenCalled();

    pushSpy.mockRestore();
  });

  test('switching the active tab pushes a new history entry', async () => {
    const store = makeStore();
    store.dispatch(openTab({ id: 'g:1', kind: 'game', title: 'Game A', game: 1, gid: 1 }));
    store.dispatch(openTab({ id: 'g:2', kind: 'game', title: 'Game B', game: 1, gid: 2 }));

    renderWithBrowserRouter(store, '/g/2');
    await waitFor(() => expect(window.location.pathname).toBe('/g/2'));

    const baseLength = window.history.length;

    fireEvent.click(screen.getByText('Game A'));

    await waitFor(() => expect(window.location.pathname).toBe('/g/1'));
    expect(window.history.length).toBe(baseLength + 1);
  });
});
