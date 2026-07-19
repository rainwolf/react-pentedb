// GOLDEN (parse-tolerance): a minimal PGN with only a few headers, no Rated key, and aliased
// White/Black keys. Exercises: Rated missing -> true (formats.md §4.3), Event/Round/Section
// absent, alias keys White/Black/WhiteRating/BlackRating, "?"/"-" -> null, and the tolerant
// switch to move text at the first non-header line. Plain \n line endings (parser tolerant).

export const pgn =
  '[Game "Pente"]\n' +
  '[White "alice"]\n' +
  '[Black "?"]\n' +
  '[Result "1/2-1/2"]\n' +
  '\n' +
  '1. K10 J10 2. L11';

export const expected = {
  header: {
    game: 1,
    player1: { name: 'alice' },
    player2: { name: null },
    result: 'draw',
    rated: true, // missing Rated -> true
  },
  moves: [180, 179, 162],
};
