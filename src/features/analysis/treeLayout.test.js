// Pure layout core for the SGF-style analysis game tree (fb14). layoutTree depends ONLY on the
// gameTree shape, so these tests run on plain trees built with the real createTree/addMove — the
// same child-index convention docSlice's cursor paths use — and pin exact col/row/x/y and the
// edge list (main vs variation, from/to paths).
import { describe, test, expect } from 'vitest';
import { createTree, addMove } from '../../model/gameTree';
import { layoutTree, GEO, nodeX, nodeY } from './treeLayout';

// A node lookup keyed by its cursor path, for terse assertions.
function byPath(layout) {
  const map = new Map(layout.nodes.map((n) => [n.path.join('.'), n]));
  return (path) => map.get(path.join('.'));
}
function edgeKey(e) {
  return `${e.fromPath.join('.')}>${e.toPath.join('.')}:${e.kind}`;
}

// The branched fixture the brief calls for: a mainline of 4, a variation branching at the 2nd
// move (a 2nd child), and a sub-variation off that variation.
//   root
//   └ 10 [0] ── 11 [0,0] ─┬ 12 [0,0,0] ── 13 [0,0,0,0]      (mainline, row 0, cols 0..3)
//                         └ 20 [0,0,1] ─┬ 21 [0,0,1,0]       (variation, row 1, cols 2..3)
//                                       └ 30 [0,0,1,1]       (sub-variation, row 2, col 3)
function branchedFixture() {
  let { tree } = addMove(createTree(), [], 10); // 10  at [0]
  ({ tree } = addMove(tree, [0], 11)); // 11 at [0,0]
  ({ tree } = addMove(tree, [0, 0], 12)); // 12 at [0,0,0]
  ({ tree } = addMove(tree, [0, 0, 0], 13)); // 13 at [0,0,0,0]
  ({ tree } = addMove(tree, [0, 0], 20)); // 20 at [0,0,1] (2nd child of 11)
  ({ tree } = addMove(tree, [0, 0, 1], 21)); // 21 at [0,0,1,0]
  ({ tree } = addMove(tree, [0, 0, 1], 30)); // 30 at [0,0,1,1] (2nd child of 20)
  return tree;
}

describe('layoutTree — branched fixture', () => {
  const layout = layoutTree(branchedFixture());
  const at = byPath(layout);

  test('the mainline is a single row (row 0) marching across columns 0..3', () => {
    expect(at([0])).toMatchObject({ m: 10, col: 0, row: 0 });
    expect(at([0, 0])).toMatchObject({ m: 11, col: 1, row: 0 });
    expect(at([0, 0, 0])).toMatchObject({ m: 12, col: 2, row: 0 });
    expect(at([0, 0, 0, 0])).toMatchObject({ m: 13, col: 3, row: 0 });
  });

  test('the variation drops to row 1, starting at the branch depth (col 2)', () => {
    expect(at([0, 0, 1])).toMatchObject({ m: 20, col: 2, row: 1 });
    expect(at([0, 0, 1, 0])).toMatchObject({ m: 21, col: 3, row: 1 }); // continues rightward on its lane
  });

  test('the sub-variation drops one further row (row 2)', () => {
    expect(at([0, 0, 1, 1])).toMatchObject({ m: 30, col: 3, row: 2 });
  });

  test('paths follow the docSlice child-index convention (kids[0] is the mainline)', () => {
    expect(layout.nodes.map((n) => n.path.join('.')).sort()).toEqual(
      ['0', '0.0', '0.0.0', '0.0.0.0', '0.0.1', '0.0.1.0', '0.0.1.1'].sort()
    );
  });

  test('x/y are col*COL_W / row*ROW_H offset by the padding + start gutter', () => {
    const e = at([0, 0, 1]); // col 2, row 1
    expect(e.x).toBe(nodeX(2));
    expect(e.y).toBe(nodeY(1));
    expect(e.x).toBe(GEO.PAD + GEO.START_W + 2 * GEO.COL_W);
    expect(e.y).toBe(GEO.PAD + 1 * GEO.ROW_H);
  });

  test('edges connect each node to its parent, tagged main vs variation', () => {
    const keys = layout.edges.map(edgeKey).sort();
    expect(keys).toEqual(
      [
        '>0:main', // root -> first move
        '0>0.0:main', // 10 -> 11
        '0.0>0.0.0:main', // 11 -> 12  (mainline)
        '0.0.0>0.0.0.0:main', // 12 -> 13
        '0.0>0.0.1:variation', // 11 -> 20 (the variation, an elbow)
        '0.0.1>0.0.1.0:main', // 20 -> 21
        '0.0.1>0.0.1.1:variation', // 20 -> 30 (sub-variation, an elbow)
      ].sort()
    );
  });

  test('width/height frame the widest column and lowest row', () => {
    expect(layout.width).toBe(GEO.PAD + GEO.START_W + 3 * GEO.COL_W + GEO.NODE_W + GEO.PAD);
    expect(layout.height).toBe(GEO.PAD + 2 * GEO.ROW_H + GEO.NODE_H + GEO.PAD);
  });
});

describe('layoutTree — degenerate shapes', () => {
  test('an empty tree (root only) has no nodes and no edges', () => {
    const layout = layoutTree(createTree());
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  test('null / malformed input is handled without throwing', () => {
    expect(layoutTree(null).nodes).toEqual([]);
    expect(layoutTree(undefined).nodes).toEqual([]);
  });

  test('a one-move tree is a single node at col 0 / row 0 with one main edge', () => {
    const { tree } = addMove(createTree(), [], 180);
    const layout = layoutTree(tree);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]).toMatchObject({ m: 180, col: 0, row: 0, path: [0] });
    expect(layout.edges).toEqual([{ fromPath: [], toPath: [0], kind: 'main' }]);
  });

  test('a linear tree (no branches) stays on a single row', () => {
    let { tree } = addMove(createTree(), [], 1);
    ({ tree } = addMove(tree, [0], 2));
    ({ tree } = addMove(tree, [0, 0], 3));
    const layout = layoutTree(tree);
    expect(layout.nodes.map((n) => n.row)).toEqual([0, 0, 0]);
    expect(layout.nodes.map((n) => n.col)).toEqual([0, 1, 2]);
    expect(layout.edges.every((e) => e.kind === 'main')).toBe(true);
  });

  test('a node with three children fans out onto rows 0 / 1 / 2 at the same column', () => {
    let { tree } = addMove(createTree(), [], 1); // [0], col 0
    ({ tree } = addMove(tree, [0], 2)); // [0,0]  child 0 (mainline)
    ({ tree } = addMove(tree, [0], 3)); // [0,1]  child 1 (variation)
    ({ tree } = addMove(tree, [0], 4)); // [0,2]  child 2 (variation)
    const at = byPath(layoutTree(tree));
    expect(at([0, 0])).toMatchObject({ col: 1, row: 0 });
    expect(at([0, 1])).toMatchObject({ col: 1, row: 1 });
    expect(at([0, 2])).toMatchObject({ col: 1, row: 2 });
  });
});
