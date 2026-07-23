// Pure SGF-style layout for the analysis game tree. NO React / redux imports — this depends
// ONLY on the gameTree shape (`{ root, kids[] }`, kids[0] === the mainline continuation), so it
// stays trivially unit-testable on plain data. TreeView turns the result into an SVG
// node-and-edge diagram (nodes joined by lines): the mainline runs left→right, variations branch
// downward with elbow connectors.
//
//   col  — ply depth. The root's children are column 0 and each further move is one column
//          right: col = path.length - 1. The null-`m` root is depth 0 and is NEVER emitted as a
//          node (the first real moves are column 0; TreeView draws a tiny start marker at the
//          left instead).
//   row  — the SGF lane. kids[0] (the mainline) stays on its parent's row; every ADDITIONAL
//          child kids[k>0] (a variation) is dropped onto a fresh row below every lane used so
//          far — a running `nextFreeRow`, allocated depth-first, so lanes can never collide and
//          a variation's own sub-line continues rightward on its lane (its sub-variations get
//          further rows below). Row packing is deliberately loose: an abandoned lane is not
//          reclaimed. The tray scrolls, so height is free; a later compaction pass could reuse
//          emptied lanes (see fb14-report.md).
//   path — the docSlice cursor path: child indices from the root ([] = root, [0] = first move,
//          [0,1] = the second child of the first move). navTo / promoteVariation / deleteBranch
//          all key off exactly this, so the layout carries it verbatim.
//
// x / y are the top-left of each node's box in CSS px, derived from the shared GEO metrics so
// TreeView and the tests agree on geometry.

export const GEO = {
  NODE_W: 52, // node box width  — fits the widest label ("T19 ??")
  NODE_H: 24, // node box height — a small pill, matching MUI's small Chip
  COL_W: 64, // column pitch (NODE_W + the horizontal connector gap)
  ROW_H: 34, // row pitch    (NODE_H + the vertical connector gap)
  PAD: 12, // outer padding around the diagram
  START_W: 14, // left gutter that holds the start marker (the empty-board origin)
};

// Top-left x/y of a node box at the given column / row.
export function nodeX(col) {
  return GEO.PAD + GEO.START_W + col * GEO.COL_W;
}
export function nodeY(row) {
  return GEO.PAD + row * GEO.ROW_H;
}

// Centre of the start marker — the invisible root — from which the first moves' edges spring.
export function startPoint() {
  return { x: GEO.PAD + GEO.START_W / 2, y: nodeY(0) + GEO.NODE_H / 2 };
}

// layoutTree(tree) -> { nodes, edges, width, height }
//   nodes: [{ path, m, tags, col, row, x, y }]  (root excluded — it carries no move)
//   edges: [{ fromPath, toPath, kind }]  kind 'main' (kids[0], a straight horizontal line) |
//          'variation' (kids[k>0], an elbow). fromPath === [] means the edge springs from the
//          root/start marker (the first move, or a variation off the root).
export function layoutTree(tree) {
  const nodes = [];
  const edges = [];
  if (!tree || !tree.root) {
    return { nodes, edges, width: GEO.PAD * 2 + GEO.START_W, height: GEO.PAD * 2 + GEO.NODE_H };
  }

  let nextFreeRow = 0;
  let maxCol = -1;
  let maxRow = 0;

  // Depth-first. `node` sits at `row`; `path` is its cursor path. kids[0] inherits the row;
  // each kids[k>0] claims ++nextFreeRow (a fresh lane below everything allocated so far). The
  // root (path []) is walked to seed its children but is never emitted as a node.
  const walk = (node, path, row) => {
    if (path.length > 0) {
      const col = path.length - 1;
      nodes.push({ path, m: node.m, tags: node.tags || [], col, row, x: nodeX(col), y: nodeY(row) });
      if (col > maxCol) maxCol = col;
      if (row > maxRow) maxRow = row;
    }
    node.kids.forEach((kid, i) => {
      const kidRow = i === 0 ? row : ++nextFreeRow;
      edges.push({ fromPath: path, toPath: [...path, i], kind: i === 0 ? 'main' : 'variation' });
      walk(kid, [...path, i], kidRow);
    });
  };

  walk(tree.root, [], 0);

  const width = maxCol < 0 ? GEO.PAD * 2 + GEO.START_W : nodeX(maxCol) + GEO.NODE_W + GEO.PAD;
  const height = nodeY(maxRow) + GEO.NODE_H + GEO.PAD;
  return { nodes, edges, width, height };
}
