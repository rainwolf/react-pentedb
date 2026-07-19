// Viewer tests (P2 Task 6, brief Step 1):
//   - keyboard nav sequence (Home/→/End/←/↑/↓) on a 5-move line lands where expected
//   - mouse wheel over the board steps prev/next
//   - clicking a legal empty cell dispatches applyMove; an illegal (occupied) cell is a
//     no-op with a shake indicator, leaving the tree unchanged
//   - MoveStrip renders a `+n` variation badge for a branched node and navigates on click
//   - capture counter matches GameClass after a known Pente capture sequence
//   - board rotation is a pure VIEW transform: the 8 symmetries are distinct, round-trip
//     invertible, and a click on the rotated board maps back to the canonical cell
//
// The real <Board> (complex SVG, its own gating) is stubbed so these tests exercise the
// viewer's OWN interaction/nav logic. The stub captures the props <Board> was rendered with
// (crucially `onMove`) so we can drive move callbacks the real board would only fire for
// legal empty cells — including the occupied-cell path the real board never fires.
// Contract fidelity: the real BoardSquare calls onMove with `e.target.id` — a STRING flat-index
// (quotes stripped) — so these drivers pass STRINGS, not numbers. See BoardPane.integration.test.js
// for the full real-Board wiring; this keeps the stubbed drivers honest to that contract.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, navPrev, selectActivePosition } from '../../model/docSlice';
import uiReducer from '../../app/uiSlice';
import { createTree, addMove } from '../../model/gameTree';

const boardMock = vi.hoisted(() => ({ lastProps: null }));
vi.mock('../../board/Board', () => ({
  default: (props) => {
    boardMock.lastProps = props;
    return <div data-testid="board-stub" />;
  },
}));

// eslint-disable-next-line import/first
import BoardPane from './BoardPane';
// eslint-disable-next-line import/first
import GameHeaderBar from './GameHeaderBar';
// eslint-disable-next-line import/first
import MoveStrip, { buildStripItems } from './MoveStrip';
// eslint-disable-next-line import/first
import NavControls from './NavControls';
// eslint-disable-next-line import/first
import useKeyboardNav, { KEY_ACTIONS } from './useKeyboardNav';
// eslint-disable-next-line import/first
import { symCell, symMoves, invSymCell, symXY, SYMMETRY_COUNT } from './boardSymmetry';
// eslint-disable-next-line import/first
import { buildBoardGame, capturesByColor } from './boardGameFactory';

// GameHeaderBar now renders an ExportMenu (P3 Task 5), which calls useGameQuery — stub it so
// these pre-existing stores (docsReducer only, no RTK-Query middleware) don't need the real
// api slice.
vi.mock('../../app/api', () => ({
  useGameQuery: () => ({ data: undefined, isLoading: true }),
}));

const theme = createTheme();
const N = 19;

// A run of standard-alternation player-1 stones, each followed by a harmless player-2 filler,
// where player 1 brackets and captures a player-2 pair per block (captures[2] === 2*n). Copied
// from src/game/winCheck.test.js so the capture counters asserted are the engine's own.
const cellXY = (x, y) => y * N + x;
function pairCaptures(n) {
  const moves = [];
  for (let k = 0; k < n; k++) {
    const r = 3 + 2 * k;
    moves.push(cellXY(4, r)); // P1 anchor
    moves.push(cellXY(5, r)); // P2 (to be captured)
    moves.push(cellXY(2 * k, 0)); // P1 filler
    moves.push(cellXY(6, r)); // P2 (to be captured)
    moves.push(cellXY(7, r)); // P1 closer -> brackets (5,r),(6,r) -> capture
    moves.push(cellXY(2 * k, 18)); // P2 filler
  }
  return moves;
}

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

