// SGF dialect codec (import + export) for the pentedb workbench.
//
// THE format authority is docs/superpowers/plans/research/pentedb/sgf-pgn-formats.md; where
// the plan and that doc disagree, the doc wins. This is the desktop app's *custom, non-standard
// SGF subset* (spec §13), not general SGF. Pure module: no React/redux/api, no fs.
//
// Every item from the doc's Ambiguities §9 that this file touches is resolved inline with a
// comment citing the choice made (see §9.1, §9.2, §9.4, §9.7 below).

import { cellToAlpha, alphaToCell } from './coords';

const CRLF = '\r\n'; // shared line separator (formats.md §0)

// ---------------------------------------------------------------------------------------------
// Variant name / colour tables (formats.md §2). Exported for reuse by the PGN codec.
// ---------------------------------------------------------------------------------------------

// §2.1 base ids -> display name. Speed variant = base+1 ("Speed X"); turn-based = base+50.
const BASE_NAMES = {
  1: 'Pente',
  3: 'Keryo-Pente',
  5: 'Gomoku',
  7: 'D-Pente',
  9: 'G-Pente',
  11: 'Poof-Pente',
  13: 'Connect6',
  15: 'Boat-Pente',
};

// getGameName(id) — the base name (§2.2): base id, its speed pair (even = base+1), or the
// base name for a turn-based id (odd 51..65 = base+50).
export function getName(id) {
  if (BASE_NAMES[id]) return BASE_NAMES[id];
  if (BASE_NAMES[id - 1]) return `Speed ${BASE_NAMES[id - 1]}`; // even speed id
  if (BASE_NAMES[id - 50]) return BASE_NAMES[id - 50]; // turn-based -> base name
  return undefined;
}

// getDisplayName(id) — the label used on SGF parse (game = getDisplayName(GM-100), §2.3).
// Differs from getName only for turn-based ids, which display "Turn-based X".
export function getDisplayName(id) {
  if (BASE_NAMES[id - 50] && (id - 50) % 2 === 1) return `Turn-based ${BASE_NAMES[id - 50]}`;
  return getName(id);
}

// getGameId(name) — reverse map; base names scanned before TB so ambiguous "Pente" -> 1 (§2.2).
const NAME_TO_ID = (() => {
  const m = new Map();
  for (const idStr of Object.keys(BASE_NAMES)) {
    const id = Number(idStr);
    m.set(BASE_NAMES[id], id); // base
    m.set(`Speed ${BASE_NAMES[id]}`, id + 1); // speed pair
  }
  for (const idStr of Object.keys(BASE_NAMES)) {
    const id = Number(idStr);
    m.set(`Turn-based ${BASE_NAMES[id]}`, id + 50); // TB
  }
  return m;
})();

export function getGameId(name) {
  if (name == null) return undefined;
  if (NAME_TO_ID.has(name)) return NAME_TO_ID.get(name);
  return undefined;
}

// §2.4 per-move colour: 1 -> 'B', 2 -> 'W'. Base variants alternate (move 0 -> 1); Connect6
// plays 1,2,2,1,1,2,... The move index is the node depth from the root.
function isConnect6(game) {
  return game === 13 || game === 14 || game === 63 || game === 64;
}
export function getColor(moveNum, game) {
  if (isConnect6(game)) return (Math.floor((moveNum + 1) / 2) % 2) + 1;
  return (moveNum % 2) + 1;
}

// ---------------------------------------------------------------------------------------------
// Annotation glyph <-> SGF tag (formats.md §3.3 / §5). The glyph set is BINDING (TagBar.js).
//   '!' GOOD -> TE[1]   '!!' VERY_GOOD -> TE[2]
//   '?' BAD  -> BM[1]   '??' VERY_BAD  -> BM[2]
//   '!?' INTERESTING -> IT[1]
// Ambiguity §9.1: the doc leaves INTERESTING's exact tag value unquoted (shows "IT[...]").
// CHOICE: emit IT[1] — a single-severity INTERESTING, matching the [1]/[2] shape of TE/BM. The
// parser maps any IT[*] back to '!?', so this round-trips regardless of the value chosen.
const GLYPH_TO_TAG = { '!': 'TE[1]', '!!': 'TE[2]', '?': 'BM[1]', '??': 'BM[2]', '!?': 'IT[1]' };
function tagForGlyph(glyph) {
  return GLYPH_TO_TAG[glyph];
}
function glyphForTag(name, value) {
  if (name === 'TE') return value === '2' ? '!!' : '!';
  if (name === 'BM') return value === '2' ? '??' : '?';
  if (name === 'IT') return '!?';
  return undefined;
}

