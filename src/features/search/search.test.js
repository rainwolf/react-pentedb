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

import docsReducer, { openTab, activateTab } from '../../model/docSlice';
import uiReducer, { setFilters, selectFilters, clearFilters } from '../../app/uiSlice';

vi.mock('../../app/api', () => ({
  useVenuesQuery: vi.fn(),
  usePlayersQuery: vi.fn(),
  useGamesSearchQuery: vi.fn(),
  useGameQuery: vi.fn(),
  usePingQuery: vi.fn(),
  // used by the CollectionList imported through SearchPanel (only rendered on the My-games tab)
  useCollectionQuery: vi.fn(() => ({ data: { total: 0, games: [] }, isFetching: false })),
  useCollectionGameQuery: vi.fn(() => ({ data: undefined })),
  useDeleteCollectionGameMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), {}]),
  useImportGamesMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), {}]),
  useSaveAnalysisMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), {}]),
}));

// eslint-disable-next-line import/first
import { useVenuesQuery, usePlayersQuery, useGamesSearchQuery, useGameQuery, usePingQuery } from '../../app/api';
// eslint-disable-next-line import/first
import SearchPanel from './SearchPanel';
// eslint-disable-next-line import/first
import FilterForm, { buildFilters, DEFAULT_DRAFT, draftFromFilters } from './FilterForm';
// eslint-disable-next-line import/first
import ResultsList, { gamesCountLabel } from './ResultsList';
// eslint-disable-next-line import/first
import useVenueOptions, { dedupeVariants } from './useVenueOptions';

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

function makeStore(scope) {
  return configureStore({
    reducer: { docs: docsReducer, ui: uiReducer },
    preloadedState: scope ? { ui: { scope } } : undefined,
  });
}

function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
    </Provider>
  );
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
  usePingQuery.mockReset();
  useVenuesQuery.mockReturnValue({ data: VENUES, isLoading: false });
  usePlayersQuery.mockReturnValue({ data: { players: [] }, isFetching: false });
  useGamesSearchQuery.mockReturnValue({ data: { total: 0, games: [] }, isFetching: false });
  useGameQuery.mockReturnValue({ data: undefined, isSuccess: false });
  usePingQuery.mockReturnValue({ data: { auth: null } }); // anonymous by default
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

  test('"Either seat" with no player name is inert: null when nothing else is set, seats stay 1/2', () => {
    expect(buildFilters({ ...DEFAULT_DRAFT, eitherSeat: true })).toBeNull();
    expect(buildFilters({ ...DEFAULT_DRAFT, eitherSeat: true, site: 'Pente.org' })).toMatchObject({
      player1Seat: 1,
      player2Seat: 2,
      site: 'Pente.org',
    });
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
      player2Name: 'Bob',
      eitherSeat: true,
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
      player1Seat: 0,
      player2Name: 'Bob',
      player2Seat: 0,
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
    renderWith(makeStore(), <FilterForm initialGame={1} />);
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

  test('duplicate variant names from leaked turn-based ids are dropped (lowest game id kept)', () => {
    useVenuesQuery.mockReturnValue({
      data: {
        variants: [
          { game: 1, name: 'Pente', sites: [] },
          { game: 2, name: 'Keryo-Pente', sites: [] },
          { game: 3, name: 'Swap2-Pente', sites: [] },
          { game: 77, name: 'Swap2-Pente', sites: [] },
          { game: 79, name: 'Swap2-Keryo', sites: [] },
          { game: 4, name: 'Swap2-Keryo', sites: [] },
        ],
      },
      isLoading: false,
    });
    render(<Harness game={1} site="" />);
    expect(screen.getByTestId('variants').textContent).toBe('Pente,Keryo-Pente,Swap2-Pente,Swap2-Keryo');
  });
});

describe('dedupeVariants', () => {
  test('keeps the lowest game id per name, regardless of input order', () => {
    const out = dedupeVariants([
      { game: 77, name: 'Swap2-Pente' },
      { game: 3, name: 'Swap2-Pente' },
      { game: 1, name: 'Pente' },
    ]);
    expect(out).toEqual([
      { game: 3, name: 'Swap2-Pente' },
      { game: 1, name: 'Pente' },
    ]);
  });

  test('a list with no duplicates is returned unchanged', () => {
    const list = [
      { game: 1, name: 'Pente' },
      { game: 2, name: 'Keryo-Pente' },
    ];
    expect(dedupeVariants(list)).toEqual(list);
  });

  test('empty input -> empty output', () => {
    expect(dedupeVariants([])).toEqual([]);
  });
});

