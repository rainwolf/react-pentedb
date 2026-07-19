// Characterization net for game_name across every real game id (1..30) before it is
// consolidated onto variantKey. Locks the three things that must survive: the per-variant
// base name, the "Speed" prefix on even ids, and the Go board-size sub-division.
import { describe, test, expect } from 'vitest';
import { game_name } from '../utils';
import { STANDARD_GAME_IDS } from '../../board/boardGeometry';

const EXPECTED = {
  1: 'Pente', 2: 'Speed Pente',
  3: 'Keryo-Pente', 4: 'Speed Keryo-Pente',
  5: 'Gomoku', 6: 'Speed Gomoku',
  7: 'D-Pente', 8: 'Speed D-Pente',
  9: 'G-Pente', 10: 'Speed G-Pente',
  11: 'Poof-Pente', 12: 'Speed Poof-Pente',
  13: 'Connect6', 14: 'Speed Connect6',
  15: 'Boat-Pente', 16: 'Speed Boat-Pente',
  17: 'DK-Pente', 18: 'Speed DK-Pente',
  19: 'Go', 20: 'Speed Go',
  21: 'Go (9x9)', 22: 'Speed Go (9x9)',
  23: 'Go (13x13)', 24: 'Speed Go (13x13)',
  25: 'O-Pente', 26: 'Speed O-Pente',
  27: 'Swap2-Pente', 28: 'Speed Swap2-Pente',
  29: 'Swap2-Keryo', 30: 'Speed Swap2-Keryo',
};

describe('game_name — every real game id', () => {
  test.each(Object.entries(EXPECTED))('game %s -> %s', (g, expected) => {
    expect(game_name(Number(g))).toBe(expected);
  });

  test('even ids are the "Speed" timing variant of the preceding odd id', () => {
    expect(game_name(2)).toBe('Speed ' + game_name(1));
    expect(game_name(20)).toBe('Speed ' + game_name(19));
  });

  test('Go is sub-divided by board size, unlike every other variant', () => {
    expect(game_name(19)).toBe('Go');
    expect(game_name(21)).toBe('Go (9x9)');
    expect(game_name(23)).toBe('Go (13x13)');
  });

  test('every selectable game and its Speed pair has a real name (no missing VARIANT_NAMES key)', () => {
    for (const id of STANDARD_GAME_IDS) {
      for (const g of [id, id + 1]) {
        const name = game_name(g);
        expect(typeof name).toBe('string');
        expect(name).not.toContain('undefined');
      }
    }
  });
});