// Value escaping. Ambiguity §9 checklist item 10: the original writer emits values UNESCAPED
// (lossy for ']'/'\'). CHOICE: the "robust port" form — escape '\' -> '\\' and ']' -> '\]' on
// write; the reader (below) decodes them. Values without those chars are byte-identical to the
// faithful output, so the goldens still match; values containing them now round-trip losslessly.
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/]/g, '\\]');
}

export class SgfError extends Error {
  constructor({ line, message }) {
    super(message);
    this.name = 'SgfError';
    this.line = line;
  }
}

// ---------------------------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------------------------

function moveProps(node, depth, game) {
  const color = getColor(depth, game) === 1 ? 'B' : 'W';
  let out = `${color}[${cellToAlpha(node.m)}]`;
  if (node.c) out += `C[${esc(node.c)}]`;
  const glyph = node.tags && node.tags.length ? node.tags[0] : undefined;
  if (glyph && tagForGlyph(glyph)) out += tagForGlyph(glyph);
  return out;
}

// Render a forest of sibling continuations. One child is written inline; two or more are each
// wrapped in a "(...)" variation group (SGF convention — Ambiguity §9.2). CHOICE: export the
// FULL tree (all branches), not §3.5's mainline-only walk, so an analysis tree round-trips; the
// §3.5 note is honoured for linear trees, where full-tree and mainline output are identical.
function renderForest(nodes, depth, game) {
  if (!nodes || nodes.length === 0) return '';
  if (nodes.length === 1) return renderNode(nodes[0], depth, game);
  return nodes.map((n) => `(${renderNode(n, depth, game)})`).join('');
}
function renderNode(node, depth, game) {
  return `;${moveProps(node, depth, game)}${renderForest(node.kids, depth + 1, game)}`;
}

// exportAnalysisSgf({name, game, tree}) -> desktop-dialect analysis SGF string.
// TV is the analysis dispatch key (§3.2). Ambiguity §9.4: §3.5 lists PW/WR/PB/BR/RE/RU/TM
// header lines, but the {name, game, tree} input carries no player/result/time data — CHOICE:
// omit those lines for analysis export (an analysis tree is not a played game); only the
// identity block (FF/AP/CA/GM/SZ + GN/US/TV) is written.
export function exportAnalysisSgf({ name, game, tree }) {
  const gm = 100 + game;
  const header = [
    `(;FF[4] AP[Unknown:0.1] CA[ISO-8859-1] GM[${gm}] SZ[19]`,
    `GN[${esc(name == null ? '' : name)}] US[] TV[1]`,
  ].join(CRLF);
  const body = `(${renderForest(tree.root.kids, 0, game)})`;
  return `${header}${CRLF}${body})`;
}

// RE token from a canonical result ('player1'|'player2'|'draw'|undefined) — §3.5/§9.7.
function reToken(result) {
  if (result === 'player1') return 'W';
  if (result === 'player2') return 'B';
  if (result === 'draw') return 'Draw'; // §9.7 CHOICE: write the literal "Draw" (winner 0)
  return '';
}

// exportGameSgf(header, moves) -> linear game-record SGF. DBNM is the game dispatch key (§3.2).
// Ambiguity §9.4: the doc gives no single verbatim ordered template for game records, so the
// property order below is CHOSEN (identity block, then DBNM/GN/US, then site/event group, then
// players, then result/rules/time) and kept stable so it round-trips through parseSgf.
export function exportGameSgf(header, moves) {
  const h = header || {};
  const p1 = h.player1 || {};
  const p2 = h.player2 || {};
  const gm = 100 + (h.game || 0);
  const lines = [
    `(;FF[4] AP[Unknown:0.1] CA[ISO-8859-1] GM[${gm}] SZ[19]`,
    `DBNM[${esc(h.dbName == null ? '' : h.dbName)}] GN[${esc(h.name == null ? '' : h.name)}] US[${esc(h.creator == null ? '' : h.creator)}]`,
    `PC[${esc(h.site == null ? '' : h.site)}] EV[${esc(h.event == null ? '' : h.event)}] RO[${esc(h.round == null ? '' : h.round)}] SC[${esc(h.section == null ? '' : h.section)}] DT[${esc(h.date == null ? '' : h.date)}]`,
    `PW[${esc(p1.name == null ? '' : p1.name)}] WR[${p1.rating == null ? '' : p1.rating}] PB[${esc(p2.name == null ? '' : p2.name)}] BR[${p2.rating == null ? '' : p2.rating}]`,
    `RE[${reToken(h.result)}] RU[${h.rated ? 'Rated' : 'Unrated'}] TM[${esc(h.timeControl == null ? '-' : h.timeControl)}]`,
  ].join(CRLF);
  // Moves are a linear chain from the root; colour alternates by depth.
  let root = { m: null, kids: [] };
  let cur = root;
  moves.forEach((m) => {
    const n = { m, kids: [] };
    cur.kids.push(n);
    cur = n;
  });
  const body = `(${renderForest(root.kids, 0, h.game)})`;
  return `${lines}${CRLF}${body})`;
}