// ===================================================================================
// ResultsList — pagination math + hand-rolled windowing (virtualization)
// ===================================================================================
describe('gamesCountLabel', () => {
  test('"x of N games"', () => {
    expect(gamesCountLabel(25, 100)).toBe('25 of 100 games');
    expect(gamesCountLabel(0, 0)).toBe('0 of 0 games');
  });
});

const rows = (from, n) => Array.from({ length: n }, (_, i) => ({ ...HEADER, gid: from + i }));

describe('ResultsList — Show more + page size', () => {
  test('first page shows "x of N games"; Show more adds a second page query at offset = pageSize', () => {
    useGamesSearchQuery.mockImplementation((arg) => ({
      data: { total: 60, games: rows(arg.offset + 1, Math.min(25, 60 - arg.offset)) }, // realistic last page
      isFetching: false,
    }));
    renderWith(makeStore(), <ResultsList game={1} scope="archive" filters={null} moves={[180]} />);

    expect(screen.getByTestId('games-count').textContent).toBe('25 of 60 games');
    expect(screen.getAllByTestId(/^result-row-/)).toHaveLength(25);

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(useGamesSearchQuery.mock.calls.some(([a]) => a.offset === 25 && a.limit === 25)).toBe(true);
    expect(screen.getByTestId('games-count').textContent).toBe('50 of 60 games');
    expect(screen.getAllByTestId(/^result-row-/)).toHaveLength(50);

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByTestId('games-count').textContent).toBe('60 of 60 games');
    expect(screen.getByRole('button', { name: 'Show more' }).disabled).toBe(true);
  });

  test('page size select (10/25/50/100) re-queries with that limit and resets to the first page', () => {
    useGamesSearchQuery.mockImplementation((arg) => ({
      data: { total: 60, games: rows(1, Math.min(arg.limit, 60)) },
      isFetching: false,
    }));
    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} moves={[180]} />);
    expect(useGamesSearchQuery.mock.calls.at(-1)[0].limit).toBe(25); // default
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Games page size/i }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['10', '25', '50', '100']);
    fireEvent.click(screen.getByRole('option', { name: '10' }));

    expect(store.getState().ui.gamesPageSize).toBe(10);
    expect(useGamesSearchQuery.mock.calls.at(-1)[0]).toMatchObject({ offset: 0, limit: 10 });
    expect(screen.getAllByTestId(/^result-row-/)).toHaveLength(10);
    expect(screen.getByTestId('games-count').textContent).toBe('10 of 60 games');
  });

  test('the shared filters + scope are sent with the position; an empty line omits `moves`', () => {
    const F = buildFilters({ ...DEFAULT_DRAFT, player1Name: 'alice' });
    const { rerender } = renderWith(
      makeStore(),
      <ResultsList game={1} scope="archive" filters={F} moves={[180, 181]} />
    );
    expect(useGamesSearchQuery.mock.calls.at(-1)[0]).toEqual({
      game: 1, moves: [180, 181], scope: 'archive', filters: F, offset: 0, limit: 25,
    });
    // free-first-move empty board: all filter-matching games (desktop parity) => no `moves` key
    rerender(
      <Provider store={makeStore()}>
        <ThemeProvider theme={theme}>
          <ResultsList game={1} scope="archive" filters={F} moves={[]} />
        </ThemeProvider>
      </Provider>
    );
    const arg = useGamesSearchQuery.mock.calls.at(-1)[0];
    expect(arg).not.toHaveProperty('moves');
    expect(arg).toEqual({ game: 1, scope: 'archive', filters: F, offset: 0, limit: 25 });
    expect(screen.getByTestId('position-mode-header').textContent).toBe('All matching games');
  });

  test('stale rows for OLD filters never render as current while the new filters fetch', () => {
    const OLD = { total: 1, games: [{ ...HEADER, gid: 1, player1: { name: 'oldfilter' } }] };
    useGamesSearchQuery.mockReturnValue({ data: OLD, currentData: OLD, isFetching: false });
    const F1 = buildFilters({ ...DEFAULT_DRAFT, player1Name: 'a' });
    const F2 = buildFilters({ ...DEFAULT_DRAFT, player1Name: 'b' });
    const ui = (f, moves) => (
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <ResultsList game={1} scope="archive" filters={f} moves={moves} />
        </ThemeProvider>
      </Provider>
    );
    const store = makeStore();
    const { rerender } = render(ui(F1, [180]));
    expect(screen.getByText(/oldfilter/)).toBeTruthy();
    // RTK retains `data` while the new arg is in flight; currentData is undefined
    useGamesSearchQuery.mockReturnValue({ data: OLD, currentData: undefined, isFetching: true });
    rerender(ui(F2, [180]));
    expect(screen.queryByText(/oldfilter/)).toBeNull();
    // ...but a mere move change under the SAME filters keeps the list (no flicker)
    useGamesSearchQuery.mockReturnValue({ data: OLD, currentData: OLD, isFetching: false });
    rerender(ui(F2, [180]));
    useGamesSearchQuery.mockReturnValue({ data: OLD, currentData: undefined, isFetching: true });
    rerender(ui(F2, [180, 181]));
    expect(screen.getByText(/oldfilter/)).toBeTruthy();
  });
});

