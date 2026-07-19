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
}));

// eslint-disable-next-line import/first
import { usePositionStatsQuery, useGamesSearchQuery, useGameQuery } from '../../app/api';
// eslint-disable-next-line import/first
import heatScale from './heatScale';
// eslint-disable-next-line import/first
import useDebouncedPosition from './useDebouncedPosition';
// eslint-disable-next-line import/first
import StatsRows, { sortedRows, totalsRow, moveLabel } from './StatsRows';
// eslint-disable-next-line import/first
import HeatOverlay from './HeatOverlay';
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
  usePositionStatsQuery.mockReturnValue({ data: STATS, isFetching: false });
  useGamesSearchQuery.mockReturnValue({ data: { total: 0, games: [] }, isFetching: false });
  useGameQuery.mockReturnValue({ data: undefined, isSuccess: false });
});

afterEach(() => {
  cleanup();
});

// ===================================================================================
// heatScale — deterministic sequential ramp, safe/identical in both themes
// ===================================================================================
describe('heatScale', () => {
  test('returns three distinct colors for 0 / 50 / 100', () => {
    const set = new Set([heatScale(0), heatScale(50), heatScale(100)]);
    expect(set.size).toBe(3);
  });

  test('is deterministic: identical input → identical output', () => {
    expect(heatScale(37)).toBe(heatScale(37));
    expect(heatScale(0)).toBe(heatScale(0));
  });

  test('clamps out-of-range win% to the 0..100 endpoints', () => {
    expect(heatScale(-20)).toBe(heatScale(0));
    expect(heatScale(150)).toBe(heatScale(100));
  });

  test('a missing win% yields a neutral (no-data) color, distinct from the ramp ends', () => {
    const neutral = heatScale(null);
    expect(neutral).toBe(heatScale(undefined));
    expect(neutral).not.toBe(heatScale(0));
    expect(neutral).not.toBe(heatScale(100));
  });

  test('the rendered heat is identical under light and dark themes (theme-independent)', () => {
    const cells = [{ move: 180, winPct: 50 }];
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
    expect(lightFill).toBe(heatScale(50));
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

  test('renders one ghost per candidate, filled by heatScale(winPct)', () => {
    const { container } = renderWith(makeStore(), <HeatOverlay cells={CELLS} gridSize={N} rotation={0} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    const c180 = container.querySelector('circle[data-canonical="180"]');
    expect(c180.getAttribute('fill')).toBe(heatScale(50));
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
