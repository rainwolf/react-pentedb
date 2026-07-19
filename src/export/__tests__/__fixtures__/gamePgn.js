// GOLDEN: PGN game export/parse. Byte-exact output of exportGamePgn(header, moves) and the
// canonical parse target. Transcribed from sgf-pgn-formats.md §7.2 (VERBATIM header order
// §4.2 + move list §4.4), with CRLF separators (formats.md §0) and no trailing newline after
// the move line. Moves: K10=180, J10=179, L11=162, M9=201.

const CRLF = '\r\n';

export const pgn = [
  '[Game "Pente"]',
  '[Site "pente.org"]',
  '[Event "-"]',
  '[Round "-"]',
  '[Section "-"]',
  '[Date "07/18/2026"]',
  '[Time "14:30:00"]',
  '[TimeControl "5+10"]',
  '[Rated "Y"]',
  '[Player 1 Name "alice"]',
  '[Player 1 Rating "1850"]',
  '[Player 1 Type "Human"]',
  '[Player 2 Name "bob"]',
  '[Player 2 Rating "1720"]',
  '[Player 2 Type "Human"]',
  '[Result "1-0"]',
  '',
  '1. K10 J10 2. L11 M9',
].join(CRLF);

export const header = {
  game: 1, // Pente
  site: 'pente.org',
  event: null, // -> "-"
  round: null, // -> "-"
  section: null, // -> "-"
  date: '07/18/2026',
  time: '14:30:00',
  timeControl: '5+10',
  rated: true, // -> "Y"
  player1: { name: 'alice', rating: 1850, type: 'Human' },
  player2: { name: 'bob', rating: 1720, type: 'Human' },
  result: 'player1', // -> "1-0"
};

export const moves = [180, 179, 162, 201];
