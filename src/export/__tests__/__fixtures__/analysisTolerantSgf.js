// GOLDEN (parse-tolerance): the sgf-pgn-formats.md §7.1 worked example transcribed VERBATIM,
// including properties our model does NOT own (HASH, ROT, N) and a full player/result header.
// parseSgf must read it tolerantly: recognized-but-unmodeled props (HASH/ROT/N) become
// warnings; header props map to game/name; the move nodes build the tree.
//
// Newlines are plain \n (as printed in the doc); the SGF lexer skips all whitespace so this
// is accepted identically to the CRLF form.

export const sgf =
  '(;FF[4] AP[Unknown:0.1] CA[ISO-8859-1] GM[101] SZ[19]\n' +
  'GN[Opening study] US[dweebo] TV[1]\n' +
  'PW[alice] WR[1850]\n' +
  'PB[bob] BR[1720]\n' +
  'RE[W]\n' +
  'RU[Rated]\n' +
  'TM[5+10]\n' +
  '(;B[K10];W[J10]HASH[123456789]ROT[3];B[L11]N[key move]C[strong]TE[1]))';

// Expected parse result: linear tree B[K10] 180 -> W[J10] 179 -> B[L11] 162 ('!','strong').
export const expected = {
  kind: 'analysis',
  game: 'Pente', // getDisplayName(101 - 100)
  name: 'Opening study',
  tree: {
    v: 1,
    root: {
      m: null,
      kids: [
        { m: 180, kids: [{ m: 179, kids: [{ m: 162, tags: ['!'], c: 'strong' }] }] },
      ],
    },
  },
};
