// Analysis tooling (P3 Task 2, brief Step 1):
//   - variation TreeView renders a 2-branch fixture with correct nesting (mainline
//     horizontal, variations indented) and navigates on chip click
//   - TagBar toggles annotation glyphs on the cursor node; a toggled tag round-trips
//     through the wire format
//   - promote reorders a node's kids (new mainline) and keeps the cursor on its node
//   - delete removes the subtree and moves the cursor to the parent (with a confirm dialog)
//   - CommentBox autosaves to state after the 500ms debounce (fake timers)
//   - the MoveStrip expand-tree toggle reveals the TreeView
import { describe, test, expect, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, {
  openTab,
  toggleTag,
  promoteVariation,
  deleteBranch,
  selectActivePosition,
} from '../../model/docSlice';
import {
  createTree,
  addMove,
  nodeAt,
  mainline,
  toWire,
  fromWire,
  toggleTag as gtToggleTag,
} from '../../model/gameTree';

import TreeView, { buildTreeRows } from './TreeView';
import TagBar, { TAG_GLYPHS } from './TagBar';
import CommentBox from './CommentBox';
import MoveStrip from '../viewer/MoveStrip';

const theme = createTheme();

// The canonical 2-branch fixture (mirrors gameTree.test):
//   root
//   ├─ 100 ─┬─ 101   (mainline)
//   │       └─ 102   (variation of 100)
//   └─ 200           (variation of root)
function fixture() {
  let { tree } = addMove(createTree(), [], 100); // 100 at [0]
  ({ tree } = addMove(tree, [0], 101)); // 101 at [0,0]
  ({ tree } = addMove(tree, [0], 102)); // 102 at [0,1]
  ({ tree } = addMove(tree, [], 200)); // 200 at [1]
  return tree;
}

function makeStore(tree, cursorPath = []) {
  const store = configureStore({ reducer: { docs: docsReducer } });
  store.dispatch(openTab({ id: 't', kind: 'analysis', title: 'A', game: 1, tree, cursorPath }));
  return store;
}

function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
    </Provider>
  );
}

const treeOf = (store) => store.getState().docs.tabs[0].tree;
const cursorOf = (store) => store.getState().docs.tabs[0].cursorPath;

afterEach(() => cleanup());

// --- pure model additions ------------------------------------------------------
describe('gameTree.toggleTag', () => {
  // Annotation type is mutually exclusive (sgf-pgn-formats.md L113): one of
  // GOOD/VERY_GOOD/BAD/VERY_BAD/INTERESTING per node, mapping to a single TE/BM/IT on export.
  test('is single-select: a new glyph replaces the active one; re-toggling clears', () => {
    let t = fixture();
    t = gtToggleTag(t, [0, 0], '!');
    expect(nodeAt(t, [0, 0]).tags).toEqual(['!']);
    t = gtToggleTag(t, [0, 0], '?'); // replaces '!' — not additive
    expect(nodeAt(t, [0, 0]).tags).toEqual(['?']);
    t = gtToggleTag(t, [0, 0], '?'); // re-toggling the active glyph clears it
    expect(nodeAt(t, [0, 0]).tags).toEqual([]);
  });

  test('does not mutate the input tree', () => {
    const t0 = fixture();
    gtToggleTag(t0, [0, 0], '!');
    expect(nodeAt(t0, [0, 0]).tags).toEqual([]);
  });
});

// --- docSlice reducers ---------------------------------------------------------
describe('docSlice.toggleTag', () => {
  test('single-selects the glyph on the cursor node and round-trips through the wire format', () => {
    const store = makeStore(fixture(), [0, 0]);
    store.dispatch(toggleTag('!'));
    expect(nodeAt(treeOf(store), [0, 0]).tags).toEqual(['!']);
    store.dispatch(toggleTag('??')); // replaces '!' — mutually exclusive
    expect(nodeAt(treeOf(store), [0, 0]).tags).toEqual(['??']);
    const round = fromWire(toWire(treeOf(store)));
    expect(nodeAt(round, [0, 0]).tags).toEqual(['??']);
    store.dispatch(toggleTag('??')); // re-toggling the active glyph clears it
    expect(nodeAt(treeOf(store), [0, 0]).tags).toEqual([]);
    expect(store.getState().docs.tabs[0].dirty).toBe(true);
  });
});

