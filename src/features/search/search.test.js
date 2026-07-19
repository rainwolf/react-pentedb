// Search panel tests (P2 Task 7, brief Step 1):
//   - FilterForm's buildFilters() serializes to the EXACT wire filter object, including
//     the null-vs-absent handling from the Phase 1 contract (p1-task-3-brief.md / the
//     actual PositionStatsRequest.Filters field defaults on branch webdb-api):
//       * all-default draft -> `filters: null` ("no filtering")
//       * any field touched -> the FULL 11-key object; unset strings are `null` (present
//         key, null value — never omitted, never ''); player1Seat/player2Seat/winner are
//         always-present ints (Gson can't deserialize null into a primitive int) defaulting
//         to 1 / 2 / 0 per the Filters class's field initializers.
//   - player-name autocomplete debounces 300ms with a 2-char minimum before usePlayersQuery
//     is called un-skipped (fake timers).
//   - ResultsList pagination math ("Showing x-y of total") and the hand-rolled windowing
//     range function used for virtualization.
//   - row click opens a game tab at the final position: dispatches docSlice openTab with the
//     clicked gid, kind 'game', and a tree built from the loaded game's moves.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer from '../../model/docSlice';

vi.mock('../../app/api', () => ({
  useVenuesQuery: vi.fn(),
  usePlayersQuery: vi.fn(),
  useGamesSearchQuery: vi.fn(),
  useGameQuery: vi.fn(),
}));

// eslint-disable-next-line import/first
import { useVenuesQuery, usePlayersQuery, useGamesSearchQuery, useGameQuery } from '../../app/api';
// eslint-disable-next-line import/first
import SearchPanel from './SearchPanel';
// eslint-disable-next-line import/first
import FilterForm, { buildFilters, DEFAULT_DRAFT } from './FilterForm';
// eslint-disable-next-line import/first
import ResultsList, { paginationLabel, visibleRowRange, PAGE_SIZE } from './ResultsList';
// eslint-disable-next-line import/first
import useVenueOptions from './useVenueOptions';

const theme = createTheme();

const VENUES = {
  variants: [
    {
      game: 1,
      name: 'Pente',
      sites: [{ id: 2, name: 'Pente.org', events: [{ id: 7, name: 'Champs' }] }],
    },
  ],
};

function makeStore() {
  return configureStore({ reducer: { docs: docsReducer } });
}

function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
    </Provider>
  );
}

function renderPlain(node) {
  return render(<ThemeProvider theme={theme}>{node}</ThemeProvider>);
}

const HEADER = {
  gid: 999,
  source: 'archive',
  game: 1,
  player1: { name: 'alice', rating: 1800 },
  player2: { name: 'bob', rating: 1700 },
  winner: 1,
  site: 'Pente.org',
  event: 'Champs',
  round: '1',
  section: '',
  playDate: '2020-01-01T00:00:00Z',
  moveCount: 2,
};

