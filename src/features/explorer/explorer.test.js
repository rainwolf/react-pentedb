// Explorer tests (P2 Task 8, brief Step 1):
//   - heatScale: distinct colors for 0/50/100; deterministic (identical output for
//     identical input, and identical across the light/dark themes — the placeholder ramp
//     is theme-independent so a rotated/re-themed board never shifts a cell's heat).
//   - useDebouncedPosition: rapid navigation collapses into ONE settled position (150ms,
//     fake timers) — the intermediate lines never surface, so position-stats fires once.
//   - StatsRows: sortedRows (games desc), totalsRow math, move labels; a row click calls
//     onSelect with the CANONICAL move cell (never a display/rotated cell); hover → onHover.
//   - HeatOverlay: one ghost per candidate; the ghost is placed at symCell(canonicalMove,
//     rotation) — i.e. it transforms canonical → display with the CURRENT rotation before
//     rendering (the rotation correctness seam) — and is filled by heatScale(winPct).
//   - ExplorerPanel: queries usePositionStatsQuery with the CANONICAL active line; a stats
//     row click dispatches applyMove(canonicalCell); "games through here" drives ResultsList
//     in position-constrained mode with the canonical line.
//   - ResultsList: position-constrained mode (moves prop) includes `moves` in the search arg
//     and shows a "games through this position" header; filter-only mode still omits `moves`.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, navNext, selectActivePosition } from '../../model/docSlice';
import { createTree, addMove } from '../../model/gameTree';
import { symCell } from '../viewer/boardSymmetry';

vi.mock('../../app/api', () => ({
  usePositionStatsQuery: vi.fn(),
  useGamesSearchQuery: vi.fn(),
  useGameQuery: vi.fn(),
  usePingQuery: vi.fn(),
}));

// eslint-disable-next-line import/first
import { usePositionStatsQuery, useGamesSearchQuery, useGameQuery, usePingQuery } from '../../app/api';
// eslint-disable-next-line import/first
import uiReducer, {
  setRotation,
  setHeatOnBoard,
  setHeatHoverCell,
  selectHeatOnBoard,
  selectHeatHoverCell,
} from '../../app/uiSlice';
// eslint-disable-next-line import/first
import heatColor, { heatDomain, heatT } from './heatScale';
// eslint-disable-next-line import/first
import useDebouncedPosition from './useDebouncedPosition';
// eslint-disable-next-line import/first
import StatsRows, { sortedRows, totalsRow, moveLabel } from './StatsRows';
// eslint-disable-next-line import/first
import HeatOverlay from './HeatOverlay';
// eslint-disable-next-line import/first
import BoardHeatOverlay from './BoardHeatOverlay';
// eslint-disable-next-line import/first
import ExplorerPanel from './ExplorerPanel';
// eslint-disable-next-line import/first
import ResultsList from '../search/ResultsList';

const theme = createTheme();
const N = 19;

const NEXT_MOVES = [
  { move: 200, games: 10, wins: 6, winPct: 60 },
  { move: 220, games: 30, wins: 9, winPct: 30 },
  { move: 240, games: 5, wins: 5, winPct: 100 },
];
const STATS = { totalGames: 100, totalWinPct: 55, rotation: 0, nextMoves: NEXT_MOVES };

function treeFromLine(moves) {
  let tree = createTree();
  let path = [];
  for (const m of moves) {
    const res = addMove(tree, path, m);
    tree = res.tree;
    path = res.path;
  }
  return { tree, path };
}

function makeStore(moves = [180], cursorPath = [0], game = 1) {
  const store = configureStore({ reducer: { docs: docsReducer } });
  const { tree } = treeFromLine(moves);
  store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game, tree, cursorPath }));
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

// A store whose ui slice carries a preloaded scope, plus one scratch tab at [180].
function makeScopedStore(scope) {
  const store = configureStore({
    reducer: { docs: docsReducer, ui: uiReducer },
    preloadedState: { ui: { scope } },
  });
  const { tree } = treeFromLine([180]);
  store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game: 1, tree, cursorPath: [0] }));
  return store;
}

