// PGN dialect codec (import + export). Chess-PGN-inspired plain text for ONE game per record;
// files may hold several. Authority: sgf-pgn-formats.md §4 (the doc wins over the plan).
// Pure module: no React/redux/api, no fs.
//
// Ambiguities §9 touched here: §9.6 (Player Type always written) resolved inline below.

import { cellToAlpha, alphaToCell } from './coords';
import { getName, getGameId, parseTimeControl } from './sgf';

const CRLF = '\r\n'; // §0 shared line separator

export class PgnError extends Error {
  constructor({ line, message }) {
    super(message);
    this.name = 'PgnError';
    this.line = line;
  }
}

// canonical result <-> PGN token (§4.3)
function resultToken(result) {
  if (result === 'player1') return '1-0';
  if (result === 'player2') return '0-1';
  if (result === 'draw') return '1/2-1/2';
  return '?';
}
function tokenToResult(tok) {
  if (tok === '1-0') return 'player1';
  if (tok === '0-1') return 'player2';
  if (tok === '1/2-1/2' || tok === '0-0') return 'draw';
  return 'unknown';
}

const dashOut = (v) => (v == null || v === '' ? '-' : String(v)); // Event/Round/Section: null -> "-"
const nameOut = (v) => (v == null || v === '' ? '?' : String(v)); // Player Name: null -> "?"
const ratingOut = (v) => (v == null || v === 0 ? '?' : String(v)); // Player Rating: 0/null -> "?"

// exportGamePgn(header, moves) -> PGN text. Header order per §4.2. The two Player Type headers
// are ALWAYS written (§9.6 CHOICE: emit them unconditionally, defaulting to "Human", since the
// doc lists them in the ordered set and gives no write-omission rule).
export function exportGamePgn(header, moves) {
  const h = header || {};
  const p1 = h.player1 || {};
  const p2 = h.player2 || {};
  const lines = [
    `[Game "${getName(h.game) || `Game ${h.game}`}"]`,
    `[Site "${h.site == null ? '' : h.site}"]`,
    `[Event "${dashOut(h.event)}"]`,
    `[Round "${dashOut(h.round)}"]`,
    `[Section "${dashOut(h.section)}"]`,
  ];
  if (h.date != null) lines.push(`[Date "${h.date}"]`);
  if (h.time != null) lines.push(`[Time "${h.time}"]`);
  lines.push(`[TimeControl "${h.timeControl == null ? '-' : h.timeControl}"]`);
  lines.push(`[Rated "${h.rated === false ? 'N' : 'Y'}"]`);
  lines.push(`[Player 1 Name "${nameOut(p1.name)}"]`);
  lines.push(`[Player 1 Rating "${ratingOut(p1.rating)}"]`);
  lines.push(`[Player 1 Type "${p1.type || 'Human'}"]`);
  lines.push(`[Player 2 Name "${nameOut(p2.name)}"]`);
  lines.push(`[Player 2 Rating "${ratingOut(p2.rating)}"]`);
  lines.push(`[Player 2 Type "${p2.type || 'Human'}"]`);
  lines.push(`[Result "${resultToken(h.result)}"]`);
  // §4.2 item 14: swap header only for DPente / SpeedDPente (game 7/8).
  if ((h.game === 7 || h.game === 8) && h.swapped != null) {
    lines.push(`[Player's Swapped? "${h.swapped ? 'Yes' : 'No'}"]`);
  }

  const moveTokens = [];
  for (let idx = 0; idx < moves.length; idx += 2) {
    const num = idx / 2 + 1;
    let pair = `${num}. ${cellToAlpha(moves[idx])}`;
    if (idx + 1 < moves.length) pair += ` ${cellToAlpha(moves[idx + 1])}`;
    moveTokens.push(pair);
  }
  const moveLine = moveTokens.join(' ');
  return [...lines, '', moveLine].join(CRLF);
}

// §4.1 header line: value = from first '"' to last '"'; key = index 1 up to the last space
// before the first '"'.
function parseHeaderLine(line) {
  const firstQuote = line.indexOf('"');
  const lastQuote = line.lastIndexOf('"');
  if (firstQuote < 0 || lastQuote <= firstQuote) return null;
  const value = line.slice(firstQuote + 1, lastQuote);
  const key = line.slice(1, firstQuote).trim();
  if (!key) return null;
  return { key, value };
}
function isHeaderLine(line) {
  return line.startsWith('[') && line.endsWith(']') && line.indexOf('"') > 0;
}

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '0-0', '*']);