describe('ResultsList — error state (P2 pickup)', () => {
  test('a search error is surfaced instead of the empty "No games found" state', () => {
    useGamesSearchQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { status: 500, data: { error: { message: 'search boom' } } },
    });
    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} moves={[]} />);
    expect(screen.getByText('search boom')).toBeTruthy();
    expect(screen.queryByText(/No games found/i)).toBeNull();
  });
});

describe('ResultsList — null player rendering', () => {
  test('a NULL player (per GameHeader contract) renders as "Unknown" without crashing', () => {
    useGamesSearchQuery.mockReturnValue({
      data: { total: 1, games: [{ ...HEADER, player2: null }] },
      isFetching: false,
    });
    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} moves={[]} />);
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
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} moves={[]} />);
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
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} moves={[]} />);
    fireEvent.click(screen.getByText(/alice/));
    expect(store.getState().docs.tabs).toHaveLength(1);

    fireEvent.click(screen.getByText(/alice/));
    expect(store.getState().docs.activeTabId).toBe('g:999');
    expect(store.getState().docs.tabs).toHaveLength(1); // no duplicate
  });

  // FB2 regression: opening a SECOND archived game. RTK Query keeps the previously-opened
  // game's result in `data` while the new gid is still fetching, so the openTab effect used
  // to fire on that STALE object — opening a g:<new> tab with the OLD game's title and an
  // empty/center-only tree (via the `|| []` fallback), then cancelling the real fetch. The
  // fix waits until the fetched response's own header.gid matches the requested gid.
  test('opening a second game while RTK still holds the first game’s data loads the CLICKED game', () => {
    const DATA_A = { header: { ...HEADER, gid: 999 }, moves: [180, 199] };
    const HEADER_B = {
      gid: 888,
      source: 'archive',
      game: 1,
      player1: { name: 'carol' },
      player2: { name: 'dave' },
      winner: 0,
      moveCount: 3,
    };
    const DATA_B = { header: HEADER_B, moves: [100, 101, 102] };

    useGamesSearchQuery.mockReturnValue({ data: { total: 1, games: [HEADER_B] }, isFetching: false });

    // Model the stale read: while gid 888 is in flight, the hook hands back game A's data
    // (isFetching:true); only once `bResolved` flips does 888 return its OWN moves.
    let bResolved = false;
    useGameQuery.mockImplementation((gid, opts) => {
      if (opts && opts.skip) return { data: undefined };
      if (gid === 888) {
        return bResolved ? { data: DATA_B, isFetching: false } : { data: DATA_A, isFetching: true };
      }
      return { data: DATA_A, isFetching: false };
    });

    const store = makeStore();
    // A fresh element each render: rerender(sameElementRef) makes React bail out of
    // re-rendering (identical-element optimization), so the mock would never advance to B.
    const ui = () => (
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <ResultsList game={1} scope="archive" filters={null} moves={[]} />
        </ThemeProvider>
      </Provider>
    );
    const { rerender } = render(ui());

    // Click B while its fetch is "in flight" (data is still A's). The buggy code opened a
    // wrong-titled tab here and cancelled the fetch; the fix must wait.
    fireEvent.click(screen.getByText(/carol/));

    // B's real moves arrive.
    act(() => {
      bResolved = true;
    });
    rerender(ui());

    const tabs = store.getState().docs.tabs;
    expect(tabs).toHaveLength(1); // exactly ONE g:888 tab, no junk/duplicate
    const tab = tabs[0];
    expect(tab.id).toBe('g:888');
    expect(tab.gid).toBe(888);
    expect(tab.title).toBe('carol vs dave'); // B's title, NOT A's ('alice vs bob')
    expect(tab.tree.root.kids[0].m).toBe(100); // B's full moves, NOT empty/center-only
    expect(tab.tree.root.kids[0].kids[0].m).toBe(101);
    expect(tab.tree.root.kids[0].kids[0].kids[0].m).toBe(102);
    expect(tab.cursorPath).toEqual([0, 0, 0]);
    expect(store.getState().docs.activeTabId).toBe('g:888');

    // Clicking B again reuses the same tab (no duplicate).
    fireEvent.click(screen.getByText(/carol/));
    expect(store.getState().docs.tabs).toHaveLength(1);
    expect(store.getState().docs.activeTabId).toBe('g:888');
  });

  test('a failed game fetch surfaces an error instead of spinning forever', () => {
    useGamesSearchQuery.mockReturnValue({ data: { total: 1, games: [HEADER] }, isFetching: false });
    useGameQuery.mockImplementation((_gid, opts) =>
      opts && opts.skip
        ? { data: undefined }
        : { data: undefined, isError: true, error: { status: 500, data: { error: { message: 'game boom' } } } }
    );

    const store = makeStore();
    renderWith(store, <ResultsList game={1} scope="archive" filters={null} moves={[]} />);
    fireEvent.click(screen.getByText(/alice/));

    expect(store.getState().docs.tabs).toHaveLength(0); // no junk tab on a failed open
    expect(screen.getByText('game boom')).toBeTruthy(); // error surfaced, not a silent no-op
  });
});

