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
//     rendering (the rotation correctness seam) — and is filled by heatColor(heatT(winPct,
//     domain)) over the shown set (the green→red RELATIVE ramp).
//   - ExplorerPanel: queries usePositionStatsQuery with the CANONICAL active line; a stats
//     row click dispatches applyMove(canonicalCell); "games through here" (now in SearchPanel) drives ResultsList
//     in position-constrained mode with the canonical line.
//   - ResultsList: position-constrained mode (moves prop) includes `moves` in the search arg
//     and shows a "games through this position" header; filter-only mode still omits `moves`.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, navNext, selectActivePosition, retargetScratch } from '../../model/docSlice';
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
  setExplorerSort,
  selectHeatOnBoard,
  selectHeatHoverCell,
  selectExplorerSort,
} from '../../app/uiSlice';
// eslint-disable-next-line import/first
import heatColor, {
  heatDomain,
  heatT,
  usableCandidates,
  wilsonLowerBound,
  LOW_SAMPLE_GAMES,
  heatValue,
  isLowSample,
  candidateDomain,
  candidateColor,
  LOW_SAMPLE_COLOR,
} from './heatScale';
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

// The reported defect: the backend's nextMoves for position [180] echoes the ALREADY-PLAYED
// cell 180 (K10) at 0% / 3 games. Left in the shown set it anchors the domain min at 0 and
// compresses every real candidate toward green, and paints a stray disc on the played stone.
const OCCUPIED_NEXT_MOVES = [
  { move: 180, games: 3, wins: 0, winPct: 0 }, // K10 — already on the board (∈ moves [180])
  { move: 200, games: 10, wins: 6, winPct: 60 },
  { move: 220, games: 30, wins: 9, winPct: 30 },
  { move: 240, games: 5, wins: 5, winPct: 100 },
];
const OCCUPIED_STATS = { totalGames: 100, totalWinPct: 55, rotation: 0, nextMoves: OCCUPIED_NEXT_MOVES };

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

  // A null/non-finite win% must NOT be coerced to 0 (Number(null) === 0) and drag the min —
  // that would silently re-anchor the whole ramp. heatDomain SKIPS them, consistent with
  // heatT(null) → null. The all-missing case guards against an empty-after-filter crash.
  test('heatDomain skips null / non-finite win% (no phantom 0 dragging the min)', () => {
    expect(heatDomain([null, 30, 60, 100])).toEqual({ min: 30, max: 100 });
    expect(heatDomain([undefined, NaN, 45, 90])).toEqual({ min: 45, max: 90 });
    expect(heatDomain([null, undefined])).toEqual({ min: 0, max: 0 }); // empty after filter → safe
  });

  test('the rendered heat is identical under light and dark themes (theme-independent)', () => {
    const cells = [{ move: 180, games: 100, wins: 50, winPct: 50 }]; // singleton well-sampled set
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
    const v = heatValue(cells[0]);
    expect(lightFill).toBe(heatColor(heatT(v, { min: v, max: v })));
  });
});

