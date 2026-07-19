// Pure game-tree model — NO redux imports (docSlice consumes this; it must stay independent
// and unit-testable on plain data).
//
// A TREE is `{ root, nextId }`. A NODE is `{ id, m, tags: [], c: '', kids: [] }`:
//   id   — monotonically increasing int assigned by this module (unique within a tree)
//   m    — the move cell (flat board index); null ONLY at the root
//   tags — annotation glyphs (e.g. '!', '?')
//   c    — comment text
//   kids — child nodes; kids[0] is the mainline continuation
//
// A PATH is an array of child indices from the root: [] is the root, [0] its first child,
// [0,1] the second child of the first child, etc.
//
// Mutating operations are pure: they return a NEW tree (cloned along the way) and never touch
// the input. Trees are small (analysis lines), so a full structural clone per edit is fine.
//
// WIRE FORMAT: `{ v:1, root:{ m, tags?, c?, kids? } }`. ids are an in-memory concern and are
// stripped on export; fromWire reassigns fresh ids. Optional keys are omitted when empty so
// the serialization is stable and round-trips by structure.

function newNode(id, m) {
  return { id, m, tags: [], c: '', kids: [] };
}

function cloneNode(n) {
  return { id: n.id, m: n.m, tags: n.tags.slice(), c: n.c, kids: n.kids.map(cloneNode) };
}

function cloneTree(t) {
  return { root: cloneNode(t.root), nextId: t.nextId };
}

export function createTree() {
  return { root: newNode(0, null), nextId: 1 };
}

// The node at `path`, or undefined if the path runs off the tree.
export function nodeAt(tree, path) {
  let n = tree.root;
  for (const i of path) {
    if (!n || !n.kids[i]) return undefined;
    n = n.kids[i];
  }
  return n;
}

// Append `cell` as a child of the node at `path`. If a child with that move already exists,
// no node is added and the existing child's path is returned (dedup). Returns { tree, path }.
export function addMove(tree, path, cell) {
  const target = nodeAt(tree, path);
  const existing = target ? target.kids.findIndex((k) => k.m === cell) : -1;
  if (existing !== -1) {
    return { tree, path: [...path, existing] };
  }
  const next = cloneTree(tree);
  const parent = nodeAt(next, path);
  const idx = parent.kids.length;
  parent.kids.push(newNode(next.nextId, cell));
  next.nextId += 1;
  return { tree: next, path: [...path, idx] };
}

// Make the node at `path` the first child of its parent (the new mainline at that branch).
export function promoteVariation(tree, path) {
  if (path.length === 0) return tree;
  const next = cloneTree(tree);
  const parent = nodeAt(next, path.slice(0, -1));
  const [node] = parent.kids.splice(path[path.length - 1], 1);
  parent.kids.unshift(node);
  return next;
}

// Remove the subtree rooted at `path`. Deleting the root ([]) is a no-op.
export function deleteBranch(tree, path) {
  if (path.length === 0) return tree;
  const next = cloneTree(tree);
  const parent = nodeAt(next, path.slice(0, -1));
  parent.kids.splice(path[path.length - 1], 1);
  return next;
}

// Add an annotation tag to the node at `path` (deduped).
export function setTag(tree, path, tag) {
  const next = cloneTree(tree);
  const node = nodeAt(next, path);
  if (node && !node.tags.includes(tag)) node.tags.push(tag);
  return next;
}

// Toggle an annotation tag on the node at `path`. Annotation type is MUTUALLY EXCLUSIVE
// (sgf-pgn-formats.md L113: one of GOOD/VERY_GOOD/BAD/VERY_BAD/INTERESTING per node, mapping to a
// single TE/BM/IT on export), so this is single-select: setting `tag` replaces any other glyph;
// re-toggling the currently-active glyph clears the annotation to [].
export function toggleTag(tree, path, tag) {
  const next = cloneTree(tree);
  const node = nodeAt(next, path);
  if (!node) return next;
  const active = node.tags.length === 1 && node.tags[0] === tag;
  node.tags = active ? [] : [tag];
  return next;
}

// Set the comment text of the node at `path`.
export function setComment(tree, path, text) {
  const next = cloneTree(tree);
  const node = nodeAt(next, path);
  if (node) node.c = text;
  return next;
}

// The mainline move list (following kids[0] from the root).
export function mainline(tree) {
  const out = [];
  let n = tree.root;
  while (n.kids.length) {
    n = n.kids[0];
    out.push(n.m);
  }
  return out;
}

// The move list from the root down to `path`.
export function lineTo(tree, path) {
  const out = [];
  let n = tree.root;
  for (const i of path) {
    n = n.kids[i];
    if (!n) break;
    out.push(n.m);
  }
  return out;
}

function nodeToWire(n) {
  const w = { m: n.m };
  if (n.tags.length) w.tags = n.tags.slice();
  if (n.c) w.c = n.c;
  if (n.kids.length) w.kids = n.kids.map(nodeToWire);
  return w;
}

export function toWire(tree) {
  return { v: 1, root: nodeToWire(tree.root) };
}

export function fromWire(json) {
  let nextId = 0;
  const build = (w) => {
    const node = newNode(nextId, w.m === undefined ? null : w.m);
    nextId += 1;
    if (w.tags) node.tags = w.tags.slice();
    if (w.c) node.c = w.c;
    if (w.kids) node.kids = w.kids.map(build);
    return node;
  };
  const root = build(json.root);
  return { root, nextId };
}
