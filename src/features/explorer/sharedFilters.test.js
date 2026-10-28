// Shared applied filters in the explorer: the ONE filter set (ui slice) rides on BOTH the
// position-stats query and the games-through-position list; chips summarise it; clear-all resets
// it; board moves keep it; start / empty positions work.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, applyMove, selectActivePosition } from '../../model/docSlice';
import { createTree, addMove } from '../../model/gameTree';

vi.mock('../../app/api', () => ({
  usePositionStatsQuery: vi.fn(),
  useGamesSearchQuery: vi.fn(),
  useGameQuery: vi.fn(),
  usePingQuery: vi.fn(),
}));

// eslint-disable-next-line import/first
import { usePositionStatsQuery, useGamesSearchQuery, useGameQuery, usePingQuery } from '../../app/api';
// eslint-disable-next-line import/first
import uiReducer, { setFilters, selectFilters } from '../../app/uiSlice';
// eslint-disable-next-line import/first
import ExplorerPanel from './ExplorerPanel';
// eslint-disable-next-line import/first
import BoardHeatOverlay from './BoardHeatOverlay';
// eslint-disable-next-line import/first
import { filterChipLabels } from './ActiveFilters';
// eslint-disable-next-line import/first
import { buildFilters, DEFAULT_DRAFT } from '../search/FilterForm';

const theme = createTheme();
const STATS = { totalGames: 7, totalWinPct: 60, rotation: 0, nextMoves: [{ move: 200, games: 7, wins: 4, winPct: 57 }] };
const F = buildFilters({ ...DEFAULT_DRAFT, player1Name: 'alice', winner: 1 });

function makeStore(moves = [180], game = 1) {
  const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
  let tree = createTree();
  let path = [];
  for (const m of moves) {
    const r = addMove(tree, path, m);
    tree = r.tree;
    path = r.path;
  }
  store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game, tree, cursorPath: path }));
  return store;
}

function renderWith(store) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <ExplorerPanel />
      </ThemeProvider>
    </Provider>
  );
}

beforeEach(() => {
  usePositionStatsQuery.mockReset();
  useGamesSearchQuery.mockReset();
  useGameQuery.mockReset();
  usePingQuery.mockReset();
  usePositionStatsQuery.mockReturnValue({ data: STATS, isFetching: false });
  useGamesSearchQuery.mockReturnValue({ data: { total: 0, games: [] }, isFetching: false });
  useGameQuery.mockReturnValue({ data: undefined, isSuccess: false });
  usePingQuery.mockReturnValue({ data: { auth: null } });
});
afterEach(cleanup);

const lastStatsArg = () => usePositionStatsQuery.mock.calls.at(-1)[0];
const lastGamesArg = () => useGamesSearchQuery.mock.calls.at(-1)[0];

describe('filterChipLabels', () => {
  test('null/no filters -> no chips; every active field yields one chip in form order', () => {
    expect(filterChipLabels(null)).toEqual([]);
    expect(
      filterChipLabels(
        buildFilters({
          ...DEFAULT_DRAFT,
          player1Name: 'alice',
          player2Name: 'bob',
          player2Seat: 0,
          site: 'Pente.org',
          event: 'Champs',
          afterDate: '2020-01-01',
          winner: 2,
        })
      )
    ).toEqual([
      'Player 1: alice',
      'Player 2: bob (any seat)',
      'Site: Pente.org',
      'Event: Champs',
      'After 2020-01-01',
      'Winner: Player 2',
    ]);
  });
});

