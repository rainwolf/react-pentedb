import { describe, test, expect } from 'vitest';
import { exportAnalysisSgf, exportGameSgf, parseSgf, SgfError } from '../sgf';
import { createTree, addMove, setTag, setComment, toWire } from '../../model/gameTree';
import * as analysisFix from './__fixtures__/analysisSgf';
import * as tolerantFix from './__fixtures__/analysisTolerantSgf';

describe('exportAnalysisSgf — byte-exact golden', () => {
  test('produces the analysisSgf fixture byte-for-byte', () => {
    const out = exportAnalysisSgf({
      name: analysisFix.name,
      game: analysisFix.game,
      tree: analysisFix.tree,
    });
    expect(out).toBe(analysisFix.sgf);
  });
});

describe('parseSgf — analysis tree', () => {
  test('parse(export golden) recovers kind/game/name/tree', () => {
    const res = parseSgf(analysisFix.sgf);
    expect(res.kind).toBe('analysis');
    expect(res.game).toBe('Pente'); // getDisplayName(101-100)
    expect(res.name).toBe('Opening study');
    expect(res.tree).toEqual(analysisFix.tree);
  });

  test('tolerant parse of the verbatim §7.1 example (HASH/ROT/N -> warnings)', () => {
    const res = parseSgf(tolerantFix.sgf);
    expect(res.kind).toBe(tolerantFix.expected.kind);
    expect(res.game).toBe(tolerantFix.expected.game);
    expect(res.name).toBe(tolerantFix.expected.name);
    expect(res.tree).toEqual(tolerantFix.expected.tree);
    // HASH, ROT, N are recognized-but-unmodeled -> reported, not silently dropped.
    const joined = res.warnings.join(' ');
    expect(joined).toMatch(/HASH/);
    expect(joined).toMatch(/ROT/);
    expect(joined).toMatch(/\bN\b/);
  });
});

// A seeded PRNG (mulberry32) so the "random" tree is deterministic across runs.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a random but legal analysis tree of ~n move nodes using the real gameTree ops.
function randomTree(seed, n) {
  const rnd = mulberry32(seed);
  const glyphs = ['!', '!!', '?', '??', '!?'];
  let tree = createTree();
  const paths = [[]]; // known parent paths (start at root)
  let made = 0;
  let guard = 0;
  while (made < n && guard < n * 50) {
    guard += 1;
    const parent = paths[Math.floor(rnd() * paths.length)];
    const cell = Math.floor(rnd() * 361);
    const before = tree.nextId;
    const res = addMove(tree, parent, cell);
    tree = res.tree;
    if (tree.nextId === before) continue; // dedup collision -> skip
    made += 1;
    if (rnd() < 0.35) tree = setTag(tree, res.path, glyphs[Math.floor(rnd() * glyphs.length)]);
    if (rnd() < 0.3) {
      // Alphabet deliberately includes ']' and '\\' (and the '\\]' sequence) so the escape/unescape
      // path is exercised by the property test, not just the dedicated escaping cases below.
      const words = ['open', 'key', 'a]b', 'c\\d', 'e\\]f', 'threat 3', 'x]]y', 'trailing\\'];
      tree = setComment(tree, res.path, words[Math.floor(rnd() * words.length)]);
    }
    paths.push(res.path);
  }
  return tree;
}

describe('parse(export(x)) === x — property style, seeded 30-node tree', () => {
  test('round-trips structure, moves, tags and comments', () => {
    const tree = randomTree(0xC0FFEE, 30);
    const wire = toWire(tree);
    const sgf = exportAnalysisSgf({ name: 'rnd', game: 1, tree: wire });
    const res = parseSgf(sgf);
    expect(res.tree).toEqual(wire);
    expect(res.name).toBe('rnd');
  });
});

