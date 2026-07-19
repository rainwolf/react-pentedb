import { describe, test, expect } from 'vitest';
import { exportGamePgn, parsePgn, PgnError } from '../pgn';
import * as gameFix from './__fixtures__/gamePgn';
import * as minFix from './__fixtures__/minimalPgn';

describe('exportGamePgn — byte-exact golden', () => {
  test('produces the gamePgn fixture byte-for-byte (header order + move pairs)', () => {
    expect(exportGamePgn(gameFix.header, gameFix.moves)).toBe(gameFix.pgn);
  });
});

describe('parsePgn — canonical + tolerant', () => {
  test('parses the full-header fixture back to header + moves', () => {
    const games = parsePgn(gameFix.pgn);
    expect(games).toHaveLength(1);
    const g = games[0];
    expect(g.moves).toEqual(gameFix.moves);
    expect(g.header.game).toBe(1);
    expect(g.header.site).toBe('pente.org');
    expect(g.header.event).toBe(null); // "-" -> null
    expect(g.header.round).toBe(null);
    expect(g.header.section).toBe(null);
    expect(g.header.date).toBe('07/18/2026');
    expect(g.header.time).toBe('14:30:00');
    expect(g.header.timeControl).toBe('5+10');
    expect(g.header.rated).toBe(true); // "Y"
    expect(g.header.player1).toEqual({ name: 'alice', rating: 1850, type: 'Human' });
    expect(g.header.player2).toEqual({ name: 'bob', rating: 1720, type: 'Human' });
    expect(g.header.result).toBe('player1'); // "1-0"
  });

  test('tolerant minimal PGN: Rated missing -> true, aliases, "?"/"-" -> null', () => {
    const games = parsePgn(minFix.pgn);
    expect(games).toHaveLength(1);
    const g = games[0];
    expect(g.moves).toEqual(minFix.expected.moves);
    expect(g.header.game).toBe(1);
    expect(g.header.player1.name).toBe('alice'); // via alias White
    expect(g.header.player2.name).toBe(null); // "?" -> null
    expect(g.header.result).toBe('draw'); // "1/2-1/2"
    expect(g.header.rated).toBe(true); // missing Rated -> true
  });
});

describe('parse(export(x)) === x — PGN round-trip', () => {
  test('the fixture header+moves survive an export/parse cycle', () => {
    const round = parsePgn(exportGamePgn(gameFix.header, gameFix.moves))[0];
    expect(round.moves).toEqual(gameFix.moves);
    expect(round.header.game).toBe(gameFix.header.game);
    expect(round.header.result).toBe('player1');
    expect(round.header.player1.name).toBe('alice');
    expect(round.header.timeControl).toBe('5+10');
  });
});

describe('parsePgn — multi-game files', () => {
  test('returns one entry per game', () => {
    const two = `${gameFix.pgn}\r\n\r\n${minFix.pgn}`;
    const games = parsePgn(two);
    expect(games).toHaveLength(2);
    expect(games[0].moves).toEqual(gameFix.moves);
    expect(games[1].moves).toEqual(minFix.expected.moves);
  });
});

describe('parsePgn — malformed move throws PgnError with a line number', () => {
  test('an invalid coordinate token reports its line', () => {
    let err;
    try {
      parsePgn('[Game "Pente"]\n\n1. K10 I5'); // I5 invalid (I column skipped)
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PgnError);
    expect(typeof err.line).toBe('number');
    expect(err.line).toBeGreaterThan(0);
  });
});