describe('ExplorerPanel with shared filters', () => {
  test('no filters: both queries send filters null and no chip bar is shown', () => {
    renderWith(makeStore());
    expect(lastStatsArg().filters).toBeNull();
    expect(lastGamesArg().filters).toBeNull();
    expect(screen.queryByTestId('active-filters')).toBeNull();
  });

  test('applied filters reach BOTH the position-stats and the games list, with the same position', () => {
    const store = makeStore([180]);
    store.dispatch(setFilters(F));
    renderWith(store);
    expect(lastStatsArg()).toMatchObject({ game: 1, moves: [180], scope: 'archive', filters: F });
    expect(lastGamesArg()).toMatchObject({ game: 1, moves: [180], scope: 'archive', filters: F, offset: 0, limit: 25 });
    expect(screen.getByTestId('active-filters')).toBeTruthy();
    expect(screen.getByText('Player 1: alice')).toBeTruthy();
    expect(screen.getByText('Winner: Player 1')).toBeTruthy();
  });

  test('a filter change after mount refetches both with the new set; clear-all returns both to null', () => {
    const store = makeStore([180]);
    renderWith(store);
    act(() => {
      store.dispatch(setFilters(F));
    });
    expect(lastStatsArg().filters).toEqual(F);
    expect(lastGamesArg().filters).toEqual(F);

    fireEvent.click(screen.getByTestId('clear-all-filters'));
    expect(selectFilters(store.getState())).toBeNull();
    expect(lastStatsArg().filters).toBeNull();
    expect(lastGamesArg().filters).toBeNull();
    expect(screen.queryByTestId('active-filters')).toBeNull();
  });

  test('a board move keeps the filters on both queries (debounced position settles)', () => {
    vi.useFakeTimers();
    try {
      const store = makeStore([180]);
      store.dispatch(setFilters(F));
      renderWith(store);
      act(() => {
        store.dispatch(applyMove(200));
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);
      expect(lastStatsArg()).toMatchObject({ moves: [180, 200], filters: F });
      expect(lastGamesArg()).toMatchObject({ moves: [180, 200], filters: F });
    } finally {
      vi.useRealTimers();
    }
  });

  test('the forced-centre start position queries with [180]; an empty free-first-move board omits `moves` on the list', () => {
    const forced = renderWith(makeStore([180]));
    expect(lastGamesArg().moves).toEqual([180]);
    forced.unmount();
    renderWith(makeStore([], 7)); // game 7: free first move => truly empty board
    expect(lastGamesArg()).not.toHaveProperty('moves');
    expect(screen.getByTestId('position-mode-header').textContent).toBe('All matching games');
  });

  test('stale stats for old filters are not shown while the new filters load', () => {
    const store = makeStore([180]);
    usePositionStatsQuery.mockReturnValue({ data: STATS, currentData: STATS, isFetching: false });
    renderWith(store);
    expect(screen.getByTestId('explorer-summary').textContent).toContain('7 games');
    usePositionStatsQuery.mockReturnValue({ data: STATS, currentData: undefined, isFetching: true });
    act(() => {
      store.dispatch(setFilters(F));
    });
    expect(screen.getByTestId('explorer-summary').textContent).not.toContain('7 games');
  });

  test('a lingering mine scope shows the archive-only caveat next to the chips', () => {
    usePingQuery.mockReturnValue({ data: { auth: 'iostest' } });
    const store = makeStore([180]);
    store.dispatch({ type: 'ui/setScope', payload: 'both' });
    store.dispatch(setFilters(F));
    renderWith(store);
    expect(screen.getByText(/apply to the archive only/)).toBeTruthy();
  });
  test('the on-board heat queries with the SAME shared filters (no second, unfiltered request)', () => {
    const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer, api: (st = {}) => st } });
    let tree = createTree();
    tree = addMove(tree, [], 180).tree;
    store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game: 1, tree, cursorPath: [0] }));
    store.dispatch(setFilters(F));
    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <BoardHeatOverlay />
        </ThemeProvider>
      </Provider>
    );
    expect(lastStatsArg()).toMatchObject({ moves: [180], filters: F });
  });
});

describe('review fixes: empty board + scope honesty', () => {
  test('free-first-move board (no moves) says to play a first move, not "no master games"', () => {
    // the real server answers an empty line with totalGames=0, nextMoves=[] (not undefined)
    usePositionStatsQuery.mockReturnValue({ data: { totalGames: 0, totalWinPct: null, nextMoves: [] }, isFetching: false });
    renderWith(makeStore([], 19)); // Go: free first move
    expect(screen.getByTestId('explorer-summary').textContent).toMatch(/Play a first move to see move statistics/);
    expect(screen.queryByText(/No master games from this position/)).toBeNull();
  });

  test('non-empty line with no data keeps the "no master games" wording', () => {
    usePositionStatsQuery.mockReturnValue({ data: undefined, isFetching: false });
    renderWith(makeStore([180]));
    expect(screen.getByTestId('explorer-summary').textContent).toMatch(/No master games from this position/);
  });

  test('mine/both scope shows the archive-only caveat even with NO filters; archive does not', () => {
    usePingQuery.mockReturnValue({ data: { auth: 'iostest' } });
    const store = makeStore([180]);
    store.dispatch({ type: 'ui/setScope', payload: 'mine' });
    renderWith(store);
    expect(screen.getByTestId('scope-caveat').textContent).toMatch(/archive only/);
    expect(screen.queryByTestId('clear-all-filters')).toBeNull();
    cleanup();
    renderWith(makeStore([180]));
    expect(screen.queryByTestId('scope-caveat')).toBeNull();
  });
});