describe('SGF value escaping (]/\\) is lossless through export -> parse', () => {
  // esc() diverges from the desktop's byte-faithful (lossy) output by escaping '\' -> '\\' and
  // ']' -> '\]' (formats.md §3.3 L122 "robust port" form). These cases give that path direct
  // coverage: a node comment AND an analysis name carrying ']', '\', and the combined '\]'
  // sequence must survive a full round-trip. The runtime strings below contain literal
  // backslashes/brackets ('a]b\\c\\]d' === a ] b \ c \ ] d).
  const HARD = 'a]b\\c\\]d';

  test('analysis: node comment + name with ]/\\ round-trip losslessly', () => {
    const wire = {
      v: 1,
      root: { m: null, kids: [{ m: 180, kids: [{ m: 179, c: HARD }] }] },
    };
    const sgf = exportAnalysisSgf({ name: HARD, game: 1, tree: wire });
    const res = parseSgf(sgf);
    expect(res.name).toBe(HARD);
    expect(res.tree).toEqual(wire);
  });

  test('analysis: bare "]", bare "\\", and a trailing "\\" each survive', () => {
    for (const c of [']', '\\', 'x\\', ']]', '\\]']) {
      const wire = { v: 1, root: { m: null, kids: [{ m: 180, c }] } };
      const res = parseSgf(exportAnalysisSgf({ name: c, game: 1, tree: wire }));
      expect(res.name).toBe(c);
      expect(res.tree).toEqual(wire);
    }
  });

  test('game: header text fields with ]/\\ round-trip losslessly', () => {
    const header = {
      game: 1,
      dbName: HARD,
      site: 'a]b',
      event: 'c\\d',
      player1: { name: 'p]1', rating: 1850 },
      player2: { name: 'p\\2', rating: 1720 },
      result: 'player1',
      rated: true,
      timeControl: '5+10',
    };
    const res = parseSgf(exportGameSgf(header, [180, 179]));
    expect(res.kind).toBe('game');
    expect(res.header.dbName).toBe(HARD);
    expect(res.header.site).toBe('a]b');
    expect(res.header.event).toBe('c\\d');
    expect(res.header.player1.name).toBe('p]1');
    expect(res.header.player2.name).toBe('p\\2');
    expect(res.moves).toEqual([180, 179]);
  });
});

describe('exportGameSgf / parseSgf — linear game record round-trip', () => {
  test('a played game round-trips its header + moves through DBNM-dispatched SGF', () => {
    const header = {
      game: 1,
      dbName: 'penteorg',
      site: 'pente.org',
      event: 'Championship',
      round: '3',
      section: 'A',
      date: '07/18/2026',
      player1: { name: 'alice', rating: 1850 },
      player2: { name: 'bob', rating: 1720 },
      result: 'player1',
      rated: true,
      timeControl: '5+10',
    };
    const moves = [180, 179, 162, 201];
    const sgf = exportGameSgf(header, moves);
    const res = parseSgf(sgf);
    expect(res.kind).toBe('game');
    expect(res.moves).toEqual(moves);
    expect(res.header.dbName).toBe('penteorg');
    expect(res.header.site).toBe('pente.org');
    expect(res.header.event).toBe('Championship');
    expect(res.header.player1.name).toBe('alice');
    expect(res.header.player2.rating).toBe(1720);
    expect(res.header.result).toBe('player1');
    expect(res.header.rated).toBe(true);
  });
});

describe('parseSgf — malformed input throws SgfError with a line number', () => {
  test('an unterminated property value reports the line', () => {
    let err;
    try {
      parseSgf('(;FF[4] TV[1]\n(;B[K10]\n;W[J10'); // missing closing ]
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SgfError);
    expect(typeof err.line).toBe('number');
    expect(err.line).toBeGreaterThan(0);
  });

  test('an invalid coordinate reports the line it occurred on', () => {
    let err;
    try {
      parseSgf('(;FF[4] TV[1]\n(;B[K10]\n;W[I5]))'); // I5 is an invalid column (I skipped)
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SgfError);
    expect(err.line).toBe(3);
  });
});