// ---------------------------------------------------------------------------------------------
// IMPORT (recursive-descent lexer over the custom SGF subset, §3.1)
// ---------------------------------------------------------------------------------------------

function lex(text) {
  let i = 0;
  let line = 1;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f';
  const skipWs = () => {
    while (i < text.length && isWs(text[i])) {
      if (text[i] === '\n') line += 1;
      i += 1;
    }
  };
  const readValue = () => {
    // assumes text[i] === '[' ; returns decoded string up to the unescaped ']'.
    const startLine = line;
    i += 1; // consume '['
    let out = '';
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        i += 1;
        if (i >= text.length) break;
        if (text[i] === '\n') line += 1;
        out += text[i];
        i += 1;
      } else if (c === ']') {
        i += 1;
        return out;
      } else {
        if (c === '\n') line += 1;
        out += c;
        i += 1;
      }
    }
    throw new SgfError({ line: startLine, message: 'unterminated property value' });
  };
  const readNode = () => {
    // assumes ';' already consumed; reads all NAME[VALUE] props on this node.
    const props = [];
    for (;;) {
      skipWs();
      const c = text[i];
      if (c === undefined || c === ';' || c === '(' || c === ')') break;
      if (/[A-Za-z]/.test(c)) {
        let name = '';
        while (i < text.length && /[A-Za-z]/.test(text[i])) {
          name += text[i];
          i += 1;
        }
        skipWs();
        if (text[i] !== '[') {
          // A letter run not followed by '[' — ignored stray char per §3.1.
          continue;
        }
        const propLine = line;
        const value = readValue();
        props.push({ name, value, line: propLine });
      } else {
        i += 1; // ignore any other char (§3.1)
      }
    }
    return props;
  };
  const readTree = () => {
    skipWs();
    if (text[i] !== '(') throw new SgfError({ line, message: "expected '('" });
    const openLine = line;
    i += 1;
    const gt = { nodes: [], children: [] };
    for (;;) {
      skipWs();
      const c = text[i];
      if (c === undefined) throw new SgfError({ line: openLine, message: "unterminated '(' group" });
      if (c === ';') {
        i += 1;
        gt.nodes.push(readNode());
      } else if (c === '(') {
        gt.children.push(readTree());
      } else if (c === ')') {
        i += 1;
        return gt;
      } else {
        i += 1; // stray char
      }
    }
  };
  skipWs();
  if (text[i] !== '(') throw new SgfError({ line, message: 'no SGF record found' });
  return readTree();
}

// A recognized-but-unmodeled property (our gameTree carries no hash/rotation/node-name).
const UNMODELED = new Set(['HASH', 'ROT', 'N']);
const HEADER_PROPS = new Set([
  'FF', 'AP', 'CA', 'GM', 'SZ', 'GN', 'US', 'TV', 'DBNM', 'PC', 'EV', 'RO', 'SC', 'DT',
  'PW', 'WR', 'PB', 'BR', 'RE', 'RU', 'TM',
]);

function first(props, name) {
  const p = props.find((x) => x.name === name);
  return p ? p.value : undefined;
}
function hasMove(props) {
  return props.some((p) => p.name === 'B' || p.name === 'W');
}

// Convert a node's props into a wire node {m, tags?, c?, kids?}, collecting warnings.
function wireNodeFromProps(props, warnings) {
  const mv = props.find((p) => p.name === 'B' || p.name === 'W');
  let cell;
  try {
    cell = alphaToCell(mv.value);
  } catch (e) {
    throw new SgfError({ line: mv.line, message: `invalid coordinate ${JSON.stringify(mv.value)}` });
  }
  const node = { m: cell, kids: [] };
  for (const p of props) {
    if (p.name === 'B' || p.name === 'W') continue;
    if (p.name === 'C') node.c = p.value;
    else if (p.name === 'TE' || p.name === 'BM' || p.name === 'IT') {
      const g = glyphForTag(p.name, p.value);
      if (g) node.tags = [g];
    } else if (UNMODELED.has(p.name)) {
      warnings.push(`unmodeled SGF property ${p.name}[${p.value}] (line ${p.line})`);
    } else if (!HEADER_PROPS.has(p.name)) {
      warnings.push(`unknown SGF property ${p.name} (line ${p.line})`);
    }
  }
  return node;
}