function makeStore(moves, cursorPath, game = 1, branches = []) {
  const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
  let { tree } = treeFromLine(moves);
  for (const b of branches) {
    tree = addMove(tree, b.at, b.move).tree;
  }
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

function KbHarness() {
  useKeyboardNav();
  return <div data-testid="kb" />;
}

beforeEach(() => {
  boardMock.lastProps = null;
});
afterEach(() => {
  cleanup();
});

describe('board symmetry (pure view transform)', () => {
  test('identity leaves every cell in place', () => {
    for (const c of [0, 9, 180, 200, 360]) expect(symCell(c, 0, N)).toBe(c);
  });

  test('the board centre is invariant under all 8 symmetries', () => {
    for (let s = 0; s < SYMMETRY_COUNT; s++) expect(symCell(180, s, N)).toBe(180);
  });

  test('rot180 maps (x,y) -> (n-1-x, n-1-y)', () => {
    expect(symXY(0, 0, N, 2)).toEqual([N - 1, N - 1]);
    expect(symXY(10, 9, N, 2)).toEqual([N - 1 - 10, N - 1 - 9]);
  });

  test('every symmetry round-trips through its inverse for every cell', () => {
    for (let s = 0; s < SYMMETRY_COUNT; s++) {
      for (const c of [0, 5, 18, 19, 100, 180, 200, 359, 360]) {
        expect(invSymCell(symCell(c, s, N), s, N)).toBe(c);
      }
    }
  });

  test('the 8 symmetries are 8 distinct permutations of the board', () => {
    const perms = new Set();
    for (let s = 0; s < SYMMETRY_COUNT; s++) {
      const cells = [];
      for (let c = 0; c < N * N; c++) cells.push(symCell(c, s, N));
      perms.add(cells.join(','));
      // each is a bijection: no collisions
      expect(new Set(cells).size).toBe(N * N);
    }
    expect(perms.size).toBe(SYMMETRY_COUNT);
  });

  test('symMoves rotates a whole line without dropping moves', () => {
    const moves = [180, 200, 220];
    const rotated = symMoves(moves, 1, N);
    expect(rotated).toHaveLength(3);
    expect(rotated.map((m) => invSymCell(m, 1, N))).toEqual(moves);
  });
});

describe('useKeyboardNav', () => {
  test('key map covers ←/→/Home/End/↑/↓ (spec §9)', () => {
    expect(Object.keys(KEY_ACTIONS).sort()).toEqual(
      ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home'].sort()
    );
  });

  test('keyboard sequence on a 5-move line lands where expected', () => {
    const line = [180, 200, 220, 240, 260];
    const store = makeStore(line, [0, 0, 0, 0, 0]);
    renderWith(store, <KbHarness />);

    fireEvent.keyDown(window, { key: 'Home' });
    expect(selectActivePosition(store.getState()).moves).toEqual([]);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(selectActivePosition(store.getState()).moves).toEqual([180]);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);

    fireEvent.keyDown(window, { key: 'End' });
    expect(selectActivePosition(store.getState()).moves).toEqual(line);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200, 220, 240]);
  });

  test('↓ cycles to a sibling variation', () => {
    // 180 has two children: 200 (mainline) and 205 (variation); cursor sits on 200.
    const store = makeStore([180, 200], [0, 0], 1, [{ at: [0], move: 205 }]);
    renderWith(store, <KbHarness />);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 205]);
  });

  test('ignores keystrokes while typing in an input', () => {
    const store = makeStore([180, 200], [0, 0]);
    renderWith(
      store,
      <>
        <KbHarness />
        <input data-testid="field" />
      </>
    );
    const field = screen.getByTestId('field');
    fireEvent.keyDown(field, { key: 'ArrowLeft' });
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);
  });
});

