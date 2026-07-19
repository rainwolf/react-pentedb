// GOLDEN: analysis-tree SGF export/parse.
//
// This is the byte-exact output of exportAnalysisSgf({name, game, tree}) for the model below.
// It is derived from sgf-pgn-formats.md §7.1 (the CONSTRUCTED worked example) but tailored to
// what OUR model can represent: the gameTree carries no HASH/ROT/N properties, and the
// {name, game, tree} input carries no player/result/rules/time data — so those header lines
// from the §3.5 template are omitted here (see Ambiguities §9.4 resolution in sgf.js). The
// tree adds a branch (W[M9]) to exercise SGF variation nesting (§3.4 / Ambiguities §9.2).
//
// Line separator is CRLF per the shared default (formats.md §0). Center K10 = cell 180,
// J10 = 179, L11 = 162, M9 = 201. Colors are Pente alternation from depth (§2.4): B,W,B / W.

const CRLF = '\r\n';

export const sgf = [
  '(;FF[4] AP[Unknown:0.1] CA[ISO-8859-1] GM[101] SZ[19]',
  'GN[Opening study] US[] TV[1]',
  '(;B[K10](;W[J10];B[L11]C[strong]TE[1])(;W[M9])))',
].join(CRLF);

export const name = 'Opening study';
export const game = 1; // Pente -> GM[101]

// Wire-format tree (matches gameTree.toWire): root.m is null; a GOOD ('!') tag + comment on
// the L11 node, and a second variation W[M9] under B[K10].
export const tree = {
  v: 1,
  root: {
    m: null,
    kids: [
      {
        m: 180, // B[K10]
        kids: [
          { m: 179, kids: [{ m: 162, tags: ['!'], c: 'strong' }] }, // W[J10] -> B[L11] '!' 'strong'
          { m: 201 }, // W[M9] variation
        ],
      },
    ],
  },
};