// ===================================================================================
// SearchPanel — composition / auth-gated scope + import / scope wiring
// ===================================================================================
describe('SearchPanel', () => {
  test('anonymous: no scope toggle, no import button, and NO games list (the explorer owns it)', () => {
    const store = makeStore();
    renderWith(store, <SearchPanel />);
    expect(screen.getByRole('heading', { name: 'Search' })).toBeTruthy();
    // ScopeToggle renders nothing while anonymous, and there is no Import affordance.
    expect(screen.queryByLabelText('Mine')).toBeNull();
    expect(screen.queryByRole('button', { name: /Import/i })).toBeNull();
    expect(screen.getByLabelText('Player 1')).toBeTruthy(); // the filter form is there
    expect(useGamesSearchQuery).not.toHaveBeenCalled(); // the left filter-only list is gone
  });

  test('logged-in: shows the Archive/Mine/Both toggle and an Import button', () => {
    usePingQuery.mockReturnValue({ data: { auth: 'iostest' } });
    const store = makeStore();
    renderWith(store, <SearchPanel />);
    expect(screen.getByLabelText('Archive')).toBeTruthy();
    expect(screen.getByLabelText('Mine')).toBeTruthy();
    expect(screen.getByLabelText('Both')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Import/i })).toBeTruthy();
  });

  test('logged OUT: the scope toggle is hidden', () => {
    usePingQuery.mockReturnValue({ data: { auth: null } });
    const store = makeStore('mine');
    renderWith(store, <SearchPanel />);
    expect(screen.queryByLabelText('Mine')).toBeNull();
  });
});

