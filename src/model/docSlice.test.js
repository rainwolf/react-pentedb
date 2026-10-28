// Document-tabs slice: open/close/activate tabs, cursor navigation over the game tree,
// move/annotation editing, and the derived-position selector.
import { describe, test, expect } from 'vitest';
import reducer, {
  openTab,
  closeTab,
  activateTab,
  navTo,
  navNext,
  navPrev,
  navFirst,
  navLast,
  navSiblingUp,
  navSiblingDown,
  applyMove,
  applyTag,
  applyComment,
  markSaved,
  selectActivePosition,
} from './docSlice';
import { createTree, addMove, mainline } from './gameTree';
// The dependency-free leaf both game openers use (search/ResultsList row-click and the
// /g/:gid route loader) to turn a fetched move list into a tree + end-of-game cursor path.
import { buildTreeFromMoves } from '../shell/gameTab';

// Generic model tests use swap2-pente (27): its first move is free, so the empty-root behaviour
// under test is unaffected by the forced-centre opener (covered in forcedOpening.test.js).
const init = () => reducer(undefined, { type: '@@INIT' });
const active = (s) => s.tabs.find((t) => t.id === s.activeTabId);

// A linear tree 100 -> 101 -> 102 (paths [0], [0,0], [0,0,0]).
function linearTree() {
  let { tree } = addMove(createTree(), [], 100);
  ({ tree } = addMove(tree, [0], 101));
  ({ tree } = addMove(tree, [0, 0], 102));
  return tree;
}

// A tree whose root has three sibling variations 10 / 20 / 30 (paths [0], [1], [2]).
function siblingTree() {
  let { tree } = addMove(createTree(), [], 10);
  ({ tree } = addMove(tree, [], 20));
  ({ tree } = addMove(tree, [], 30));
  return tree;
}

describe('openTab / activateTab / closeTab', () => {
  test('openTab adds a tab and makes it active', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'g1', kind: 'game', title: 'Game 1', game: 27, gid: 42 }));
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe('g1');
    expect(active(s).kind).toBe('game');
    expect(active(s).dirty).toBe(false);
    expect(active(s).cursorPath).toEqual([]);
  });

  test('closeTab drops the tab and falls back to another active tab', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'a', kind: 'scratch', title: 'A', game: 27 }));
    s = reducer(s, openTab({ id: 'b', kind: 'scratch', title: 'B', game: 27 }));
    s = reducer(s, closeTab('b'));
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe('a');
    s = reducer(s, closeTab('a'));
    expect(s.activeTabId).toBeNull();
  });

  test('activateTab switches the active tab', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'a', kind: 'scratch', title: 'A', game: 27 }));
    s = reducer(s, openTab({ id: 'b', kind: 'scratch', title: 'B', game: 27 }));
    s = reducer(s, activateTab('a'));
    expect(s.activeTabId).toBe('a');
  });
});

describe('cursor navigation', () => {
  function withLinear() {
    let s = init();
    s = reducer(s, openTab({ id: 't', kind: 'analysis', title: 'A', game: 27, aid: 7, tree: linearTree() }));
    return s;
  }

  test('navNext / navPrev / navFirst / navLast walk the mainline', () => {
    let s = withLinear();
    s = reducer(s, navNext);
    expect(active(s).cursorPath).toEqual([0]);
    s = reducer(s, navNext);
    expect(active(s).cursorPath).toEqual([0, 0]);
    s = reducer(s, navLast);
    expect(active(s).cursorPath).toEqual([0, 0, 0]);
    s = reducer(s, navPrev);
    expect(active(s).cursorPath).toEqual([0, 0]);
    s = reducer(s, navFirst);
    expect(active(s).cursorPath).toEqual([]);
  });

  test('navTo jumps to an explicit path', () => {
    let s = withLinear();
    s = reducer(s, navTo([0, 0]));
    expect(active(s).cursorPath).toEqual([0, 0]);
  });

  test('navSiblingDown / navSiblingUp cycle siblings with wraparound', () => {
    let s = init();
    s = reducer(s, openTab({ id: 't', kind: 'analysis', title: 'A', game: 27, tree: siblingTree(), cursorPath: [0] }));
    s = reducer(s, navSiblingDown);
    expect(active(s).cursorPath).toEqual([1]);
    s = reducer(s, navSiblingDown);
    expect(active(s).cursorPath).toEqual([2]);
    s = reducer(s, navSiblingDown); // wrap 2 -> 0
    expect(active(s).cursorPath).toEqual([0]);
    s = reducer(s, navSiblingUp); // wrap 0 -> 2
    expect(active(s).cursorPath).toEqual([2]);
  });
});