beforeEach(() => {
  useVenuesQuery.mockReset();
  usePlayersQuery.mockReset();
  useGamesSearchQuery.mockReset();
  useGameQuery.mockReset();
  useVenuesQuery.mockReturnValue({ data: VENUES, isLoading: false });
  usePlayersQuery.mockReturnValue({ data: { players: [] }, isFetching: false });
  useGamesSearchQuery.mockReturnValue({ data: { total: 0, games: [] }, isFetching: false });
  useGameQuery.mockReturnValue({ data: undefined, isSuccess: false });
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ===================================================================================
// FilterForm — wire serialization (null-vs-absent)
// ===================================================================================
describe('buildFilters — exact wire filter object', () => {
  test('an all-default draft serializes to null ("no filters")', () => {
    expect(buildFilters(DEFAULT_DRAFT)).toBeNull();
  });

  test('a single touched field produces the full 11-key DTO; the rest at documented defaults', () => {
    const draft = { ...DEFAULT_DRAFT, player1Name: 'alice' };
    expect(buildFilters(draft)).toEqual({
      player1Name: 'alice',
      player1Seat: 1,
      player2Name: null,
      player2Seat: 2,
      site: null,
      event: null,
      round: null,
      section: null,
      afterDate: null,
      beforeDate: null,
      winner: 0,
    });
  });

  test('every field populated matches the exact wire shape (values trimmed)', () => {
    const draft = {
      ...DEFAULT_DRAFT,
      player1Name: '  Alice ',
      player1Seat: 2,
      player2Name: 'Bob',
      player2Seat: 1,
      site: 'Pente.org',
      event: 'Champs',
      round: '1',
      section: 'A',
      afterDate: '2020-01-01',
      beforeDate: '2020-12-31',
      winner: 1,
    };
    expect(buildFilters(draft)).toEqual({
      player1Name: 'Alice',
      player1Seat: 2,
      player2Name: 'Bob',
      player2Seat: 1,
      site: 'Pente.org',
      event: 'Champs',
      round: '1',
      section: 'A',
      afterDate: '2020-01-01',
      beforeDate: '2020-12-31',
      winner: 1,
    });
  });

  test('a blank (whitespace-only) string filter serializes as null, not empty string', () => {
    // pair the blank field with a real touched field so the object isn't "all defaults"
    // (a lone blank round is indistinguishable from unset — that's the point being tested)
    const f = buildFilters({ ...DEFAULT_DRAFT, player1Name: 'alice', round: '   ' });
    expect(f.round).toBeNull();
  });

  test('game is never part of the filters object (it is a sibling of filters on the wire)', () => {
    const f = buildFilters({ ...DEFAULT_DRAFT, game: 3, player1Name: 'x' });
    expect(f).not.toHaveProperty('game');
  });
});

// ===================================================================================
// player-name autocomplete — 300ms debounce, 2-char minimum
// ===================================================================================
describe('player autocomplete debounce', () => {
  test('usePlayersQuery is skipped under 2 chars, and only fires 300ms after the LAST keystroke', () => {
    renderPlain(<FilterForm initialGame={1} onSubmit={() => {}} />);
    const input = screen.getByLabelText('Player 1');

    fireEvent.change(input, { target: { value: 'a' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(usePlayersQuery.mock.calls.some(([q, opts]) => q === 'a' && opts && opts.skip === false)).toBe(false);

    fireEvent.change(input, { target: { value: 'al' } });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(usePlayersQuery.mock.calls.some(([q, opts]) => q === 'al' && opts && opts.skip === false)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(usePlayersQuery.mock.calls.some(([q, opts]) => q === 'al' && opts && opts.skip === false)).toBe(true);
  });
});

// ===================================================================================
// useVenueOptions — variant / cascading site+event derivation
// ===================================================================================
describe('useVenueOptions', () => {
  function Harness({ game, site }) {
    const { variants, sites, events } = useVenueOptions(game, site);
    return (
      <div>
        <span data-testid="variants">{variants.map((v) => v.name).join(',')}</span>
        <span data-testid="sites">{sites.map((s) => s.name).join(',')}</span>
        <span data-testid="events">{events.map((e) => e.name).join(',')}</span>
      </div>
    );
  }

  test('derives sites for the selected game and events for the selected site', () => {
    render(<Harness game={1} site="Pente.org" />);
    expect(screen.getByTestId('variants').textContent).toBe('Pente');
    expect(screen.getByTestId('sites').textContent).toBe('Pente.org');
    expect(screen.getByTestId('events').textContent).toBe('Champs');
  });

  test('no site selected -> no events', () => {
    render(<Harness game={1} site="" />);
    expect(screen.getByTestId('events').textContent).toBe('');
  });
});

// ===================================================================================
// ResultsList — pagination math + hand-rolled windowing (virtualization)
// ===================================================================================
describe('paginationLabel', () => {
  test('computes "Showing x-y of total"', () => {
    expect(paginationLabel(0, 100, 25)).toBe('Showing 1–25 of 100');
    expect(paginationLabel(25, 100, 25)).toBe('Showing 26–50 of 100');
    expect(paginationLabel(90, 100, 10)).toBe('Showing 91–100 of 100');
  });

  test('zero results shows "Showing 0 of 0"', () => {
    expect(paginationLabel(0, 0, 0)).toBe('Showing 0 of 0');
  });
});

describe('visibleRowRange — windowing math', () => {
  test('at scrollTop 0, renders from row 0 through the viewport (+ overscan)', () => {
    expect(visibleRowRange(0, 200, 50, 100, 2)).toEqual({ start: 0, end: 8 });
  });

  test('scrolled down, the window shifts and keeps overscan on both edges', () => {
    expect(visibleRowRange(500, 200, 50, 100, 2)).toEqual({ start: 8, end: 16 });
  });

  test('clips the end to the actual row count', () => {
    expect(visibleRowRange(0, 200, 50, 3, 2)).toEqual({ start: 0, end: 3 });
  });

  test('zero rows -> empty range', () => {
    expect(visibleRowRange(999, 200, 50, 0, 2)).toEqual({ start: 0, end: 0 });
  });
});

describe('ResultsList — pagination controls', () => {
  test('Previous is disabled on page 1; Next steps the offset and re-queries', () => {
    useGamesSearchQuery.mockReturnValue({
      data: { total: 60, games: Array.from({ length: 25 }, (_, i) => ({ ...HEADER, gid: i + 1 })) },
      isFetching: false,
    });
    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} />);

    expect(screen.getByText('Showing 1–25 of 60')).toBeTruthy();
    expect(screen.getByLabelText('Previous page').disabled).toBe(true);

    // fireEvent wraps in act() and flushes synchronously — no timers involved on this
    // path, so no need for waitFor (which polls on real timers and would deadlock
    // against this file's vi.useFakeTimers()).
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(useGamesSearchQuery.mock.calls.at(-1)[0].offset).toBe(PAGE_SIZE);

    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(useGamesSearchQuery.mock.calls.at(-1)[0].offset).toBe(0);
  });

  test('omits `moves` from the search args (Task 7 is filter-only search)', () => {
    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} />);
    const arg = useGamesSearchQuery.mock.calls.at(-1)[0];
    expect(arg).not.toHaveProperty('moves');
    expect(arg).toEqual({ game: 1, scope: 'archive', filters: null, offset: 0, limit: PAGE_SIZE });
  });
});

describe('ResultsList — null player rendering', () => {
  test('a NULL player (per GameHeader contract) renders as "Unknown" without crashing', () => {
    useGamesSearchQuery.mockReturnValue({
      data: { total: 1, games: [{ ...HEADER, player2: null }] },
      isFetching: false,
    });
    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} />);
    expect(screen.getByText(/Unknown/)).toBeTruthy();
  });
});