describe('docSlice.promoteVariation', () => {
  test('reorders kids into the new mainline and keeps the cursor on its node', () => {
    const store = makeStore(fixture(), [0, 1]); // cursor on 102 (the variation)
    store.dispatch(promoteVariation([0, 1]));
    expect(nodeAt(treeOf(store), [0, 0]).m).toBe(102);
    expect(nodeAt(treeOf(store), [0, 1]).m).toBe(101);
    expect(mainline(treeOf(store))).toEqual([100, 102]);
    expect(cursorOf(store)).toEqual([0, 0]); // cursor followed 102 to its new slot
  });

  test('remaps a displaced sibling under the cursor', () => {
    const store = makeStore(fixture(), [0, 0]); // cursor on 101 (mainline)
    store.dispatch(promoteVariation([0, 1])); // promote 102 above 101
    expect(cursorOf(store)).toEqual([0, 1]); // 101 shifted down to slot 1
  });
});

describe('docSlice.deleteBranch', () => {
  test('removes the subtree and moves the cursor to the parent', () => {
    const store = makeStore(fixture(), [0, 0]); // cursor on 101
    store.dispatch(deleteBranch([0, 0]));
    expect(nodeAt(treeOf(store), [0]).kids).toHaveLength(1);
    expect(nodeAt(treeOf(store), [0, 0]).m).toBe(102); // 102 shifted into slot 0
    expect(cursorOf(store)).toEqual([0]); // cursor moved to the deleted node's parent
  });

  test('reindexes the cursor when a lower-indexed sibling is deleted', () => {
    const store = makeStore(fixture(), [0, 1]); // cursor on 102
    store.dispatch(deleteBranch([0, 0])); // delete 101 (its earlier sibling)
    expect(cursorOf(store)).toEqual([0, 0]); // 102 followed down to slot 0
  });
});

// --- TreeView ------------------------------------------------------------------
describe('TreeView.buildTreeRows', () => {
  test('nests the 2-branch fixture: mainline row + indented variation rows', () => {
    const rows = buildTreeRows(fixture());
    expect(rows).toHaveLength(3);
    expect(rows[0].indent).toBe(0);
    expect(rows[0].items.map((i) => i.m)).toEqual([100, 101]);
    expect(rows[1].indent).toBe(1);
    expect(rows[1].items.map((i) => i.m)).toEqual([200]);
    expect(rows[1].items[0].path).toEqual([1]);
    expect(rows[2].indent).toBe(1);
    expect(rows[2].items.map((i) => i.m)).toEqual([102]);
    expect(rows[2].items[0].path).toEqual([0, 1]);
  });
});