// Build a structured header from the raw key/value map. Keys absent from the source are left
// undefined (toEqual ignores undefined), so a minimal PGN yields a minimal header.
function buildHeader(raw) {
  const g = raw.Game !== undefined ? raw.Game : raw.GameType;
  const nm = (v) => (v == null || v === '?' || v === '-' ? null : v);
  const rt = (v) => (v == null || v === '?' || v === '-' ? null : Number(v));

  const p1 = {};
  const p1name = raw['Player 1 Name'] !== undefined ? raw['Player 1 Name'] : raw.White;
  if (p1name !== undefined) p1.name = nm(p1name);
  const p1rat = raw['Player 1 Rating'] !== undefined ? raw['Player 1 Rating'] : raw.WhiteRating;
  if (p1rat !== undefined) p1.rating = rt(p1rat);
  if (raw['Player 1 Type'] !== undefined && raw['Player 1 Type'] !== '?') p1.type = raw['Player 1 Type'];

  const p2 = {};
  const p2name = raw['Player 2 Name'] !== undefined ? raw['Player 2 Name'] : raw.Black;
  if (p2name !== undefined) p2.name = nm(p2name);
  const p2rat = raw['Player 2 Rating'] !== undefined ? raw['Player 2 Rating'] : raw.BlackRating;
  if (p2rat !== undefined) p2.rating = rt(p2rat);
  if (raw['Player 2 Type'] !== undefined && raw['Player 2 Type'] !== '?') p2.type = raw['Player 2 Type'];

  const dash = (v) => (v === '-' ? null : v);
  const header = {
    game: g !== undefined ? getGameId(g) : undefined,
    site: raw.Site,
    event: raw.Event !== undefined ? dash(raw.Event) : undefined,
    round: raw.Round !== undefined ? dash(raw.Round) : undefined,
    section: raw.Section !== undefined ? dash(raw.Section) : undefined,
    date: raw.Date,
    time: raw.Time,
    timeControl: raw.TimeControl !== undefined ? parseTimeControl(raw.TimeControl) : undefined,
    // §4.3: Rated "Y" -> true, anything else -> false, MISSING -> true.
    rated: raw.Rated === undefined ? true : raw.Rated === 'Y',
    result: raw.Result !== undefined ? tokenToResult(raw.Result) : undefined,
    player1: p1,
    player2: p2,
  };
  return header;
}

// Parse a move-text region (array of {text, line}) into a flat cell list. Move-number tokens
// ("1.") and a trailing result token are skipped; an invalid coordinate throws PgnError.
function parseMoves(moveLines) {
  const out = [];
  for (const { text, line } of moveLines) {
    const tokens = text.split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (/^\d+\.+$/.test(tok)) continue; // move number "1." / "1..."
      if (RESULT_TOKENS.has(tok)) continue; // trailing result
      let cell;
      try {
        cell = alphaToCell(tok);
      } catch (e) {
        throw new PgnError({ line, message: `invalid move coordinate ${JSON.stringify(tok)}` });
      }
      out.push(cell);
    }
  }
  return out;
}

// parsePgn(text) -> [{header, moves, warnings}], one entry per game (multi-game files).
export function parsePgn(text) {
  const rawLines = text.split(/\r\n|\n|\r/);
  const games = [];
  let cur = null;
  const startGame = () => {
    cur = { raw: {}, moveLines: [], sawMoves: false };
    games.push(cur);
  };
  rawLines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmed = line.trim();
    if (isHeaderLine(trimmed)) {
      // A header after a game's moves begins the NEXT game.
      if (!cur || cur.sawMoves) startGame();
      const hp = parseHeaderLine(trimmed);
      if (hp && !(hp.key in cur.raw)) cur.raw[hp.key] = hp.value; // first occurrence wins
    } else if (trimmed === '') {
      // blank line — separator; ignored.
    } else {
      if (!cur) startGame();
      cur.sawMoves = true;
      cur.moveLines.push({ text: trimmed, line: lineNo });
    }
  });

  return games.map((gme) => ({
    header: buildHeader(gme.raw),
    moves: parseMoves(gme.moveLines),
    warnings: [],
  }));
}
