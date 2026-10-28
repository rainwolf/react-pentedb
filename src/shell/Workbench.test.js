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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, BrowserRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab } from '../model/docSlice';
import { mainline } from '../model/gameTree';
import { ThemeModeProvider } from './theme';
import AppRoutes from '../app/router';

vi.mock('../board/Board', () => ({
  default: () => <div data-testid="board-stub" />,
}));

vi.mock('../app/api', () => ({
  // TopBar renders UserMenu (P3 Task 1), which calls usePingQuery — stub it anonymous so
  // that path doesn't crash on an unmocked import; auth state isn't under test here.
  usePingQuery: vi.fn(() => ({ data: { ok: true, auth: null, dbAccess: true }, isLoading: false, isError: false, refetch: vi.fn() })),
  useGameQuery: vi.fn(() => ({ data: undefined, isLoading: true, isSuccess: false })),
  useAnalysisQuery: vi.fn(() => ({ data: undefined, isLoading: true, isSuccess: false })),
  useCollectionGameQuery: vi.fn(() => ({ data: undefined })),
  // The wide-breakpoint layout renders the real (Task 7) SearchPanel in the left pane —
  // stub its hooks too so that path doesn't crash on an unmocked import.
  useGamesSearchQuery: vi.fn(() => ({ data: { total: 0, games: [] }, isFetching: false })),
  useVenuesQuery: vi.fn(() => ({ data: { variants: [] }, isLoading: false })),
  usePlayersQuery: vi.fn(() => ({ data: { players: [] }, isFetching: false })),
  // The wide/medium layout's right panel defaults to the real (Task 8) ExplorerPanel —
  // stub its position-stats hook for the same reason.
  usePositionStatsQuery: vi.fn(() => ({ data: undefined, isFetching: false })),
  // The (P3 Task 3) save flow + "My analyses" panel: useAnalysisSave and AnalysesList call
  // these; stub them so the shell mounts. Saved-analyses behavior is covered in
  // features/analysis/persistence.test.js, not here.
  useSaveAnalysisMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }]),
  useAnalysesQuery: vi.fn(() => ({ data: { analyses: [] }, isLoading: false, isError: false })),
  useDeleteAnalysisMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve({ ok: true }) })), { isLoading: false }]),
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
    // Pente's first move is forced: the fresh board already carries the centre stone.
    expect(tab.cursorPath).toEqual([0]);
    expect(mainline(tab.tree)).toEqual([180]);
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

describe('route-loader error states', () => {
  // A routed /a/:aid or /g/:gid whose query 404s (or 401s, etc.) never resolves a tab —
  // before this fix the loader effect's `if (!query.data) return;` guard just kept
  // returning forever, leaving a permanently blank workbench with no feedback. Render-time
  // only (no new effect/ref): the query's existing isError/error state is surfaced via the
  // shared PanelError in the center pane, and the rest of the shell (Save button, tab
  // strip) stays mounted and usable.
  test('/a/999 shows the error envelope message instead of a blank workbench', async () => {
    useAnalysisQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: { status: 404, data: { error: { message: 'Analysis not found' } } },
    });

    const store = makeStore();
    renderWithMemoryRouter('/a/999', store);

    expect((await screen.findByRole('alert')).textContent).toBe('Analysis not found');
    // No tab was ever opened for the 404ing route — the loader correctly declined.
    expect(store.getState().docs.tabs).toHaveLength(0);
    // Rest of the shell stays usable (Save button/toolbar still renders).
    expect(screen.getByLabelText('Save analysis')).toBeTruthy();
  });

  test('/g/999999 shows the error envelope message instead of a blank workbench', async () => {
    useGameQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: { status: 404, data: { error: { message: 'Game not found' } } },
    });

    const store = makeStore();
    renderWithMemoryRouter('/g/999999', store);

    expect((await screen.findByRole('alert')).textContent).toBe('Game not found');
    expect(store.getState().docs.tabs).toHaveLength(0);
    expect(screen.getByLabelText('Save analysis')).toBeTruthy();
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

    // Back at the forced opener alone == a fresh board, addressed as '/'.
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(window.history.length).toBe(baseLength);
    expect(pushSpy).not.toHaveBeenCalled();

    // Regression guard: stepping the cursor must re-point the SAME scratch tab's
    // cursor, not open a second tab keyed off the (now cursor-truncated) URL. Before
    // the lastSyncedUrlRef fix, the route-loader effect misread its own replaceState
    // as an external navigation to '/p/1/180', found no tab with that id, and opened
    // a second scratch tab whose tree was truncated to just [180].
    const tabsAfterStep = store.getState().docs.tabs;
    expect(tabsAfterStep).toHaveLength(1);
    const activeAfterStep = tabsAfterStep.find((t) => t.id === store.getState().docs.activeTabId);
    expect(mainline(activeAfterStep.tree)).toEqual([180, 199]);

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

describe('responsive layout', () => {
  // useBreakpoint reads window.innerWidth in its useState initializer, so setting it
  // BEFORE render is enough to pick the layout (no resize event needed). Capture and
  // restore per-test so these three widths don't leak into the rest of the file (jsdom
  // defaults to 1024 = 'medium').
  let originalInnerWidth;
  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });
  afterEach(() => {
    window.innerWidth = originalInnerWidth;
  });

  test('1400px renders the three-pane wide layout', async () => {
    window.innerWidth = 1400;
    const store = makeStore();
    renderWithMemoryRouter('/', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    // Right-panel Tabs (Explorer/AI/Threats) render for wide+medium; no bottom Games
    // tab and no medium-only hamburger.
    expect(screen.getByText('Threats')).toBeTruthy();
    expect(screen.queryByText('Games')).toBeNull();
    expect(screen.queryByLabelText('Open search panel')).toBeNull();
  });

  test('900px renders the medium two-pane + drawer layout', async () => {
    window.innerWidth = 900;
    const store = makeStore();
    renderWithMemoryRouter('/', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    // Right panel still present, plus the TopBar hamburger that opens the search drawer;
    // no narrow bottom Games tab.
    expect(screen.getByText('Threats')).toBeTruthy();
    expect(screen.getByLabelText('Open search panel')).toBeTruthy();
    expect(screen.queryByText('Games')).toBeNull();
  });

  test('390px renders the narrow bottom-tabs layout', async () => {
    window.innerWidth = 390;
    const store = makeStore();
    renderWithMemoryRouter('/', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    // Bottom mobile Tabs include a Games tab; the right panel (Threats) and the
    // medium-only hamburger are both absent.
    expect(screen.getByText('Games')).toBeTruthy();
    expect(screen.queryByText('Threats')).toBeNull();
    expect(screen.queryByLabelText('Open search panel')).toBeNull();
  });
});

describe('/p/:game (empty board of a variant)', () => {
  test('/p/19 opens an empty Go scratch tab', async () => {
    const store = makeStore();
    renderWithMemoryRouter('/p/19', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    const tab = store.getState().docs.tabs[0];
    expect(tab.game).toBe(19);
    expect(tab.tree.root.kids).toHaveLength(0);
  });

  test('/p/999 (unknown game) redirects to / and opens the default game', async () => {
    const store = makeStore();
    renderWithMemoryRouter('/p/999', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    expect(store.getState().docs.tabs[0].game).toBe(1);
  });

  test('/p/19 reuses an untouched Go scratch tab instead of opening a duplicate', async () => {
    const store = makeStore();
    store.dispatch(openTab({ kind: 'scratch', title: 'New position', game: 19 }));
    renderWithMemoryRouter('/p/19', store);
    await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().docs.tabs).toHaveLength(1);
  });
});