// A store shaped like the real app store: docs + ui + a stand-in `api` slice. BoardHeatOverlay
// only fires the (mocked) position-stats query when an `api` slice is present, so the docs+ui
// stores the viewer/threats tests build stay inert. A no-op reducer with a stable identity is
// enough for the presence check.
const apiStub = (s = {}) => s;
function makeBoardStore(moves = [180], rotation = 0) {
  const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer, api: apiStub } });
  const { tree } = treeFromLine(moves);
  store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game: 1, tree, cursorPath: [0] }));
  if (rotation) store.dispatch(setRotation(rotation));
  return store;
}

afterEach(() => {
  cleanup();
});

// ===================================================================================
// heatColor / heatT / heatDomain — green→red RELATIVE heat, matching the mobile DB apps
// (pentelive-android DatabaseActivity + penteLive-iOS DatabaseViewController): a min-max
// normalized red→yellow→green lerp across the displayed candidate set.
// ===================================================================================
describe('heatColor — green→red ramp (t: 0→red, 0.5→yellow, 1→green)', () => {
  test('endpoints: t=0 pure red, t=0.5 yellow, t=1 pure green', () => {
    expect(heatColor(0)).toBe('rgb(255, 0, 0)');
    expect(heatColor(0.5)).toBe('rgb(255, 255, 0)');
    expect(heatColor(1)).toBe('rgb(0, 255, 0)');
  });

  test('is deterministic and clamps out-of-range t to the endpoints', () => {
    expect(heatColor(0.37)).toBe(heatColor(0.37));
    expect(heatColor(-1)).toBe(heatColor(0));
    expect(heatColor(2)).toBe(heatColor(1));
  });

  test('null / NaN t yields a neutral (no-data) color, distinct from the ramp ends', () => {
    const neutral = heatColor(null);
    expect(neutral).toBe(heatColor(undefined));
    expect(neutral).not.toBe(heatColor(0));
    expect(neutral).not.toBe(heatColor(1));
  });
});

describe('heatT / heatDomain — relative normalization over the displayed set', () => {
  // NEXT_MOVES win% = [60, 30, 100] → domain {min:30, max:100}.
  const dom = heatDomain(NEXT_MOVES.map((m) => m.winPct));

  test('heatDomain is the min/max of the displayed win% values', () => {
    expect(dom).toEqual({ min: 30, max: 100 });
  });

  test('best move in the set → t=1 (green), worst → t=0 (red)', () => {
    expect(heatT(100, dom)).toBe(1);
    expect(heatT(30, dom)).toBe(0);
    expect(heatColor(heatT(100, dom))).toBe('rgb(0, 255, 0)');
    expect(heatColor(heatT(30, dom))).toBe('rgb(255, 0, 0)');
  });

  test('a mid-set value lands strictly between the poles', () => {
    const t = heatT(60, dom);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
  });

  test('max===min fallback: domain treated as 0..100 (t = value/100)', () => {
    expect(heatT(50, { min: 50, max: 50 })).toBe(0.5);
    expect(heatColor(heatT(50, heatDomain([50])))).toBe('rgb(255, 255, 0)');
    expect(heatT(100, { min: 20, max: 20 })).toBe(1); // 100/100
    expect(heatT(0, { min: 20, max: 20 })).toBe(0);
  });

  test('null / undefined win% → t is null (rendered as no-data)', () => {
    expect(heatT(null, dom)).toBeNull();
    expect(heatT(undefined, dom)).toBeNull();
  });

  test('the rendered heat is identical under light and dark themes (theme-independent)', () => {
    const cells = [{ move: 180, winPct: 50 }]; // singleton set → domain {50,50} → t=0.5 → yellow
    const light = createTheme({ palette: { mode: 'light' } });
    const dark = createTheme({ palette: { mode: 'dark' } });
    const { container: cl } = render(
      <ThemeProvider theme={light}>
        <HeatOverlay cells={cells} gridSize={N} rotation={0} />
      </ThemeProvider>
    );
    const lightFill = cl.querySelector('circle').getAttribute('fill');
    cleanup();
    const { container: cd } = render(
      <ThemeProvider theme={dark}>
        <HeatOverlay cells={cells} gridSize={N} rotation={0} />
      </ThemeProvider>
    );
    const darkFill = cd.querySelector('circle').getAttribute('fill');
    expect(lightFill).toBe(darkFill);
    expect(lightFill).toBe(heatColor(0.5));
  });
});