// ===================================================================================
// row click -> openTab at final position
// ===================================================================================
describe('row click opens a game tab at the final position', () => {
  test('dispatches openTab with the clicked gid, kind game, and a tree built from the loaded moves', () => {
    useGamesSearchQuery.mockReturnValue({ data: { total: 1, games: [HEADER] }, isFetching: false });
    useGameQuery.mockImplementation((gid) =>
      gid === 999
        ? { data: { header: HEADER, moves: [180, 199] }, isSuccess: true }
        : { data: undefined, isSuccess: false }
    );

    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} />);
    // fireEvent wraps in act() and flushes state + effects synchronously; the click ->
    // useGameQuery(data already resolved by the mock) -> dispatch(openTab) chain has no
    // real async boundary, so no waitFor is needed (and waitFor's real-timer polling
    // would deadlock against this file's vi.useFakeTimers()).
    fireEvent.click(screen.getByText(/alice/));

    const tabs = store.getState().docs.tabs;
    expect(tabs).toHaveLength(1);
    const tab = tabs[0];
    expect(tab.id).toBe('g:999');
    expect(tab.gid).toBe(999);
    expect(tab.kind).toBe('game');
    expect(tab.tree.root.kids[0].m).toBe(180);
    expect(tab.tree.root.kids[0].kids[0].m).toBe(199);
    expect(tab.cursorPath).toEqual([0, 0]);
    expect(store.getState().docs.activeTabId).toBe('g:999');
  });

  test('clicking an already-open game tab re-activates it instead of opening a duplicate', () => {
    useGamesSearchQuery.mockReturnValue({ data: { total: 1, games: [HEADER] }, isFetching: false });
    useGameQuery.mockReturnValue({ data: { header: HEADER, moves: [180] }, isSuccess: true });

    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} />);
    fireEvent.click(screen.getByText(/alice/));
    expect(store.getState().docs.tabs).toHaveLength(1);

    fireEvent.click(screen.getByText(/alice/));
    expect(store.getState().docs.activeTabId).toBe('g:999');
    expect(store.getState().docs.tabs).toHaveLength(1); // no duplicate
  });
});

// ===================================================================================
// SearchPanel — composition / scope placeholder
// ===================================================================================
describe('SearchPanel', () => {
  test('renders the filter form, an Archive-only scope placeholder, and a wired results list', () => {
    const store = makeStore();
    renderWith(store, <SearchPanel />);
    // 'Search' text matches both the panel heading and FilterForm's submit button —
    // scope to the heading role to disambiguate.
    expect(screen.getByRole('heading', { name: 'Search' })).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByLabelText('Mine').disabled).toBe(true);
    expect(screen.getByLabelText('Both').disabled).toBe(true);
    // ResultsList calls the hook with a single args object (no RTK Query options arg).
    expect(useGamesSearchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ game: 1, scope: 'archive', filters: null })
    );
  });
});