describe('BoardPane — interaction', () => {
  test('clicking a legal empty cell dispatches applyMove (extends the line)', () => {
    const store = makeStore([180], [0]);
    renderWith(store, <BoardPane />);

    act(() => boardMock.lastProps.onMove('200')); // 200 is empty (Board fires a string id)
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);
  });

  test('an illegal (occupied) cell is a no-op and shakes; the tree is unchanged', () => {
    const store = makeStore([180], [0]);
    const before = store.getState().docs.tabs[0].tree.nextId;
    renderWith(store, <BoardPane />);

    act(() => boardMock.lastProps.onMove('180')); // 180 is occupied (Board fires a string id)
    expect(store.getState().docs.tabs[0].tree.nextId).toBe(before);
    expect(selectActivePosition(store.getState()).moves).toEqual([180]);
    expect(screen.getByTestId('board-pane').getAttribute('data-shake')).toBe('true');
  });

  test('mouse wheel over the board steps next then prev', () => {
    const store = makeStore([180, 200, 220], []);
    renderWith(store, <BoardPane />);
    const pane = screen.getByTestId('board-pane');

    fireEvent.wheel(pane, { deltaY: 120 });
    expect(selectActivePosition(store.getState()).moves).toEqual([180]);

    fireEvent.wheel(pane, { deltaY: -120 });
    expect(selectActivePosition(store.getState()).moves).toEqual([]);
  });

  test('rotation is a pure view transform: a click on the rotated board maps back to canonical', () => {
    const store = makeStore([180], [0]);
    renderWith(store, <BoardPane />);

    fireEvent.click(screen.getByLabelText('Rotate board')); // rotation -> 1
    const displayCell = 200;
    act(() => boardMock.lastProps.onMove(String(displayCell))); // Board fires a string id

    const expectedCanonical = invSymCell(displayCell, 1, N);
    expect(selectActivePosition(store.getState()).moves).toEqual([180, expectedCanonical]);
  });

  test('touch tap-confirm: first tap is pending (no commit), confirm commits', () => {
    const store = makeStore([180], [0]);
    const before = store.getState().docs.tabs[0].tree.nextId;
    renderWith(store, <BoardPane pointerCoarse />);

    act(() => boardMock.lastProps.onMove('200')); // pending, not committed (string id)
    expect(store.getState().docs.tabs[0].tree.nextId).toBe(before);

    act(() => boardMock.lastProps.onMove('220')); // move the pending ghost, still not committed
    expect(store.getState().docs.tabs[0].tree.nextId).toBe(before);

    fireEvent.click(screen.getByLabelText('Confirm move'));
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 220]);
  });

  test('a staged tap-confirm ghost is discarded when the position changes (nav)', () => {
    const store = makeStore([180, 200, 220], [0, 0, 0]);
    const before = store.getState().docs.tabs[0].tree.nextId;
    renderWith(store, <BoardPane pointerCoarse />);

    act(() => boardMock.lastProps.onMove('240')); // stage a ghost at the current position (string id)
    expect(screen.getByLabelText('Confirm move')).toBeTruthy();

    act(() => {
      store.dispatch(navPrev()); // navigate away — the ghost belongs to the old position
    });

    // ghost cleared: no stale Confirm control, and nothing was committed to the tree.
    expect(screen.queryByLabelText('Confirm move')).toBeNull();
    expect(store.getState().docs.tabs[0].tree.nextId).toBe(before);
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);
  });
});

describe('NavControls', () => {
  test('renders the four transport buttons and dispatches nav', () => {
    const store = makeStore([180, 200, 220], [0, 0, 0]);
    renderWith(store, <NavControls />);
    fireEvent.click(screen.getByLabelText('First move'));
    expect(selectActivePosition(store.getState()).moves).toEqual([]);
    fireEvent.click(screen.getByLabelText('Next move'));
    expect(selectActivePosition(store.getState()).moves).toEqual([180]);
  });
});

describe('MoveStrip', () => {
  test('buildStripItems flags a branched node with its alternative count', () => {
    const { tree } = treeFromLine([180, 200]);
    const branched = addMove(tree, [0], 205).tree; // 180 now has kids [200, 205]
    const items = buildStripItems(branched, [0, 0]);
    expect(items[0].m).toBe(180);
    expect(items[0].branches).toBe(1);
    expect(items[1].m).toBe(200);
    expect(items[1].isCursor).toBe(true);
  });

  test('renders a +n variation badge and navigates on chip click', () => {
    const store = makeStore([180, 200], [0, 0], 1, [{ at: [0], move: 205 }]);
    renderWith(store, <MoveStrip />);
    expect(screen.getByText('+1')).toBeTruthy();

    fireEvent.click(screen.getByText('180'));
    expect(selectActivePosition(store.getState()).moves).toEqual([180]);
  });
});

describe('capture counter', () => {
  test('capturesByColor matches GameClass after a known Pente capture', () => {
    const game = buildBoardGame(1, pairCaptures(1));
    // player 1 brackets one player-2 pair -> two enemy stones captured
    expect(game.captures[2]).toBe(2);
    expect(capturesByColor(game)).toEqual({ 1: 2, 2: 0 });
  });

  test('GameHeaderBar shows each player capture count from GameClass', () => {
    const moves = pairCaptures(1);
    const { path } = treeFromLine(moves);
    const store = makeStore(moves, path);
    renderWith(store, <GameHeaderBar />);
    expect(screen.getByTestId('captures-1').textContent).toBe('2');
    expect(screen.getByTestId('captures-2').textContent).toBe('0');
  });
});
