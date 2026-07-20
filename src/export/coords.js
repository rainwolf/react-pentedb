// Alpha-numeric board coordinate text, shared by the SGF and PGN codecs.
//
// Authority: docs/superpowers/plans/research/pentedb/sgf-pgn-formats.md §1.2 / §7.3.
//   cell = x + y*19            (x = column 0=left, y = row 0=top)
//   x = cell % 19,  y = floor(cell / 19)
//   column letter = 'A' + x, but the letter 'I' (code 73) is SKIPPED — columns are
//                   A..H, J..T (chess convention).
//   row number = 19 - y        (top row y=0 -> "19"; bottom row y=18 -> "1").
// Worked value: cell 180 (x=9,y=9) -> 'J' bumped past 'I' to 'K', row 10 -> "K10".
//
// NOTE — doc self-inconsistency resolved to the §1.2 rule: the §7.3 table row "360 -> A1" is a
// width-20 arithmetic slip; under cell = x + y*19 the bottom-left is A1 = 342 (0 + 18*19) and
// cell 360 = T1. The spec-VERBATIM K10 = 180 confirms the ×19 formula, which this code follows.
//
// Ambiguities §9.3: the doc states the SGF B[]/W[] text goes through the SAME width-19
// formatCoordinates as PGN, so both dialects import this single module (no SGF-specific
// formatter) — resolved here in favour of one shared coordinate codec.

const SIZE = 19;

// cell (0..size*size-1) -> coordinate token, e.g. 180 -> "K10". Throws RangeError off-board.
// `size` defaults to 19 (the standard board) so every existing caller (SGF/PGN codecs,
// alphaToCell's round-trip) is unaffected; small-board Go variants (9x9, 13x13, ...) pass
// their own gridSize explicitly (see GameClass: move % gridSize).
export function cellToAlpha(cell, size = SIZE) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= size * size) {
    throw new RangeError(`cell out of range: ${cell}`);
  }
  const x = cell % size;
  const y = Math.floor(cell / size);
  // 'A'+x, skipping 'I' (code 73): any x>=8 shifts one letter up.
  const letter = String.fromCharCode(65 + x + (x >= 8 ? 1 : 0));
  const row = size - y;
  return `${letter}${row}`;
}

// coordinate token -> cell. Throws RangeError on any malformed / off-board input.
export function alphaToCell(str) {
  if (typeof str !== 'string') throw new RangeError(`not a coordinate: ${str}`);
  // Column A..H or J..T (I excluded), row 1..19, nothing else.
  const m = /^([A-HJ-T])([1-9]|1[0-9])$/.exec(str);
  if (!m) throw new RangeError(`invalid coordinate: ${JSON.stringify(str)}`);
  const code = m[1].charCodeAt(0);
  // A..H (65..72) -> 0..7; J..T (74..84) -> 8..18 (subtract the skipped 'I').
  const x = code < 73 ? code - 65 : code - 66;
  const row = Number(m[2]);
  if (row < 1 || row > SIZE) throw new RangeError(`row out of range: ${str}`);
  const y = SIZE - row;
  return x + y * SIZE;
}
