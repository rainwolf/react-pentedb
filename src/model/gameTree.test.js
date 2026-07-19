// Pure game-tree module: variation tree over move cells, cursor paths, wire (de)serialization.
import { describe, test, expect } from 'vitest';
import {
  createTree,
  nodeAt,
  addMove,
  promoteVariation,
  deleteBranch,
  setTag,
  setComment,
  mainline,
  lineTo,
  toWire,
  fromWire,
} from './gameTree';

// Build the canonical 3-leaf fixture used across several tests:
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

describe('createTree / nodeAt', () => {
  test('root is an empty node reachable at path []', () => {
    const t = createTree();
    expect(nodeAt(t, [])).toBe(t.root);
    expect(t.root.m).toBeNull();
    expect(t.root.kids).toEqual([]);
  });
});

describe('addMove', () => {
  test('appends a child and returns its path', () => {
    const { tree, path } = addMove(createTree(), [], 100);
    expect(path).toEqual([0]);
    expect(mainline(tree)).toEqual([100]);
    expect(nodeAt(tree, [0]).m).toBe(100);
  });

  test('dedups an identical move — no new node, returns existing path', () => {
    const a = addMove(createTree(), [], 100);
    const b = addMove(a.tree, [], 100);
    expect(b.path).toEqual([0]);
    expect(nodeAt(b.tree, []).kids).toHaveLength(1);
  });

  test('a different cell mid-line creates a sibling variation', () => {
    let { tree } = addMove(createTree(), [], 100);
    ({ tree } = addMove(tree, [0], 101));
    const v = addMove(tree, [0], 102);
    expect(v.path).toEqual([0, 1]);
    expect(nodeAt(v.tree, [0]).kids).toHaveLength(2);
    expect(mainline(v.tree)).toEqual([100, 101]); // first child stays the mainline
    expect(lineTo(v.tree, [0, 1])).toEqual([100, 102]);
  });

  test('does not mutate the input tree', () => {
    const t0 = createTree();
    addMove(t0, [], 100);
    expect(t0.root.kids).toHaveLength(0);
  });
});

describe('promoteVariation', () => {
  test('makes the node the first child of its parent', () => {
    const t = fixture();
    const p = promoteVariation(t, [0, 1]); // promote 102 above 101
    expect(nodeAt(p, [0, 0]).m).toBe(102);
    expect(nodeAt(p, [0, 1]).m).toBe(101);
    expect(mainline(p)).toEqual([100, 102]);
  });
});

describe('deleteBranch', () => {
  test('removes the subtree and reindexes siblings', () => {
    const t = fixture();
    const d = deleteBranch(t, [0, 0]); // delete 101
    expect(nodeAt(d, [0]).kids).toHaveLength(1);
    expect(nodeAt(d, [0, 0]).m).toBe(102); // 102 shifted into slot 0
  });

  test('deleting the root path is a no-op', () => {
    const t = fixture();
    expect(deleteBranch(t, []).root.kids).toHaveLength(2);
  });
});

describe('setTag / setComment', () => {
  test('sets tags (deduped) and a comment on a node', () => {
    let t = fixture();
    t = setTag(t, [0, 0], '!');
    t = setTag(t, [0, 0], '!'); // dedup
    t = setComment(t, [0, 1], 'good move');
    expect(nodeAt(t, [0, 0]).tags).toEqual(['!']);
    expect(nodeAt(t, [0, 1]).c).toBe('good move');
  });
});

describe('mainline / lineTo', () => {
  test('mainline follows first children; lineTo follows an explicit path', () => {
    const t = fixture();
    expect(mainline(t)).toEqual([100, 101]);
    expect(lineTo(t, [1])).toEqual([200]);
    expect(lineTo(t, [0, 1])).toEqual([100, 102]);
    expect(lineTo(t, [])).toEqual([]);
  });
});

describe('toWire / fromWire', () => {
  test('serializes to the {v:1, root:{m,tags?,c?,kids?}} shape, stripping ids', () => {
    let t = fixture();
    t = setTag(t, [0, 0], '!');
    t = setComment(t, [0, 1], 'good');
    t = setTag(t, [1], '?');
    t = setComment(t, [1], 'dubious');
    expect(toWire(t)).toEqual({
      v: 1,
      root: {
        m: null,
        kids: [
          { m: 100, kids: [{ m: 101, tags: ['!'] }, { m: 102, c: 'good' }] },
          { m: 200, tags: ['?'], c: 'dubious' },
        ],
      },
    });
  });

  test('round-trips identically through fromWire on a 3-branch tree with tags+comments', () => {
    let t = fixture();
    t = setTag(t, [0, 0], '!');
    t = setComment(t, [0, 1], 'good');
    t = setTag(t, [1], '?');
    t = setComment(t, [1], 'dubious');
    const wire = toWire(t);
    expect(toWire(fromWire(wire))).toEqual(wire);
  });

  test('fromWire assigns fresh monotonic ids so further addMove stays unique', () => {
    const rebuilt = fromWire(toWire(fixture()));
    const ids = [];
    const walk = (n) => {
      ids.push(n.id);
      n.kids.forEach(walk);
    };
    walk(rebuilt.root);
    expect(new Set(ids).size).toBe(ids.length); // all ids distinct
    expect(rebuilt.nextId).toBeGreaterThan(Math.max(...ids));
  });
});