describe('TreeView (render)', () => {
  test('renders a chip per move and navigates the cursor on click', () => {
    const store = makeStore(fixture(), []);
    renderWith(store, <TreeView />);
    fireEvent.click(screen.getByText('101'));
    expect(selectActivePosition(store.getState()).moves).toEqual([100, 101]);
    expect(cursorOf(store)).toEqual([0, 0]);
  });

  test('shows annotation glyphs on tagged nodes', () => {
    const store = makeStore(gtToggleTag(fixture(), [0, 0], '!'), []);
    renderWith(store, <TreeView />);
    expect(screen.getByText('101 !')).toBeTruthy();
  });

  test('right-click promotes a variation via the node menu', () => {
    const store = makeStore(fixture(), []);
    renderWith(store, <TreeView />);
    fireEvent.contextMenu(screen.getByText('102'));
    fireEvent.click(screen.getByText('Promote variation'));
    expect(nodeAt(treeOf(store), [0, 0]).m).toBe(102);
  });

  test('right-click delete opens a confirm dialog, then removes the branch', () => {
    const store = makeStore(fixture(), [0, 0]); // cursor on 101
    renderWith(store, <TreeView />);
    fireEvent.contextMenu(screen.getByText('101'));
    fireEvent.click(screen.getByText('Delete branch'));
    // confirm dialog
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(nodeAt(treeOf(store), [0]).kids).toHaveLength(1);
    expect(cursorOf(store)).toEqual([0]);
  });

  test('cancelling the confirm dialog leaves the tree unchanged', () => {
    const store = makeStore(fixture(), []);
    renderWith(store, <TreeView />);
    fireEvent.contextMenu(screen.getByText('101'));
    fireEvent.click(screen.getByText('Delete branch'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(nodeAt(treeOf(store), [0]).kids).toHaveLength(2); // still 101 + 102
  });

  test('long-press (touch) opens the node menu', () => {
    vi.useFakeTimers();
    try {
      const store = makeStore(fixture(), []);
      renderWith(store, <TreeView />);
      fireEvent.touchStart(screen.getByText('102'), { touches: [{ clientX: 0, clientY: 0 }] });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByText('Promote variation')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- TagBar --------------------------------------------------------------------
describe('TagBar', () => {
  test('binds the exact glyph mapping (sgf-pgn-formats.md)', () => {
    const byName = Object.fromEntries(TAG_GLYPHS.map((t) => [t.name, t.glyph]));
    expect(byName).toEqual({
      GOOD: '!',
      VERY_GOOD: '!!',
      BAD: '?',
      VERY_BAD: '??',
      INTERESTING: '!?',
    });
  });

  test('renders a button per glyph and single-selects the tag on the cursor node', () => {
    const store = makeStore(fixture(), [0]); // cursor on 100
    renderWith(store, <TagBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Very good' }));
    expect(nodeAt(treeOf(store), [0]).tags).toEqual(['!!']);
    fireEvent.click(screen.getByRole('button', { name: 'Bad' })); // replaces '!!'
    expect(nodeAt(treeOf(store), [0]).tags).toEqual(['?']);
    fireEvent.click(screen.getByRole('button', { name: 'Bad' })); // clears
    expect(nodeAt(treeOf(store), [0]).tags).toEqual([]);
  });
});

// --- CommentBox ----------------------------------------------------------------
describe('CommentBox', () => {
  test('autosaves the comment to state after the 500ms debounce', () => {
    vi.useFakeTimers();
    try {
      const store = makeStore(fixture(), [0]); // cursor on 100
      renderWith(store, <CommentBox />);
      const field = screen.getByLabelText('Comment');
      act(() => {
        fireEvent.change(field, { target: { value: 'sharp line' } });
      });
      // not yet flushed to state
      expect(nodeAt(treeOf(store), [0]).c).toBe('');
      act(() => vi.advanceTimersByTime(499));
      expect(nodeAt(treeOf(store), [0]).c).toBe('');
      act(() => vi.advanceTimersByTime(1));
      expect(nodeAt(treeOf(store), [0]).c).toBe('sharp line');
    } finally {
      vi.useRealTimers();
    }
  });

  test('preloads the existing comment for the cursor node', () => {
    let tree = fixture();
    tree = gtToggleTag(tree, [0], '!'); // unrelated edit; comment set directly below
    const store = makeStore(fixture(), [0]);
    // seed a comment through the public reducer so the box reflects state on mount
    store.dispatch({ type: 'docs/applyComment', payload: 'existing note' });
    renderWith(store, <CommentBox />);
    expect(screen.getByLabelText('Comment').value).toBe('existing note');
  });
});

// --- MoveStrip toggle ----------------------------------------------------------
describe('MoveStrip expand-tree toggle', () => {
  test('reveals the variation tree when toggled', () => {
    const store = makeStore(fixture(), [0, 0]);
    renderWith(store, <MoveStrip />);
    expect(screen.queryByTestId('tree-view')).toBeNull();
    fireEvent.click(screen.getByLabelText('Show variation tree'));
    expect(screen.getByTestId('tree-view')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide variation tree'));
    expect(screen.queryByTestId('tree-view')).toBeNull();
  });
});