// ===================================================================================
// FilterForm -> shared applied filters (ui slice)
// ===================================================================================
describe('FilterForm applies to the shared store', () => {
  const applied = (store) => selectFilters(store.getState());

  test('selects apply immediately: winner, then site + event', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Winner/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Player 2' }));
    expect(applied(store)).toMatchObject({ winner: 2, player1Name: null, site: null });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Site/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Pente.org' }));
    expect(applied(store)).toMatchObject({ winner: 2, site: 'Pente.org', event: null });
  });

  test('text fields do NOT apply while typing; they apply on blur and on Enter', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    const p1 = screen.getByLabelText('Player 1');
    fireEvent.change(p1, { target: { value: 'alice' } });
    expect(applied(store)).toBeNull();
    fireEvent.blur(p1);
    expect(applied(store)).toMatchObject({ player1Name: 'alice' });

    const round = screen.getByLabelText('Round');
    fireEvent.change(round, { target: { value: '3' } });
    expect(applied(store).round).toBeNull();
    fireEvent.keyDown(round, { key: 'Enter' });
    expect(applied(store)).toMatchObject({ player1Name: 'alice', round: '3' });

    const after = screen.getByLabelText('After date');
    fireEvent.change(after, { target: { value: '2020-01-01' } });
    fireEvent.blur(after);
    expect(applied(store).afterDate).toBe('2020-01-01');
  });

  test('autocomplete pick applies at once', () => {
    usePlayersQuery.mockReturnValue({ data: { players: ['alice', 'alicia'] }, isFetching: false });
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    const p1 = screen.getByLabelText('Player 1');
    fireEvent.change(p1, { target: { value: 'ali' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(screen.getByRole('option', { name: 'alicia' }));
    expect(applied(store)).toMatchObject({ player1Name: 'alicia' });
  });

  test('the Search button is an explicit apply', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'B' } });
    expect(applied(store)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(applied(store)).toMatchObject({ section: 'B' });
  });

  test('"Clear filters" empties the form and the store', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    const p1 = screen.getByLabelText('Player 1');
    fireEvent.change(p1, { target: { value: 'alice' } });
    fireEvent.blur(p1);
    expect(applied(store)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(applied(store)).toBeNull();
    expect(screen.getByLabelText('Player 1').value).toBe('');
  });

  test('the draft follows the store: external clear-all empties the fields; mount shows applied values', () => {
    const store = makeStore();
    store.dispatch(setFilters(buildFilters({ ...DEFAULT_DRAFT, player1Name: 'carol', round: '2' })));
    renderWith(store, <FilterForm initialGame={1} />);
    expect(screen.getByLabelText('Player 1').value).toBe('carol'); // survives a tab-switch remount
    expect(screen.getByLabelText('Round').value).toBe('2');
    act(() => {
      store.dispatch(setFilters(null));
    });
    expect(screen.getByLabelText('Player 1').value).toBe('');
    expect(screen.getByLabelText('Round').value).toBe('');
  });

  test('a variant switch resets the applied site/event (names are per-variant) but keeps other filters', () => {
    const TWO = {
      variants: [
        { game: 1, name: 'Pente', sites: [{ id: 2, name: 'Pente.org', events: [] }] },
        { game: 5, name: 'Gomoku', sites: [] },
      ],
    };
    useVenuesQuery.mockReturnValue({ data: TWO, isLoading: false });
    const store = makeStore();
    store.dispatch(openTab({ kind: 'scratch', title: 'T', game: 1 }));
    store.dispatch(setFilters(buildFilters({ ...DEFAULT_DRAFT, player1Name: 'dan', site: 'Pente.org' })));
    renderWith(store, <SearchPanel />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Variant/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Gomoku' }));
    expect(applied(store)).toMatchObject({ player1Name: 'dan', site: null, event: null });
  });

  test('"Either seat" ticked with no player name: nothing applied, store untouched, box stays ticked', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    const before = store.getState().ui;
    const box = screen.getByRole('checkbox', { name: 'Either seat' });
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(applied(store)).toBeNull();
    expect(store.getState().ui).toBe(before); // no dispatch changed state, so no refetch either
    act(() => {
      store.dispatch(setFilters(null)); // re-sync path must not untick it
    });
    expect(screen.getByRole('checkbox', { name: 'Either seat' }).checked).toBe(true);
  });

  test('"Either seat" ticked with a player name applies seats 0/0; clearing the name goes back to null', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    const p2 = screen.getByLabelText('Player 2');
    fireEvent.change(p2, { target: { value: 'bob' } });
    fireEvent.blur(p2);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Either seat' }));
    expect(applied(store)).toMatchObject({ player2Name: 'bob', player1Seat: 0, player2Seat: 0 });

    fireEvent.change(screen.getByLabelText('Player 2'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Player 2'));
    expect(applied(store)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Either seat' }).checked).toBe(true);
  });

  test('"Clear filters" unticks "Either seat"', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    const p1 = screen.getByLabelText('Player 1');
    fireEvent.change(p1, { target: { value: 'alice' } });
    fireEvent.blur(p1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Either seat' }));
    expect(applied(store)).toMatchObject({ player1Seat: 0, player2Seat: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('checkbox', { name: 'Either seat' }).checked).toBe(false);
  });

  test('the chip "Clear all" (clearFilters) unticks "Either seat"', () => {
    const store = makeStore();
    renderWith(store, <FilterForm initialGame={1} />);
    const p1 = screen.getByLabelText('Player 1');
    fireEvent.change(p1, { target: { value: 'alice' } });
    fireEvent.blur(p1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Either seat' }));
    act(() => {
      store.dispatch(clearFilters()); // what ActiveFilters' "Clear all" dispatches (ExplorerPanel)
    });
    expect(applied(store)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Either seat' }).checked).toBe(false);
  });

  test('draftFromFilters inverts buildFilters', () => {
    const d = { ...DEFAULT_DRAFT, game: 3, player1Name: 'x', eitherSeat: true, winner: 1, afterDate: '2020-01-01' };
    expect(draftFromFilters(buildFilters(d), 3)).toEqual(d);
    expect(draftFromFilters(null, 3)).toEqual({ ...DEFAULT_DRAFT, game: 3 });
  });

  test('draftFromFilters ticks "Either seat" only when both applied seats are 0', () => {
    expect(draftFromFilters({ player1Name: 'x', player1Seat: 0, player2Seat: 0 }, 1).eitherSeat).toBe(true);
    expect(draftFromFilters({ player1Name: 'x', player1Seat: 1, player2Seat: 2 }, 1).eitherSeat).toBe(false);
    // legacy combo (not reachable from the form any more): unticked, seats reset to 1/2 on next apply
    const legacy = draftFromFilters({ player1Name: 'x', player1Seat: 2, player2Seat: 1 }, 1);
    expect(legacy.eitherSeat).toBe(false);
    expect(buildFilters({ ...legacy, player2Name: 'y' })).toMatchObject({ player1Seat: 1, player2Seat: 2 });
  });
});

// ===================================================================================
// Variant select -> workbench follows (switchToVariant), search itself still waits for submit
// ===================================================================================
describe('Variant select drives the workbench', () => {
  const TWO = { variants: [{ game: 1, name: 'Pente', sites: [] }, { game: 5, name: 'Gomoku', sites: [] }] };
  test('changing Variant retargets the untouched active scratch tab; results query unchanged until submit', () => {
    useVenuesQuery.mockReturnValue({ data: TWO, isLoading: false });
    const store = makeStore();
    store.dispatch(openTab({ kind: 'scratch', title: 'New position', game: 1 }));
    renderWith(store, <SearchPanel />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Variant/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Gomoku' }));
    const t = store.getState().docs.tabs.find((x) => x.id === store.getState().docs.activeTabId);
    expect(t.game).toBe(5);
    expect(useGamesSearchQuery).not.toHaveBeenCalledWith(expect.objectContaining({ game: 5 }));
  });
});

describe('Variant select follows the active tab', () => {
  const TWO = { variants: [{ game: 1, name: 'Pente', sites: [] }, { game: 5, name: 'Gomoku', sites: [] }] };
  test('switching to a tab of another game updates the select, without re-switching or submitting', () => {
    useVenuesQuery.mockReturnValue({ data: TWO, isLoading: false });
    const store = makeStore();
    store.dispatch(openTab({ id: 'a', kind: 'scratch', title: 'A', game: 1 }));
    store.dispatch(openTab({ id: 'b', kind: 'scratch', title: 'B', game: 5 }));
    store.dispatch(activateTab('a'));
    renderWith(store, <SearchPanel />);
    const sel = () => screen.getByRole('combobox', { name: /Variant/i }).textContent;
    expect(sel()).toBe('Pente');
    const before = store.getState().docs.tabs.length;
    useGamesSearchQuery.mockClear();
    act(() => {
      store.dispatch(activateTab('b'));
    });
    expect(sel()).toBe('Gomoku');
    expect(store.getState().docs.tabs).toHaveLength(before);
    expect(store.getState().docs.activeTabId).toBe('b');
    expect(useGamesSearchQuery).not.toHaveBeenCalledWith(expect.objectContaining({ game: 5 }));
  });
});
