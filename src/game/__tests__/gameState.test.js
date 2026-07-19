import { describe, test, expect } from 'vitest';
import { GameState, freshRenjuTracking } from '../gameState';

describe('freshRenjuTracking — initial Renju opening tracking record', () => {
  test('defaults: no decisions made, opening not complete', () => {
    expect(freshRenjuTracking()).toEqual({
      complete: false, awaitingSwap: false, branchChosen: false,
      tenOffer: false, offered: [], selected: null, swapTaken: false,
    });
  });
  test('returns a fresh object each call (no shared mutable state)', () => {
    const a = freshRenjuTracking();
    a.offered.push(1);
    expect(freshRenjuTracking().offered).toEqual([]);
  });
});
