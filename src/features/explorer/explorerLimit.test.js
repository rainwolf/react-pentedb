// Explorer "moves to display" limit: ui pref, shared displayedCandidates helper, list + board agree.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab } from '../../model/docSlice';
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
import uiReducer, { setExplorerLimit, selectExplorerLimit, setExplorerSort } from '../../app/uiSlice';
// eslint-disable-next-line import/first
import { displayedCandidates } from './displayedCandidates';
// eslint-disable-next-line import/first
import BoardHeatOverlay from './BoardHeatOverlay';
// eslint-disable-next-line import/first
import ExplorerPanel from './ExplorerPanel';

const theme = createTheme();
const apiStub = (s = {}) => s;

// 30 candidates, cells 200..229 (180 is the played stone). Popularity and win rate disagree:
// games ascends with i, wins is flat-ish so the winrate order differs from the games order.
const CANDS = Array.from({ length: 30 }, (_, i) => {
  const games = 10 + i; // 10..39, all well-sampled
  const wins = Math.round(games * (0.3 + ((i * 7) % 30) / 60)); // scrambled win rate
  return { move: 200 + i, games, wins, winPct: Math.round((wins / games) * 1000) / 10 };
});
const STATS = { totalGames: 999, totalWinPct: 50, rotation: 0, nextMoves: CANDS };

function makeStore() {
  const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer, api: apiStub } });
  let tree = createTree();
  const res = addMove(tree, [], 180);
  store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game: 1, tree: res.tree, cursorPath: [0] }));
  return store;
}
function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
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
  usePingQuery.mockReturnValue({ data: { auth: 'iostest' } });
});
afterEach(cleanup);

const rowMoves = () =>
  Array.from(document.querySelectorAll('[data-testid^="stats-row-"]')).map((el) =>
    Number(el.getAttribute('data-testid').replace('stats-row-', ''))
  );
const discMoves = (container) =>
  Array.from(container.querySelectorAll('circle[data-canonical]')).map((c) => Number(c.getAttribute('data-canonical')));

describe('explorerLimit ui pref', () => {
  test('defaults to 20; set stores integers >= 1; invalid input ignored', () => {
    const store = configureStore({ reducer: { ui: uiReducer } });
    expect(selectExplorerLimit(store.getState())).toBe(20);
    store.dispatch(setExplorerLimit(5));
    expect(selectExplorerLimit(store.getState())).toBe(5);
    store.dispatch(setExplorerLimit('12'));
    expect(selectExplorerLimit(store.getState())).toBe(12);
    for (const bad of [NaN, '', null, undefined, 0, -3, 2.5, 'abc']) {
      store.dispatch(setExplorerLimit(bad));
      expect(selectExplorerLimit(store.getState())).toBe(12);
    }
  });
  test('selector falls back to 20 without a ui slice or with a corrupt value', () => {
    expect(selectExplorerLimit({})).toBe(20);
    expect(selectExplorerLimit({ ui: { explorerLimit: NaN } })).toBe(20);
    expect(selectExplorerLimit({ ui: {} })).toBe(20);
  });
});

describe('displayedCandidates', () => {
  test.each(['games', 'winrate'])('takes the first N of the %s order, after filtering occupied cells', (mode) => {
    const withOccupied = [{ move: 180, games: 99, wins: 99, winPct: 100 }, ...CANDS];
    const all = displayedCandidates(withOccupied, [180], mode, 1000);
    expect(all.map((c) => c.move)).not.toContain(180);
    expect(all).toHaveLength(30);
    const five = displayedCandidates(withOccupied, [180], mode, 5);
    expect(five.map((c) => c.move)).toEqual(all.slice(0, 5).map((c) => c.move));
  });
  test('the two sort modes pick different top-N sets on this data', () => {
    const g = displayedCandidates(CANDS, [180], 'games', 5).map((c) => c.move);
    const w = displayedCandidates(CANDS, [180], 'winrate', 5).map((c) => c.move);
    expect(g).not.toEqual(w);
  });
  test('invalid limit falls back to 20', () => {
    expect(displayedCandidates(CANDS, [180], 'games', NaN)).toHaveLength(20);
    expect(displayedCandidates(CANDS, [180], 'games', undefined)).toHaveLength(20);
  });
});