// ===================================================================================
// useDebouncedPosition — collapses rapid nav into a single settled position
// ===================================================================================
describe('useDebouncedPosition', () => {
  function DHarness() {
    const p = useDebouncedPosition(150);
    return <span data-testid="dm">{p ? p.moves.join('-') : 'none'}</span>;
  }

  test('rapid navigation within the window collapses to ONE settled position (150ms)', () => {
    vi.useFakeTimers();
    try {
      const store = makeStore([180, 200, 220], []); // cursor at root -> empty displayed line
      renderWith(store, <DHarness />);
      expect(screen.getByTestId('dm').textContent).toBe('');

      act(() => {
        store.dispatch(navNext());
      }); // -> [180]
      act(() => {
        vi.advanceTimersByTime(50);
      });
      act(() => {
        store.dispatch(navNext());
      }); // -> [180,200]
      act(() => {
        vi.advanceTimersByTime(50);
      });
      act(() => {
        store.dispatch(navNext());
      }); // -> [180,200,220]

      // still inside the debounce window since the LAST change: no intermediate surfaced.
      expect(screen.getByTestId('dm').textContent).toBe('');

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.getByTestId('dm').textContent).toBe('180-200-220');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ===================================================================================
// StatsRows — sort / totals math / labels / row interactions (canonical cells)
// ===================================================================================
describe('StatsRows helpers', () => {
  test('sortedRows orders by games descending', () => {
    expect(sortedRows(NEXT_MOVES).map((r) => r.move)).toEqual([220, 200, 240]);
  });

  test('totalsRow sums games/wins and computes the aggregate win%', () => {
    expect(totalsRow(NEXT_MOVES)).toEqual({ games: 45, wins: 20, winPct: 44.4 });
  });

  test('totalsRow on an empty set is all zeros (no divide-by-zero)', () => {
    expect(totalsRow([])).toEqual({ games: 0, wins: 0, winPct: 0 });
  });

  test('moveLabel maps a flat cell to a board coordinate', () => {
    // 180 is the centre of a 19x19 board (x=9, y=9) -> column K (I skipped), row 10.
    expect(moveLabel(180, N)).toBe('K10');
  });

  // Characterization/regression values, independently computed (cell = x + y*n, row = n-y,
  // columns skip I) — must stay byte-identical whether moveLabel computes them itself or
  // delegates to the shared, size-aware cellToAlpha (src/export/coords.js). moveLabel is
  // called with gridSize 9/13/19 in real usage (AiPanel/ExplorerPanel via gridSizeForGame),
  // so this is the guard against a consolidation silently mislabeling small-board variants.
  test('moveLabel is size-aware across board sizes (9/13/19), null-safe regardless of size', () => {
    expect(moveLabel(180, 19)).toBe('K10'); // 19-board centre
    expect(moveLabel(84, 13)).toBe('G7'); // 13-board centre
    expect(moveLabel(40, 9)).toBe('E5'); // 9-board centre (matches real Go 9x9 notation)
    expect(moveLabel(null, 13)).toBe('');
  });

  // Pass-move regression: the pass sentinel is gridSize*gridSize (GameClass — Go AND Renju
  // share it; Renju passes are a shipped, DB-persisted feature). Before this fix, the
  // consolidated moveLabel (delegating straight to cellToAlpha) would throw RangeError on the
  // sentinel -> render CRASH. It must render "PASS" instead, at every real board size.
  test('moveLabel renders "PASS" for the pass sentinel instead of throwing, at every board size', () => {
    expect(moveLabel(19 * 19, 19)).toBe('PASS');
    expect(moveLabel(13 * 13, 13)).toBe('PASS');
    expect(moveLabel(9 * 9, 9)).toBe('PASS');
    expect(moveLabel(15 * 15, 15)).toBe('PASS'); // Renju (gridSizeForGame 31/32/81)
  });
});

describe('StatsRows — interaction', () => {
  test('a row click calls onSelect with the CANONICAL move cell', () => {
    const onSelect = vi.fn();
    renderWith(makeStore(), <StatsRows rows={sortedRows(NEXT_MOVES)} gridSize={N} onSelect={onSelect} onHover={() => {}} />);
    fireEvent.click(screen.getByTestId('stats-row-220'));
    expect(onSelect).toHaveBeenCalledWith(220);
  });

  test('hovering a row calls onHover with the canonical cell (and null on leave)', () => {
    const onHover = vi.fn();
    renderWith(makeStore(), <StatsRows rows={sortedRows(NEXT_MOVES)} gridSize={N} onSelect={() => {}} onHover={onHover} />);
    const row = screen.getByTestId('stats-row-200');
    fireEvent.mouseEnter(row);
    expect(onHover).toHaveBeenLastCalledWith(200);
    fireEvent.mouseLeave(row);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  test('renders a totals row reflecting the aggregate games count', () => {
    renderWith(makeStore(), <StatsRows rows={sortedRows(NEXT_MOVES)} gridSize={N} onSelect={() => {}} onHover={() => {}} />);
    const totals = screen.getByTestId('stats-totals');
    expect(totals.textContent).toContain('45');
  });
});

// ===================================================================================
// HeatOverlay — canonical → display transform under the current rotation
// ===================================================================================
describe('HeatOverlay', () => {
  const CELLS = [
    { move: 180, winPct: 50 },
    { move: 200, winPct: 80 },
  ];

  test('renders one ghost per candidate, colored by RELATIVE heat over the shown set', () => {
    const { container } = renderWith(makeStore(), <HeatOverlay cells={CELLS} gridSize={N} rotation={0} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    const dom = heatDomain(CELLS.map((c) => c.winPct)); // {min:50, max:80}
    // worst-of-set (50) reads pure red; best-of-set (80) reads pure green.
    expect(container.querySelector('circle[data-canonical="180"]').getAttribute('fill')).toBe(
      heatColor(heatT(50, dom))
    );
    expect(container.querySelector('circle[data-canonical="180"]').getAttribute('fill')).toBe('rgb(255, 0, 0)');
    expect(container.querySelector('circle[data-canonical="200"]').getAttribute('fill')).toBe('rgb(0, 255, 0)');
  });

  test('the hovered candidate is highlighted MUCH brighter than the ambient heat', () => {
    const { container } = renderWith(
      makeStore(),
      <HeatOverlay cells={CELLS} gridSize={N} rotation={0} hoverCell={200} />
    );
    const hovered = container.querySelector('circle[data-canonical="200"]');
    const ambient = container.querySelector('circle[data-canonical="180"]');
    expect(hovered.getAttribute('data-hover')).toBe('true');
    expect(ambient.getAttribute('data-hover')).toBe('false');
    // full-opacity fill vs a dim ambient disc
    expect(Number(hovered.getAttribute('fill-opacity'))).toBe(1);
    expect(Number(ambient.getAttribute('fill-opacity'))).toBeLessThan(1);
    // a bright white high-contrast outline on the hovered cell
    expect(hovered.getAttribute('stroke').toLowerCase()).toBe('#ffffff');
    // ...and a dedicated bright ring marker that pops the cell out
    expect(container.querySelector('[data-testid="heat-hover-ring"]')).toBeTruthy();
  });

  test('at rotation 0 a ghost sits on its canonical cell', () => {
    const { container } = renderWith(makeStore(), <HeatOverlay cells={CELLS} gridSize={N} rotation={0} />);
    const c = container.querySelector('circle[data-canonical="200"]');
    expect(c.getAttribute('data-cell')).toBe(String(symCell(200, 0, N)));
  });

  test('under a rotation the ghost is placed at symCell(canonical, rotation) — display, not canonical', () => {
    const rotation = 1;
    const { container } = renderWith(makeStore(), <HeatOverlay cells={CELLS} gridSize={N} rotation={rotation} />);
    const c = container.querySelector('circle[data-canonical="200"]');
    // display cell differs from the canonical one under this (non-identity) rotation
    expect(symCell(200, rotation, N)).not.toBe(200);
    expect(c.getAttribute('data-cell')).toBe(String(symCell(200, rotation, N)));
  });
});

// ===================================================================================
// ExplorerPanel — canonical query, applyMove on click, games-through-here
// ===================================================================================
describe('ExplorerPanel', () => {
  test('queries position-stats with the CANONICAL active line, archive scope', () => {
    renderWith(makeStore([180], [0]), <ExplorerPanel />);
    const arg = usePositionStatsQuery.mock.calls.at(-1)[0];
    expect(arg).toEqual(expect.objectContaining({ game: 1, moves: [180], scope: 'archive' }));
  });

  test('clicking a stats row dispatches applyMove with the canonical cell (extends the line)', () => {
    const store = makeStore([180], [0]);
    renderWith(store, <ExplorerPanel />);
    fireEvent.click(screen.getByTestId('stats-row-200'));
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);
  });

  test('"games through here" drives ResultsList in position-constrained mode with the canonical line', () => {
    renderWith(makeStore([180], [0]), <ExplorerPanel />);
    const arg = useGamesSearchQuery.mock.calls.at(-1)[0];
    expect(arg.moves).toEqual([180]);
  });

  test('shows the position summary (total games) from the stats response', () => {
    renderWith(makeStore([180], [0]), <ExplorerPanel />);
    expect(screen.getByTestId('explorer-summary').textContent).toContain('100');
  });

  test('a stats query error is surfaced instead of a silent empty summary (P2 pickup)', () => {
    usePositionStatsQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { status: 500, data: { error: { message: 'stats boom' } } },
    });
    renderWith(makeStore([180], [0]), <ExplorerPanel />);
    expect(screen.getByText('stats boom')).toBeTruthy();
    expect(screen.queryByTestId('explorer-summary')).toBeNull();
  });

  test('logged-in scope=mine queries with the selected scope', () => {
    usePingQuery.mockReturnValue({ data: { auth: 'iostest' } });
    renderWith(makeScopedStore('mine'), <ExplorerPanel />);
    expect(usePositionStatsQuery.mock.calls.at(-1)[0].scope).toBe('mine');
  });

  test('logged OUT coerces a lingering mine scope back to archive (no 401 loop)', () => {
    usePingQuery.mockReturnValue({ data: { auth: null } });
    renderWith(makeScopedStore('mine'), <ExplorerPanel />);
    expect(usePositionStatsQuery.mock.calls.at(-1)[0].scope).toBe('archive');
  });

  test('renders a "show heat on board" toggle (default ON) wired to the ui slice', () => {
    const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
    const { tree } = treeFromLine([180]);
    store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game: 1, tree, cursorPath: [0] }));
    renderWith(store, <ExplorerPanel />);
    const toggle = screen.getByTestId('heat-on-board-toggle');
    expect(toggle.checked).toBe(true); // overlaid by default; the toggle turns it OFF
    fireEvent.click(toggle);
    expect(selectHeatOnBoard(store.getState())).toBe(false);
  });

  test('hovering a stats row lifts the canonical hover cell into the ui slice (drives the board)', () => {
    const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
    const { tree } = treeFromLine([180]);
    store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game: 1, tree, cursorPath: [0] }));
    renderWith(store, <ExplorerPanel />);
    fireEvent.mouseEnter(screen.getByTestId('stats-row-200'));
    expect(selectHeatHoverCell(store.getState())).toBe(200);
    fireEvent.mouseLeave(screen.getByTestId('stats-row-200'));
    expect(selectHeatHoverCell(store.getState())).toBeNull();
  });
});

