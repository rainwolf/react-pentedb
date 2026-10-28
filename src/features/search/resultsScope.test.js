// ResultsList review fixes: scope-honest header, personal-row opening via the collection opener,
// page state keyed on the search (no stale page-2+ request), "x of N" counts loaded rows only,
// and the FilterForm "Either seat" checkbox.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer from '../../model/docSlice';
import uiReducer, { setFilters, selectFilters } from '../../app/uiSlice';

vi.mock('../../app/api', () => ({
  useGamesSearchQuery: vi.fn(),
  useGameQuery: vi.fn(),
  useCollectionGameQuery: vi.fn(),
  useVenuesQuery: vi.fn(() => ({ data: { variants: [] }, isLoading: false })),
  usePlayersQuery: vi.fn(() => ({ data: { players: [] }, isFetching: false })),
}));

// eslint-disable-next-line import/first
import { useGamesSearchQuery, useGameQuery, useCollectionGameQuery } from '../../app/api';
// eslint-disable-next-line import/first
import ResultsList, { listHeaderLabel } from './ResultsList';
// eslint-disable-next-line import/first
import FilterForm from './FilterForm';

const theme = createTheme();
const store = () => configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
const wrap = (st, node) => (
  <Provider store={st}>
    <ThemeProvider theme={theme}>{node}</ThemeProvider>
  </Provider>
);
const H = (gid, source = 'archive') => ({
  gid, source, game: 1, player1: { name: 'a' }, player2: { name: 'b' }, winner: 1, playDate: null,
});
const rows = (from, n, source) => Array.from({ length: n }, (_, i) => H(from + i, source));

beforeEach(() => {
  useGamesSearchQuery.mockReset();
  useGameQuery.mockReset();
  useCollectionGameQuery.mockReset();
  useGameQuery.mockReturnValue({ data: undefined, isFetching: false });
  useCollectionGameQuery.mockReturnValue({ data: undefined, isFetching: false });
});
afterEach(cleanup);

describe('listHeaderLabel', () => {
  test('says what the list actually is per scope', () => {
    expect(listHeaderLabel('archive', 0)).toBe('All matching games');
    expect(listHeaderLabel('archive', 3)).toBe('Games through this position (3 moves)');
    expect(listHeaderLabel('mine', 3)).toBe('My games (position and filters not applied)');
    expect(listHeaderLabel('both', 3)).toMatch(/personal games not position-filtered/);
  });
  test('rendered header follows the scope prop', () => {
    useGamesSearchQuery.mockReturnValue({ data: { total: 0, games: [] }, isFetching: false });
    render(wrap(store(), <ResultsList game={1} scope="mine" filters={null} moves={[180]} />));
    expect(screen.getByTestId('position-mode-header').textContent).toBe('My games (position and filters not applied)');
  });
});

describe('personal (source mine) rows', () => {
  test('click opens through the collection opener (w:<wgid> tab), never the archive game query', () => {
    useGamesSearchQuery.mockReturnValue({ data: { total: 1, games: [H(7, 'mine')] }, isFetching: false });
    useCollectionGameQuery.mockImplementation((wgid) =>
      wgid === 7 ? { data: { header: { game: 1, player1: { name: 'me' }, player2: { name: 'you' } }, moves: [180, 181] }, isFetching: false } : { data: undefined }
    );
    const st = store();
    render(wrap(st, <ResultsList game={1} scope="both" filters={null} moves={[]} />));
    fireEvent.click(screen.getByTestId('result-row-7'));
    const tabs = st.getState().docs.tabs;
    expect(tabs.map((t) => t.id)).toEqual(['w:7']);
    expect(tabs[0].gid).toBe(7);
    // archive query never asked for the wgid
    expect(useGameQuery.mock.calls.every(([id]) => id !== 7)).toBe(true);
  });
});

describe('paging', () => {
  const mock = () =>
    useGamesSearchQuery.mockImplementation((arg) => ({
      data: { total: 60, games: rows(arg.offset + 1, Math.min(25, 60 - arg.offset)) },
      isFetching: false,
    }));

  test('new search (moves change) never fires a page-2+ request for the new args', () => {
    mock();
    const st = store();
    const { rerender } = render(wrap(st, <ResultsList game={1} scope="archive" filters={null} moves={[180]} />));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(useGamesSearchQuery.mock.calls.some(([a]) => a.offset === 25)).toBe(true);
    useGamesSearchQuery.mockClear();
    mock();
    rerender(wrap(st, <ResultsList game={1} scope="archive" filters={null} moves={[180, 181]} />));
    const forNew = useGamesSearchQuery.mock.calls.filter(([a]) => a.moves && a.moves.length === 2);
    expect(forNew.length).toBeGreaterThan(0);
    expect(forNew.every(([a]) => a.offset === 0)).toBe(true);
  });

  test('"x of N" counts only rows actually loaded', () => {
    useGamesSearchQuery.mockImplementation((arg) =>
      arg.offset === 0
        ? { data: { total: 60, games: rows(1, 25) }, isFetching: false }
        : { data: undefined, isFetching: true }
    );
    render(wrap(store(), <ResultsList game={1} scope="archive" filters={null} moves={[]} />));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByTestId('games-count').textContent).toBe('25 of 60 games');
  });
});

describe('FilterForm Either seat checkbox', () => {
  const playerBox = (label) => screen.getByRole('combobox', { name: label });

  test('no seat selects; one always-enabled "Either seat" checkbox; no helper text', () => {
    render(wrap(store(), <FilterForm initialGame={1} />));
    expect(screen.queryByRole('combobox', { name: /seat/i })).toBeNull();
    expect(screen.queryByText('Enter a player name first')).toBeNull();
    const box = screen.getByRole('checkbox', { name: 'Either seat' });
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
  });

  test('ticking applies both seats as 0 to the store; unticking restores 1 and 2', () => {
    const st = store();
    render(wrap(st, <FilterForm initialGame={1} />));
    fireEvent.change(playerBox('Player 1'), { target: { value: 'alice' } });
    fireEvent.blur(playerBox('Player 1'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Either seat' }));
    expect(selectFilters(st.getState())).toMatchObject({ player1Name: 'alice', player1Seat: 0, player2Seat: 0 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Either seat' }));
    expect(selectFilters(st.getState())).toMatchObject({ player1Seat: 1, player2Seat: 2 });
  });

  test('rehydrates ticked from applied {0,0} seats', () => {
    const st = store();
    st.dispatch(setFilters({ player1Name: 'alice', player1Seat: 0, player2Name: null, player2Seat: 0, site: null, event: null, round: null, section: null, afterDate: null, beforeDate: null, winner: 0 }));
    render(wrap(st, <FilterForm initialGame={1} />));
    expect(screen.getByRole('checkbox', { name: 'Either seat' }).checked).toBe(true);
  });
});
