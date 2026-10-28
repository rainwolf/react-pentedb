// Variants with a forced centre opener: the first stone is pre-placed and can't be removed.
import { describe, test, expect } from 'vitest';
import reducer, {
  openTab, navFirst, navPrev, navTo, deleteBranch, promoteVariation, applyMove, restoreTab, selectActivePosition, isProtectedOpening,
} from './docSlice';
import { firstMoveMustBeCenter, centerCell, forcedOpening } from '../board/boardGeometry';
import { canonicalUrl, parsePositionParams, buildTreeFromMoves } from '../shell/gameTab';
import { createTree, addMove } from './gameTree';

const init = () => reducer(undefined, { type: '@@INIT' });
const open = (game, extra = {}) => reducer(init(), openTab({ kind: 'scratch', game, ...extra }));
const active = (s) => s.tabs.find((t) => t.id === s.activeTabId);

describe('partition mirrors backend firstMoveCanBeOffCenter', () => {
  test.each([1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 25, 26, 31, 32, 51, 53, 81])(
    'game %i is forced-centre', (g) => expect(firstMoveMustBeCenter(g)).toBe(true));
  test.each([7, 8, 17, 18, 19, 20, 21, 22, 23, 24, 27, 28, 29, 30, 57, 58, 67, 69, 71, 73, 77, 79])(
    'game %i is free', (g) => expect(firstMoveMustBeCenter(g)).toBe(false));
  test('forcedOpening', () => {
    expect(forcedOpening(1)).toEqual([180]);
    expect(forcedOpening(31)).toEqual([centerCell(31)]);
    expect(forcedOpening(27)).toEqual([]);
  });
});

describe('docSlice forced opening', () => {
  test('new pente tab starts with centre, cursor on it', () => {
    const t = active(open(1));
    expect(t.tree.root.kids.map((k) => k.m)).toEqual([180]);
    expect(t.cursorPath).toEqual([0]);
    expect(t.dirty).toBe(false);
  });
  test('free variants stay empty', () => {
    for (const g of [27, 29, 19, 7]) {
      const t = active(open(g));
      expect(t.tree.root.kids).toEqual([]);
      expect(t.cursorPath).toEqual([]);
    }
  });
  test('position selector yields [centre]', () => {
    expect(selectActivePosition({ docs: open(1) }).moves).toEqual([180]);
  });
  test('navFirst and navPrev stop at move 1', () => {
    let s = open(1);
    s = reducer(s, applyMove(181));
    s = reducer(s, applyMove(182));
    expect(active(reducer(s, navFirst())).cursorPath).toEqual([0]);
    s = reducer(s, navTo([0]));
    expect(active(reducer(s, navPrev())).cursorPath).toEqual([0]);
    expect(active(reducer(s, navTo([]))).cursorPath).toEqual([0]);
  });
  test('deleteBranch cannot remove the centre stone', () => {
    let s = open(1);
    s = reducer(s, applyMove(181));
    const s2 = reducer(s, deleteBranch([0]));
    expect(active(s2).tree.root.kids.map((k) => k.m)).toEqual([180]);
    expect(active(s2).tree.root.kids[0].kids.length).toBe(1);
    const s3 = reducer(s, deleteBranch([0, 0]));
    expect(active(s3).tree.root.kids[0].kids.length).toBe(0);
  });
  test('applyMove at the empty root of a forced variant keeps centre first', () => {
    let s = open(1, { tree: undefined });
    s = reducer(s, navTo([]));
    expect(active(s).cursorPath).toEqual([0]);
  });
  test('free variant: delete first move still allowed', () => {
    let s = open(27);
    s = reducer(s, applyMove(10));
    s = reducer(s, deleteBranch([0]));
    expect(active(s).tree.root.kids).toEqual([]);
  });
  test('restoreTab with empty tree seeds centre', () => {
    const s = reducer(init(), restoreTab({ id: 'x', kind: 'scratch', game: 1 }));
    expect(active(s).tree.root.kids.map((k) => k.m)).toEqual([180]);
  });
});

describe('root siblings next to the centre stone', () => {
  // root kids: [centre, 181] (a legacy/imported non-centre root sibling)
  const withSibling = () => {
    let tree = addMove(createTree(), [], 180).tree;
    tree = addMove(tree, [], 181).tree;
    return open(1, { tree, cursorPath: [1] });
  };
  test('promoting a root sibling cannot displace the centre stone', () => {
    const s = reducer(withSibling(), promoteVariation([1]));
    expect(active(s).tree.root.kids.map((k) => k.m)).toEqual([180, 181]);
  });
  test('protection follows the centre move, not index 0', () => {
    const t = active(withSibling());
    expect(isProtectedOpening(t, [0])).toBe(true);
    expect(isProtectedOpening(t, [1])).toBe(false);
  });
  test('deleting the root sibling under the cursor re-anchors on the centre stone', () => {
    const s = reducer(withSibling(), deleteBranch([1]));
    expect(active(s).tree.root.kids.map((k) => k.m)).toEqual([180]);
    expect(active(s).cursorPath).toEqual([0]);
  });
});

describe('canonicalUrl', () => {
  test('non-default forced variant keeps its URL; route params still parse', () => {
    expect(canonicalUrl({ kind: 'scratch' }, { game: 5, moves: [180] })).toBe('/p/5/180');
    const parsed = parsePositionParams('5', '180');
    expect(parsed).toEqual({ game: 5, cells: [180] });
    expect(buildTreeFromMoves(parsed.cells).path).toEqual([0]);
  });
  test('scratch tab at only the forced opening is "/"', () => {
    expect(canonicalUrl({ kind: 'scratch' }, { game: 1, moves: [180] })).toBe('/');
    expect(canonicalUrl({ kind: 'scratch' }, { game: 1, moves: [180, 181] })).toBe('/p/1/180-181');
  });
});

describe('empty-board URL carries the variant', () => {
  test('canonicalUrl: empty free-first-move non-default game -> /p/<game>; default -> /', () => {
    expect(canonicalUrl({ kind: 'scratch' }, { game: 19, moves: [] })).toBe('/p/19');
    expect(canonicalUrl({ kind: 'scratch' }, { game: 27, moves: [] })).toBe('/p/27');
    expect(canonicalUrl({ kind: 'scratch' }, { game: 1, moves: [] })).toBe('/');
  });

  test('parsePositionParams accepts a known game with no moves; rejects unknown', () => {
    expect(parsePositionParams('19', undefined)).toEqual({ game: 19, cells: [] });
    expect(parsePositionParams('999', undefined)).toBeNull();
    expect(parsePositionParams('abc', undefined)).toBeNull();
  });
});