describe('editing', () => {
  test('applyMove on a game tab appends the move, advances the cursor, sets dirty', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'g', kind: 'game', title: 'G', game: 27, gid: 5 }));
    expect(active(s).dirty).toBe(false);
    s = reducer(s, applyMove(180));
    expect(active(s).dirty).toBe(true);
    expect(active(s).cursorPath).toEqual([0]);
    expect(selectActivePosition({ docs: s })).toEqual({ game: 27, moves: [180], cursorPath: [0] });
  });

  test('markSaved clears the dirty flag', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'g', kind: 'game', title: 'G', game: 27 }));
    s = reducer(s, applyMove(180));
    s = reducer(s, markSaved());
    expect(active(s).dirty).toBe(false);
  });

  test('applyTag / applyComment annotate the node at the cursor', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'g', kind: 'game', title: 'G', game: 27 }));
    s = reducer(s, applyMove(180)); // cursor now at [0]
    s = reducer(s, applyTag('!'));
    s = reducer(s, applyComment('sharp'));
    const node = active(s).tree.root.kids[0];
    expect(node.tags).toEqual(['!']);
    expect(node.c).toBe('sharp');
  });
});

describe('selectActivePosition', () => {
  test('returns null when there is no active tab', () => {
    expect(selectActivePosition({ docs: init() })).toBeNull();
  });

  test('reports the game and the move line to the cursor', () => {
    let s = init();
    s = reducer(s, openTab({ id: 't', kind: 'analysis', title: 'A', game: 3, tree: linearTree(), cursorPath: [0, 0] }));
    expect(selectActivePosition({ docs: s })).toEqual({ game: 3, moves: [100, 101], cursorPath: [0, 0] });
  });
});

// FB7 regression: a loaded game must open showing its FULL line and be navigable through every
// move — the user report was "only the 1st move shows / can't navigate through the game". This
// encodes that acceptance at the STATE level using the SAME helper both openers use
// (search/ResultsList row-click and the /g/:gid route loader): buildTreeFromMoves -> openTab
// with cursorPath = the END-of-game path. The fixture is a REAL archived pente game
// (gid 50000000730774) and deliberately includes capture-replayed cells — 141 and 159 each
// appear twice, non-consecutively — to prove the line stays a full N-node mainline and is not
// collapsed by addMove's same-node dedup into a truncated 1-deep tree.
describe('loaded game opens at the full line and navigates (FB7)', () => {
  const REAL_MOVES = [180, 105, 104, 123, 140, 141, 87, 177, 159, 121, 161, 178, 101, 141, 159, 176, 175];

  function openLoadedGame() {
    const { tree, path } = buildTreeFromMoves(REAL_MOVES);
    let s = init();
    s = reducer(
      s,
      openTab({ id: 'g:730774', kind: 'game', title: 'orsim vs julierenee', game: 27, gid: 730774, tree, cursorPath: path })
    );
    return s;
  }

  test('the tab tree mainline has one node per move (not a truncated 1-deep tree)', () => {
    const s = openLoadedGame();
    expect(mainline(active(s).tree)).toEqual(REAL_MOVES);
  });

  test('opens at the END: selectActivePosition reports the full move line', () => {
    const pos = selectActivePosition({ docs: openLoadedGame() });
    expect(pos.moves).toEqual(REAL_MOVES);
    expect(pos.cursorPath).toHaveLength(REAL_MOVES.length);
  });

  test('navPrev / navFirst / navLast / navNext step through every move', () => {
    let s = openLoadedGame();
    // one step back drops exactly the last move
    s = reducer(s, navPrev);
    expect(selectActivePosition({ docs: s }).moves).toEqual(REAL_MOVES.slice(0, -1));
    // Home -> empty board
    s = reducer(s, navFirst);
    expect(selectActivePosition({ docs: s }).moves).toEqual([]);
    // stepping forward move-by-move reconstructs the whole line one stone at a time
    for (let i = 1; i <= REAL_MOVES.length; i++) {
      s = reducer(s, navNext);
      expect(selectActivePosition({ docs: s }).moves).toEqual(REAL_MOVES.slice(0, i));
    }
    // at the leaf navNext is a no-op (no kids to descend)
    s = reducer(s, navNext);
    expect(selectActivePosition({ docs: s }).moves).toEqual(REAL_MOVES);
    // End jumps straight back to the full line from anywhere
    s = reducer(s, navFirst);
    s = reducer(s, navLast);
    expect(selectActivePosition({ docs: s }).moves).toEqual(REAL_MOVES);
  });
});