// ===================================================================================
// usableCandidates — exclude ALREADY-OCCUPIED cells from the heat (domain + render)
// The backend's nextMoves occasionally echoes a played cell (e.g. K10=180 at 0% for position
// [180]); left in the shown set that 0% anchors the domain min and compresses every real
// candidate toward green. Excluding it BEFORE heatDomain keeps the ramp distinctive, and the
// SAME filtered set must feed both the list (StatsRows) and the board (HeatOverlay).
// ===================================================================================
describe('usableCandidates — occupied cells excluded before the heat domain', () => {
  test('drops candidates whose cell is already on the board (∈ moves)', () => {
    expect(usableCandidates(OCCUPIED_NEXT_MOVES, [180]).map((c) => c.move)).toEqual([200, 220, 240]);
  });

  test('keeps every candidate when none is occupied', () => {
    expect(usableCandidates(NEXT_MOVES, [180]).map((c) => c.move)).toEqual([200, 220, 240]);
  });

  test('is null-safe on empty inputs', () => {
    expect(usableCandidates()).toEqual([]);
    expect(usableCandidates(OCCUPIED_NEXT_MOVES)).toEqual(OCCUPIED_NEXT_MOVES); // no moves → all kept
  });

  test('the occupied 0% cell no longer drags the domain min: real candidates span red→green', () => {
    const filtered = usableCandidates(OCCUPIED_NEXT_MOVES, [180]);
    const dom = heatDomain(filtered.map((c) => c.winPct)); // {min:30, max:100} — NOT {min:0}
    expect(dom).toEqual({ min: 30, max: 100 });
    expect(heatColor(heatT(30, dom))).toBe('rgb(255, 0, 0)'); // worst REAL candidate = red
    expect(heatColor(heatT(100, dom))).toBe('rgb(0, 255, 0)'); // best REAL candidate = green
    // ...whereas the raw (unfiltered) set would collapse the worst real move toward yellow/green.
    const rawDom = heatDomain(OCCUPIED_NEXT_MOVES.map((c) => c.winPct)); // {min:0, max:100}
    expect(heatColor(heatT(30, rawDom))).not.toBe('rgb(255, 0, 0)');
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
      const store = makeStore([180, 200, 220], [], 27); // cursor at root -> empty displayed line
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

describe('useDebouncedPosition game change', () => {
  function GHarness() {
    const p = useDebouncedPosition(150);
    return <span data-testid="dg">{p ? p.game : 'none'}</span>;
  }
  test('a GAME change is adopted immediately (never the old game for the debounce window)', () => {
    vi.useFakeTimers();
    try {
      const store = makeStore([], [], 1);
      renderWith(store, <GHarness />);
      expect(screen.getByTestId('dg').textContent).toBe('1');
      act(() => {
        store.dispatch(retargetScratch({ id: 't', game: 13 }));
      });
      expect(screen.getByTestId('dg').textContent).toBe('13');
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

  // Sort-mode switch (explorer feedback rework). 'games' = popularity (games desc, winPct
  // tiebreak); 'winrate' = win% desc (games tiebreak). Same rows, two orderings.
  test("sortedRows 'games' mode: games desc, winPct as the tiebreak", () => {
    const tie = [
      { move: 10, games: 20, winPct: 40 },
      { move: 20, games: 20, winPct: 70 }, // same games as 10 → higher winPct wins the tie
      { move: 30, games: 5, winPct: 99 },
    ];
    expect(sortedRows(tie, 'games').map((r) => r.move)).toEqual([20, 10, 30]);
    // default mode is 'games' (back-compat with the current single-arg callers)
    expect(sortedRows(tie).map((r) => r.move)).toEqual([20, 10, 30]);
  });

  test("sortedRows 'winrate' mode: winPct desc primarily, games as the tiebreak", () => {
    // winPct is the PRIMARY key: a 1-game 100% DOES sit above a 500-game 65%.
    expect(sortedRows(NEXT_MOVES, 'winrate').map((r) => r.move)).toEqual([240, 200, 220]);
    const tie = [
      { move: 10, games: 5, winPct: 100 },
      { move: 20, games: 500, winPct: 100 }, // same winPct → more games wins the tie
    ];
    expect(sortedRows(tie, 'winrate').map((r) => r.move)).toEqual([20, 10]);
  });

  test("sortedRows 'winrate' mode: a low-sample row (3/3) ranks below a well-sampled row with a lower Wilson bound", () => {
    // 3/3 → Wilson ~43.8 (above 3800/8529 → ~43.5), but 3 games < LOW_SAMPLE_GAMES, so it sorts last.
    const rows = [
      { move: 1, games: 3, wins: 3, winPct: 100 },
      { move: 2, games: 8529, wins: 3800, winPct: 44.5 },
    ];
    expect(sortedRows(rows, 'winrate').map((r) => r.move)).toEqual([2, 1]);
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
    { move: 180, games: 100, wins: 50, winPct: 50 },
    { move: 200, games: 100, wins: 80, winPct: 80 },
  ];

  test('renders one ghost per candidate, colored by RELATIVE heat over the shown set', () => {
    const { container } = renderWith(makeStore(), <HeatOverlay cells={CELLS} gridSize={N} rotation={0} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    const dom = heatDomain(CELLS.map(heatValue)); // Wilson×100 domain: 50/100 → ~40.4, 80/100 → ~71.1
    // worst-of-set (50) reads pure red; best-of-set (80) reads pure green.
    expect(container.querySelector('circle[data-canonical="180"]').getAttribute('fill')).toBe(
      heatColor(heatT(heatValue(CELLS[0]), dom))
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
    // Inner-border highlight: the hovered disc stays STONE-SIZED (base r=5), never enlarged —
    // regression guard for the old outer r=7.8 hover-swell ring.
    expect(hovered.getAttribute('r')).toBe('5');
    expect(ambient.getAttribute('r')).toBe('5');
    // full-opacity fill vs a dim ambient disc (colour pop is allowed; size is not)
    expect(Number(hovered.getAttribute('fill-opacity'))).toBe(1);
    expect(Number(ambient.getAttribute('fill-opacity'))).toBeLessThan(1);
    // a bright white high-contrast outline on the hovered cell
    expect(hovered.getAttribute('stroke').toLowerCase()).toBe('#ffffff');
    // ...and a dedicated bright highlight ring, drawn INSIDE the disc edge (radius < 5) so its
    // outer edge lands at (about) the disc's own r=5 — an inner border, never a footprint swell.
    const ring = container.querySelector('[data-testid="heat-hover-ring"]');
    expect(ring).toBeTruthy();
    const ringRadius = Number(ring.getAttribute('r'));
    expect(ringRadius).toBeLessThan(5);
    const strokeWidth = Number(ring.getAttribute('stroke-width'));
    expect(ringRadius + strokeWidth / 2).toBeCloseTo(5, 5);
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

  test('does NOT render the "games through here" list any more (moved to SearchPanel)', () => {
    renderWith(makeStore([180], [0]), <ExplorerPanel />);
    expect(useGamesSearchQuery).not.toHaveBeenCalled();
    expect(screen.queryByText('Games through here')).toBeNull();
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

  // The list must NOT show a candidate that is already on the board: the played K10 (cell 180,
  // ∈ moves [180]) is dropped from StatsRows, so it can't anchor the min or list a 0%/3-games row.
  test('excludes an already-occupied candidate from the stats list', () => {
    usePositionStatsQuery.mockReturnValue({ data: OCCUPIED_STATS, isFetching: false });
    renderWith(makeStore([180], [0]), <ExplorerPanel />);
    expect(screen.queryByTestId('stats-row-180')).toBeNull(); // occupied K10 not listed
    expect(screen.queryByTestId('stats-row-200')).toBeTruthy();
    expect(screen.queryByTestId('stats-row-220')).toBeTruthy();
    expect(screen.queryByTestId('stats-row-240')).toBeTruthy();
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

  test('new query in flight clears heat stones; the new result then renders', () => {
    const store = makeBoardStore([180]);
    const { container, rerender } = renderWith(store, <BoardHeatOverlay />);
    const ghosts = () => container.querySelectorAll('[data-testid="heat-overlay"] circle').length;
    expect(ghosts()).toBe(NEXT_MOVES.length);
    // RTK keeps the previous arg's `data` while the new arg fetches; currentData is undefined
    usePositionStatsQuery.mockReturnValue({ data: STATS, currentData: undefined, isFetching: true });
    rerender(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <BoardHeatOverlay />
        </ThemeProvider>
      </Provider>
    );
    expect(ghosts()).toBe(0);
    const NEXT = { ...STATS, nextMoves: [{ move: 300, games: 4, wins: 2, winPct: 50 }] };
    usePositionStatsQuery.mockReturnValue({ data: NEXT, currentData: NEXT, isFetching: false });
    rerender(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <BoardHeatOverlay />
        </ThemeProvider>
      </Provider>
    );
    expect(ghosts()).toBe(1);
  });

  test('ExplorerPanel: moves list clears while a new query fetches, then shows the new rows', () => {
    const store = makeStore([180], [0]);
    const ui = () => (
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <ExplorerPanel />
        </ThemeProvider>
      </Provider>
    );
    const { rerender } = render(ui());
    expect(screen.queryByTestId('stats-row-200')).not.toBeNull();
    usePositionStatsQuery.mockReturnValue({ data: STATS, currentData: undefined, isFetching: true });
    rerender(ui());
    expect(screen.queryByTestId('stats-row-200')).toBeNull();
    expect(screen.queryByText('Loading…')).not.toBeNull();
    const NEXT = { ...STATS, nextMoves: [{ move: 300, games: 4, wins: 2, winPct: 50 }] };
    usePositionStatsQuery.mockReturnValue({ data: NEXT, currentData: NEXT, isFetching: false });
    rerender(ui());
    expect(screen.queryByTestId('stats-row-300')).not.toBeNull();
    expect(screen.queryByTestId('stats-row-200')).toBeNull();
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

  // The board must not paint a disc on an already-played stone, and — using the SAME filtered
  // set as the list — the remaining discs span the full red→green range (the 0% cell no longer
  // compresses them). Proves the board uses the FILTERED domain, not the raw one.
  test('excludes the occupied cell from the board; remaining discs span red→green (filtered domain)', () => {
    usePositionStatsQuery.mockReturnValue({ data: OCCUPIED_STATS, isFetching: false });
    const { container } = renderWith(makeBoardStore([180]), <BoardHeatOverlay />); // rotation 0
    // no ghost on the played cell 180 (K10)
    expect(container.querySelector('circle[data-canonical="180"]')).toBeNull();
    // exactly the three real candidates remain (no hover → one circle each)
    const circles = container.querySelectorAll('[data-testid="heat-overlay"] circle');
    expect(circles.length).toBe(3);
    // worst REAL candidate (220 @30%) reads pure red; best (240 @100%) pure green.
    expect(container.querySelector('circle[data-canonical="220"]').getAttribute('fill')).toBe('rgb(255, 0, 0)');
    expect(container.querySelector('circle[data-canonical="240"]').getAttribute('fill')).toBe('rgb(0, 255, 0)');
    // and this red is the FILTERED-domain result — the raw domain (incl. the 0% cell) would not.
    const rawDom = heatDomain(OCCUPIED_NEXT_MOVES.map((c) => c.winPct)); // {min:0,max:100}
    expect(container.querySelector('circle[data-canonical="220"]').getAttribute('fill')).not.toBe(
      heatColor(heatT(30, rawDom))
    );
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

  test("explorerSort defaults to 'winrate'; setExplorerSort switches it; selector reads it", () => {
    const store = configureStore({ reducer: { ui: uiReducer } });
    expect(selectExplorerSort(store.getState())).toBe('winrate');
    store.dispatch(setExplorerSort('games'));
    expect(selectExplorerSort(store.getState())).toBe('games');
    store.dispatch(setExplorerSort('bogus')); // unknown value ignored — stays on the last valid mode
    expect(selectExplorerSort(store.getState())).toBe('games');
    store.dispatch(setExplorerSort('winrate'));
    expect(selectExplorerSort(store.getState())).toBe('winrate');
  });

  test("selectExplorerSort defaults to 'winrate' on a store without the ui slice", () => {
    expect(selectExplorerSort({})).toBe('winrate');
  });
});

// ===================================================================================
// Bidirectional hover + click-to-play on the board's suggestion discs (explorer feedback).
//   - HeatOverlay discs are interactive (hover/click callbacks) and report the LOCAL move.
//   - StatsRows lights the row whose move === the shared hoverCell (board-driven direction).
//   - BoardHeatOverlay wires disc hover → setHeatHoverCell and disc click → applyMove(local).
//   - ExplorerPanel's sort switch reorders the list; a row hover round-trips through the slice.
// ===================================================================================
describe('HeatOverlay — interactive discs (hover + click callbacks, LOCAL move)', () => {
  const CELLS2 = [
    { move: 180, winPct: 50 },
    { move: 200, winPct: 80 },
  ];

  test('hovering a disc fires onCellEnter with its LOCAL move; leaving fires onCellLeave', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderWith(
      makeStore(),
      <HeatOverlay cells={CELLS2} gridSize={N} rotation={0} onCellEnter={onEnter} onCellLeave={onLeave} />
    );
    const disc = container.querySelector('circle[data-canonical="200"]');
    fireEvent.mouseEnter(disc);
    expect(onEnter).toHaveBeenCalledWith(200);
    fireEvent.mouseLeave(disc);
    expect(onLeave).toHaveBeenCalled();
  });

  test('clicking a disc fires onCellClick with its LOCAL move (not the display cell)', () => {
    const onClick = vi.fn();
    // rotation 1 → the disc renders at a DIFFERENT display cell, but the click must report the
    // LOCAL move (200), so applyMove needs no inverse-symmetry mapping.
    const { container } = renderWith(
      makeStore(),
      <HeatOverlay cells={CELLS2} gridSize={N} rotation={1} onCellClick={onClick} />
    );
    const disc = container.querySelector('circle[data-canonical="200"]');
    expect(disc.getAttribute('data-cell')).toBe(String(symCell(200, 1, N))); // display ≠ local
    fireEvent.click(disc);
    expect(onClick).toHaveBeenCalledWith(200);
  });

  test('the overlay container stays click-through (pointerEvents none) while discs opt back in', () => {
    const { container } = renderWith(makeStore(), <HeatOverlay cells={CELLS2} gridSize={N} rotation={0} />);
    expect(container.querySelector('[data-testid="heat-overlay"]').getAttribute('pointer-events')).toBe('none');
    const disc = container.querySelector('circle[data-canonical="200"]');
    expect(disc.style.pointerEvents).toBe('auto');
  });
});

describe('StatsRows — programmatic hover highlight from the shared cell', () => {
  test('the row whose move === hoverCell is highlighted (board-driven direction)', () => {
    renderWith(makeStore(), <StatsRows rows={sortedRows(NEXT_MOVES)} gridSize={N} hoverCell={220} />);
    expect(screen.getByTestId('stats-row-220').getAttribute('data-active-hover')).toBe('true');
    expect(screen.getByTestId('stats-row-200').getAttribute('data-active-hover')).toBe('false');
  });

  test('no hoverCell → no row is programmatically highlighted', () => {
    renderWith(makeStore(), <StatsRows rows={sortedRows(NEXT_MOVES)} gridSize={N} />);
    expect(screen.getByTestId('stats-row-220').getAttribute('data-active-hover')).toBe('false');
  });
});

describe('BoardHeatOverlay — disc drives the shared hover cell and plays on click', () => {
  test('hovering a board disc dispatches setHeatHoverCell(localMove)', () => {
    const store = makeBoardStore([180]); // rotation 0
    const { container } = renderWith(store, <BoardHeatOverlay />);
    const disc = container.querySelector('circle[data-canonical="200"]');
    fireEvent.mouseEnter(disc);
    expect(selectHeatHoverCell(store.getState())).toBe(200);
    fireEvent.mouseLeave(disc);
    expect(selectHeatHoverCell(store.getState())).toBeNull();
  });

  test('clicking a board disc plays that LOCAL move (click-to-play parity with a list row)', () => {
    const store = makeBoardStore([180], 1); // rotation 1 — disc sits at a rotated display cell
    const { container } = renderWith(store, <BoardHeatOverlay />);
    const disc = container.querySelector('circle[data-canonical="200"]');
    fireEvent.click(disc);
    // LOCAL move applied (no inverse-symmetry): the line extends by 200, not symCell(200,1).
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);
  });
});

describe('ExplorerPanel — sort switch + bidirectional hover roundtrip', () => {
  const order = () =>
    Array.from(document.querySelectorAll('[data-testid^="stats-row-"]')).map((el) =>
      el.getAttribute('data-testid')
    );

  test('the sort switch reorders the list between popularity and win rate', () => {
    const store = makeScopedStore('archive'); // docs + ui, line [180], stats = NEXT_MOVES
    renderWith(store, <ExplorerPanel />);
    // default 'winrate': winPct desc → 240, 200, 220
    expect(order()).toEqual(['stats-row-240', 'stats-row-200', 'stats-row-220']);
    fireEvent.click(screen.getByTestId('sort-games'));
    // 'games' (popularity): games desc → 220, 200, 240
    expect(order()).toEqual(['stats-row-220', 'stats-row-200', 'stats-row-240']);
    fireEvent.click(screen.getByTestId('sort-winrate'));
    expect(order()).toEqual(['stats-row-240', 'stats-row-200', 'stats-row-220']);
  });

  test('hovering a list row lights that same row via the shared cell (row → slice → highlight)', () => {
    const store = makeScopedStore('archive');
    renderWith(store, <ExplorerPanel />);
    fireEvent.mouseEnter(screen.getByTestId('stats-row-200'));
    expect(selectHeatHoverCell(store.getState())).toBe(200);
    expect(screen.getByTestId('stats-row-200').getAttribute('data-active-hover')).toBe('true');
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
    renderWith(makeStore(), <ResultsList game={1} scope="archive" filters={null} moves={[]} />);
    const arg = useGamesSearchQuery.mock.calls.at(-1)[0];
    expect(arg).not.toHaveProperty('moves');
    expect(screen.queryByText(/through this position/i)).toBeNull();
  });
});

describe('Wilson lower bound, low-sample handling', () => {
  test('wilsonLowerBound values', () => {
    expect(wilsonLowerBound(1, 1)).toBeCloseTo(0.207, 3);
    expect(wilsonLowerBound(3, 3)).toBeCloseTo(0.438, 2);
    expect(wilsonLowerBound(28, 32)).toBeCloseTo(0.719, 3);
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });
  test('usableCandidates keeps everything (no cap), input order', () => {
    const cands = Array.from({ length: 30 }, (_, i) => ({ move: i + 1, games: 1, wins: 1, winPct: 100 }));
    expect(usableCandidates(cands, [1]).map((c) => c.move)).toEqual(cands.slice(1).map((c) => c.move));
  });
  test('LOW_SAMPLE_GAMES is 5', () => expect(LOW_SAMPLE_GAMES).toBe(5));
  const ROWS = [
    { move: 1, games: 1, wins: 1, winPct: 100 },
    { move: 2, games: 400, wins: 300, winPct: 75 },
    { move: 3, games: 32, wins: 28, winPct: 87.5 },
    { move: 4, games: 3, wins: 3, winPct: 100 },
  ];
  test("winrate sort orders by Wilson bound: 1/1 ranks below 300/400; ties by games", () => {
    expect(sortedRows(ROWS, 'winrate').map((r) => r.move)).toEqual([3, 2, 4, 1]);
    expect(sortedRows(ROWS, 'games').map((r) => r.move)).toEqual([2, 3, 4, 1]);
    const tie = [{ move: 10, games: 10, wins: 5, winPct: 50 }, { move: 20, games: 10, wins: 5, winPct: 50 }];
    expect(sortedRows(tie, 'winrate').map((r) => r.move)).toEqual([10, 20]);
  });
  test('StatsRows greys <5-game rows with a hint, keeps raw win%', () => {
    renderWith(makeStore(), <StatsRows rows={sortedRows(ROWS, 'winrate')} gridSize={N} />);
    const low = screen.getByTestId('stats-row-1');
    expect(low.getAttribute('data-low-sample')).toBe('true');
    expect(low.getAttribute('title')).toMatch(/fewer than 5 games/);
    expect(low.textContent).toContain('100%');
    expect(screen.getByTestId('stats-row-2').getAttribute('data-low-sample')).toBe('false');
    expect(screen.getByTestId('stats-totals').textContent).toContain('436'); // 1+400+32+3
  });
  test('heat domain excludes <5-game candidates; they draw neutral grey', () => {
    const dom = candidateDomain(ROWS);
    expect(dom.min).toBeCloseTo(heatValue(ROWS[2]) < heatValue(ROWS[1]) ? heatValue(ROWS[2]) : heatValue(ROWS[1]), 6);
    expect(dom.max).toBeCloseTo(Math.max(heatValue(ROWS[1]), heatValue(ROWS[2])), 6);
    expect(candidateColor(ROWS[0], dom)).toBe(LOW_SAMPLE_COLOR);
    const { container } = renderWith(makeStore(), <HeatOverlay cells={ROWS} gridSize={N} rotation={0} />);
    expect(container.querySelector('circle[data-canonical="1"]').getAttribute('fill')).toBe(LOW_SAMPLE_COLOR);
    expect(container.querySelector('circle[data-canonical="2"]').getAttribute('fill')).toBe('rgb(255, 0, 0)');
    expect(container.querySelector('circle[data-canonical="3"]').getAttribute('fill')).toBe('rgb(0, 255, 0)');
  });
});
