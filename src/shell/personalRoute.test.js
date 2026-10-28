// Personal (collection) game tabs `w:<wgid>` get their own /w/:wgid URL; they must never
// be addressed as /g/<wgid> (that is an archive id -> wrong game on reload).
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer from '../model/docSlice';
import { ThemeModeProvider } from './theme';
import AppRoutes from '../app/router';
import { canonicalUrl } from './gameTab';

vi.mock('../board/Board', () => ({ default: () => <div data-testid="board-stub" /> }));

vi.mock('../app/api', () => ({
  usePingQuery: vi.fn(() => ({ data: { ok: true, auth: 'u', dbAccess: true }, isLoading: false, isError: false, refetch: vi.fn() })),
  useGameQuery: vi.fn(() => ({ data: undefined, isLoading: false, isSuccess: false })),
  useCollectionGameQuery: vi.fn(() => ({ data: undefined, isLoading: false, isSuccess: false })),
  useAnalysisQuery: vi.fn(() => ({ data: undefined, isLoading: false, isSuccess: false })),
  useGamesSearchQuery: vi.fn(() => ({ data: { total: 0, games: [] }, isFetching: false })),
  useVenuesQuery: vi.fn(() => ({ data: { variants: [] }, isLoading: false })),
  usePlayersQuery: vi.fn(() => ({ data: { players: [] }, isFetching: false })),
  usePositionStatsQuery: vi.fn(() => ({ data: undefined, isFetching: false })),
  useSaveAnalysisMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useAnalysesQuery: vi.fn(() => ({ data: { analyses: [] }, isLoading: false, isError: false })),
  useDeleteAnalysisMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

// eslint-disable-next-line import/first
import { useGameQuery, useCollectionGameQuery } from '../app/api';

const theme = createTheme();
const makeStore = () => configureStore({ reducer: { docs: docsReducer } });
const renderAt = (url, store) =>
  render(
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

beforeEach(() => {
  useGameQuery.mockClear();
  useCollectionGameQuery.mockReset();
  useCollectionGameQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false });
});
afterEach(cleanup);

describe('canonicalUrl', () => {
  test('personal tab -> /w/<wgid>, archive tab -> /g/<gid>', () => {
    expect(canonicalUrl({ id: 'w:77', kind: 'game', gid: 77 }, { moves: [] })).toBe('/w/77');
    expect(canonicalUrl({ id: 'g:77', kind: 'game', gid: 77 }, { moves: [] })).toBe('/g/77');
  });
});

describe('/w/:wgid route', () => {
  const data = (gid) => ({ header: { gid, game: 1, player1: { name: 'Me' }, player2: { name: 'You' } }, moves: [180, 199] });

  test('opens tab w:<wgid> via the collection query, never the archive query', async () => {
    useCollectionGameQuery.mockImplementation((arg) => ({ data: data(arg), isSuccess: true }));
    const store = makeStore();
    renderAt('/w/55', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    const tab = store.getState().docs.tabs[0];
    expect(tab.id).toBe('w:55');
    expect(tab.gid).toBe(55);
    expect(tab.kind).toBe('game');
    expect(useCollectionGameQuery.mock.calls.some((c) => c[0] === 55)).toBe(true);
    // the archive query is never actually run for the wgid (skipped, so no /games/<wgid> request)
    expect(useGameQuery.mock.calls.every((c) => c[0] !== 55 || (c[1] && c[1].skip === true))).toBe(true);
  });

  test('ignores retained data for a different wgid', async () => {
    useCollectionGameQuery.mockReturnValue({ data: data(11), isSuccess: true });
    const store = makeStore();
    renderAt('/w/55', store);
    await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().docs.tabs).toHaveLength(0);
  });

  test('reuses an existing w:<wgid> tab', async () => {
    useCollectionGameQuery.mockImplementation((arg) => ({ data: data(arg), isSuccess: true }));
    const store = makeStore();
    store.dispatch({ type: 'docs/openTab', payload: { id: 'w:55', kind: 'game', title: 'x', game: 1, gid: 55 } });
    renderAt('/w/55', store);
    await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().docs.tabs.filter((t) => t.id === 'w:55')).toHaveLength(1);
  });

  test('404 / unauthenticated shows PanelError, opens no tab', async () => {
    useCollectionGameQuery.mockReturnValue({
      data: undefined, isError: true, isSuccess: false,
      error: { status: 404, data: { error: { message: 'Game not found' } } },
    });
    const store = makeStore();
    renderAt('/w/55', store);
    expect((await screen.findByRole('alert')).textContent).toBe('Game not found');
    expect(store.getState().docs.tabs).toHaveLength(0);
  });
});