// Serialize a built node to wire form (omit empty tags/c/kids), matching gameTree.toWire.
function toWireNode(n) {
  const w = { m: n.m };
  if (n.tags && n.tags.length) w.tags = n.tags.slice();
  if (n.c) w.c = n.c;
  if (n.kids && n.kids.length) w.kids = n.kids.map(toWireNode);
  return w;
}

export function parseSgf(text) {
  const warnings = [];
  const gt = lex(text);

  // Collect header props from every node (they normally sit on the first, header-only node).
  const headerProps = [];
  const collectHeaders = (tree) => {
    for (const nodeProps of tree.nodes) {
      if (!hasMove(nodeProps)) headerProps.push(...nodeProps);
    }
    tree.children.forEach(collectHeaders);
  };
  collectHeaders(gt);

  const gmRaw = first(headerProps, 'GM');
  const gmId = gmRaw != null ? parseInt(gmRaw, 10) - 100 : undefined;

  // Build our move tree: header-only nodes (no B/W) are skipped, their children re-parent.
  const root = { m: null, kids: [] };
  const attach = (parent, tree) => {
    let cur = parent;
    for (const nodeProps of tree.nodes) {
      if (hasMove(nodeProps)) {
        const child = wireNodeFromProps(nodeProps, warnings);
        cur.kids.push(child);
        cur = child;
      } else {
        // header/root node: also flag any of ITS unmodeled/unknown props
        for (const p of nodeProps) {
          if (UNMODELED.has(p.name)) warnings.push(`unmodeled SGF property ${p.name}[${p.value}] (line ${p.line})`);
        }
      }
    }
    tree.children.forEach((c) => attach(cur, c));
  };
  attach(root, gt);

  const isAnalysis = first(headerProps, 'TV') !== undefined;
  const name = first(headerProps, 'GN');
  const wireTree = { v: 1, root: toWireNode(root) };

  if (isAnalysis) {
    return {
      kind: 'analysis',
      game: gmId != null ? getDisplayName(gmId) : undefined,
      name: name == null ? undefined : name,
      tree: wireTree,
      warnings,
    };
  }

  // Game record (DBNM dispatch key). Map header props back per §3.6.
  const dash = (v) => (v === '-' || v === '' || v == null ? null : v);
  const numOrNull = (v) => (v == null || v === '' || v === '?' || v === '-' ? null : Number(v));
  const nameOrNull = (v) => (v == null || v === '' || v === '?' || v === '-' ? null : v);
  const re = first(headerProps, 'RE');
  let result;
  if (re === 'W') result = 'player1';
  else if (re === 'B') result = 'player2';
  else if (re === 'Draw') result = 'draw';
  const moves = [];
  let n = root;
  while (n.kids.length) {
    n = n.kids[0];
    moves.push(n.m);
  }
  const header = {
    game: gmId,
    dbName: first(headerProps, 'DBNM'),
    name: first(headerProps, 'GN'),
    site: first(headerProps, 'PC'),
    event: dash(first(headerProps, 'EV')),
    round: dash(first(headerProps, 'RO')),
    section: dash(first(headerProps, 'SC')),
    date: first(headerProps, 'DT') || undefined,
    player1: { name: nameOrNull(first(headerProps, 'PW')), rating: numOrNull(first(headerProps, 'WR')) },
    player2: { name: nameOrNull(first(headerProps, 'PB')), rating: numOrNull(first(headerProps, 'BR')) },
    result,
    rated: first(headerProps, 'RU') === 'Rated',
    timeControl: parseTimeControl(first(headerProps, 'TM')),
  };
  return {
    kind: 'game',
    game: gmId != null ? getDisplayName(gmId) : undefined,
    name: header.name == null ? undefined : header.name,
    header,
    moves,
    warnings,
  };
}

// §3.7 time-control parsing (shared with PGN). Returns the (trimmed, day-stripped) control
// string, or null for untimed "-". Kept as a string for deterministic round-tripping.
export function parseTimeControl(raw) {
  if (raw == null) return undefined;
  let v = String(raw);
  if (v.endsWith('days')) v = v.slice(0, -4);
  else if (v.endsWith('day')) v = v.slice(0, -3);
  v = v.trim();
  if (v === '-' || v === '') return null;
  return v;
}