// ===================================================================================
// BoardHeatOverlay — the green→red heat overlaid on the REAL board, driven by the ui
// toggle + shared hover cell + shared board rotation. Reuses HeatOverlay (rotation-aware).
// ===================================================================================
describe('BoardHeatOverlay', () => {
  test('toggle ON + stats present: renders a ghost per candidate, rotation-aware', () => {
    const store = makeBoardStore([180], 1); // shared board rotation 1
    const { container } = renderWith(store, <BoardHeatOverlay />);
    const circles = container.querySelectorAll('[data-testid="heat-overlay"] circle');
    expect(circles.length).toBe(NEXT_MOVES.length);
    // rotation-aware: a candidate sits at symCell(canonical, rotation), NOT the canonical cell.
    const c = container.querySelector('circle[data-canonical="240"]');
    expect(c.getAttribute('data-cell')).toBe(String(symCell(240, 1, N)));
  });

  test('toggle OFF: renders nothing AND fires no position-stats network query (skip)', () => {
    const store = makeBoardStore([180]);
    store.dispatch(setHeatOnBoard(false));
    usePositionStatsQuery.mockClear();
    const { container } = renderWith(store, <BoardHeatOverlay />);
    expect(container.querySelector('[data-testid="heat-overlay"]')).toBeNull();
    // if the query hook ran at all, it must have been skipped (no request issued)
    const call = usePositionStatsQuery.mock.calls.at(-1);
    if (call) expect(call[1]).toEqual(expect.objectContaining({ skip: true }));
  });

  test('no api slice (bare docs+ui store): renders nothing, never touches the query hook', () => {
    const bare = configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
    const { tree } = treeFromLine([180]);
    bare.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game: 1, tree, cursorPath: [0] }));
    usePositionStatsQuery.mockClear();
    const { container } = renderWith(bare, <BoardHeatOverlay />);
    expect(container.querySelector('[data-testid="heat-overlay"]')).toBeNull();
    expect(usePositionStatsQuery).not.toHaveBeenCalled();
  });

  test('shared hover cell (ui slice) brightly highlights that candidate on the board', () => {
    const store = makeBoardStore([180]);
    store.dispatch(setHeatHoverCell(240));
    const { container } = renderWith(store, <BoardHeatOverlay />);
    const hovered = container.querySelector('circle[data-canonical="240"]');
    expect(hovered.getAttribute('data-hover')).toBe('true');
    expect(Number(hovered.getAttribute('fill-opacity'))).toBe(1);
    expect(container.querySelector('[data-testid="heat-hover-ring"]')).toBeTruthy();
  });
});