describe('ExplorerPanel + BoardHeatOverlay honour the limit', () => {
  test('default shows 20 rows and a "20 of 30" hint; board shows the same 20', () => {
    const store = makeStore();
    renderWith(store, <ExplorerPanel />);
    expect(rowMoves()).toHaveLength(20);
    expect(screen.getByTestId('explorer-limit-hint').textContent).toMatch(/20 of 30/);
    cleanup();
    const { container } = renderWith(store, <BoardHeatOverlay />);
    expect(discMoves(container)).toHaveLength(20);
  });

  test.each(['games', 'winrate'])('limit 5 in %s mode: list and board show the same 5 moves; totals sum them', (mode) => {
    const store = makeStore();
    store.dispatch(setExplorerSort(mode));
    store.dispatch(setExplorerLimit(5));
    renderWith(store, <ExplorerPanel />);
    const listed = rowMoves();
    expect(listed).toHaveLength(5);
    const expected = displayedCandidates(CANDS, [180], mode, 5).map((c) => c.move);
    expect(listed).toEqual(expected);
    const sum = displayedCandidates(CANDS, [180], mode, 5).reduce((s, c) => s + c.games, 0);
    expect(screen.getByTestId('stats-totals').textContent).toContain(String(sum));
    cleanup();
    const { container } = renderWith(store, <BoardHeatOverlay />);
    expect([...discMoves(container)].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
  });

  test('no hint when everything fits', () => {
    const store = makeStore();
    store.dispatch(setExplorerLimit(50));
    renderWith(store, <ExplorerPanel />);
    expect(rowMoves()).toHaveLength(30);
    expect(screen.queryByTestId('explorer-limit-hint')).toBeNull();
  });

  test('counter input commits on blur; empty / junk input leaves the stored value alone', () => {
    const store = makeStore();
    renderWith(store, <ExplorerPanel />);
    const input = screen.getByLabelText('Moves to display');
    expect(input.value).toBe('20');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(selectExplorerLimit(store.getState())).toBe(5);
    expect(rowMoves()).toHaveLength(5);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(selectExplorerLimit(store.getState())).toBe(5);
    expect(input.value).toBe('5'); // empty + blur reverts
    fireEvent.change(input, { target: { value: '-4' } });
    fireEvent.blur(input);
    expect(selectExplorerLimit(store.getState())).toBe(5);
    expect(input.value).toBe('5');
    expect(rowMoves()).toHaveLength(5);
  });

  describe('draft + debounce', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    test('clear then type 15: field shows 15, "1" is not committed mid-edit, store becomes 15 after debounce', () => {
      const store = makeStore();
      renderWith(store, <ExplorerPanel />);
      const input = screen.getByLabelText('Moves to display');
      fireEvent.change(input, { target: { value: '' } });
      expect(input.value).toBe('');
      fireEvent.change(input, { target: { value: '1' } });
      act(() => { vi.advanceTimersByTime(100); });
      expect(selectExplorerLimit(store.getState())).toBe(20);
      fireEvent.change(input, { target: { value: '15' } });
      act(() => { vi.advanceTimersByTime(100); });
      expect(selectExplorerLimit(store.getState())).toBe(20);
      act(() => { vi.advanceTimersByTime(400); });
      expect(input.value).toBe('15');
      expect(selectExplorerLimit(store.getState())).toBe(15);
      expect(rowMoves()).toHaveLength(15);
    });

    test('Enter commits immediately', () => {
      const store = makeStore();
      renderWith(store, <ExplorerPanel />);
      const input = screen.getByLabelText('Moves to display');
      fireEvent.change(input, { target: { value: '7' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(selectExplorerLimit(store.getState())).toBe(7);
    });

    test('unmount cancels a pending commit', () => {
      const store = makeStore();
      const { unmount } = renderWith(store, <ExplorerPanel />);
      fireEvent.change(screen.getByLabelText('Moves to display'), { target: { value: '9' } });
      unmount();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(selectExplorerLimit(store.getState())).toBe(20);
    });

    test('input uses step 1', () => {
      renderWith(makeStore(), <ExplorerPanel />);
      expect(screen.getByLabelText('Moves to display').getAttribute('step')).toBe('1');
    });
  });
});