// ===================================================================================
// uiSlice — heat-on-board toggle + shared hover cell
// ===================================================================================
describe('uiSlice — heat toggle + hover cell', () => {
  test('heatOnBoard defaults ON; setHeatOnBoard flips it; selector reads it', () => {
    const store = configureStore({ reducer: { ui: uiReducer } });
    expect(selectHeatOnBoard(store.getState())).toBe(true);
    store.dispatch(setHeatOnBoard(false));
    expect(selectHeatOnBoard(store.getState())).toBe(false);
    store.dispatch(setHeatOnBoard(true));
    expect(selectHeatOnBoard(store.getState())).toBe(true);
  });

  test('selectHeatOnBoard defaults to true even on a store without the ui slice', () => {
    expect(selectHeatOnBoard({})).toBe(true);
  });

  test('heatHoverCell round-trips through setHeatHoverCell (number and null)', () => {
    const store = configureStore({ reducer: { ui: uiReducer } });
    expect(selectHeatHoverCell(store.getState())).toBeNull();
    store.dispatch(setHeatHoverCell(240));
    expect(selectHeatHoverCell(store.getState())).toBe(240);
    store.dispatch(setHeatHoverCell(null));
    expect(selectHeatHoverCell(store.getState())).toBeNull();
  });

  test('selectHeatHoverCell defaults to null on a store without the ui slice', () => {
    expect(selectHeatHoverCell({})).toBeNull();
  });
});

// ===================================================================================
// ResultsList — position-constrained ("games through here") mode
// ===================================================================================
describe('ResultsList — position-constrained mode', () => {
  test('with a moves prop the search arg INCLUDES moves and a header is shown', () => {
    renderWith(makeStore(), <ResultsList game={1} scope="archive" filters={null} moves={[180, 200]} />);
    const arg = useGamesSearchQuery.mock.calls.at(-1)[0];
    expect(arg.moves).toEqual([180, 200]);
    expect(screen.getByText(/through this position/i)).toBeTruthy();
  });

  test('without a moves prop the search arg still OMITS moves (filter-only mode unchanged)', () => {
    renderWith(makeStore(), <ResultsList game={1} scope="archive" filters={null} />);
    const arg = useGamesSearchQuery.mock.calls.at(-1)[0];
    expect(arg).not.toHaveProperty('moves');
    expect(screen.queryByText(/through this position/i)).toBeNull();
  });
});
