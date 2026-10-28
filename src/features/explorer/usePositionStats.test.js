// usePositionStats: RTK Query keeps the PREVIOUS arg's `data` while a new arg fetches. Across a
// game change that is another variant's heat -> must not be returned. Same-game moves keep it.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../app/api', () => ({ usePositionStatsQuery: vi.fn() }));
import { usePositionStatsQuery } from '../../app/api';
import usePositionStats from './usePositionStats';

const PENTE = { nextMoves: [{ move: 1 }] };
const GOMOKU = { nextMoves: [{ move: 2 }] };
beforeEach(() => usePositionStatsQuery.mockReset());

describe('usePositionStats', () => {
  test('settled result passes through (mock without currentData)', () => {
    usePositionStatsQuery.mockReturnValue({ data: PENTE, isFetching: false });
    const { result } = renderHook(() => usePositionStats({ game: 1, moves: [180] }));
    expect(result.current.data).toBe(PENTE);
  });

  test('game change while fetching hides the previous game data, then shows the new', () => {
    usePositionStatsQuery.mockReturnValue({ data: PENTE, currentData: PENTE, isFetching: false });
    const { result, rerender } = renderHook(({ g }) => usePositionStats({ game: g, moves: [] }), { initialProps: { g: 1 } });
    expect(result.current.data).toBe(PENTE);
    usePositionStatsQuery.mockReturnValue({ data: PENTE, currentData: undefined, isFetching: true });
    rerender({ g: 5 });
    expect(result.current.data).toBeUndefined();
    usePositionStatsQuery.mockReturnValue({ data: GOMOKU, currentData: GOMOKU, isFetching: false });
    rerender({ g: 5 });
    expect(result.current.data).toBe(GOMOKU);
  });

  test('same-game move while fetching clears the previous data (new query), then shows the new', () => {
    usePositionStatsQuery.mockReturnValue({ data: PENTE, currentData: PENTE, isFetching: false });
    const { result, rerender } = renderHook(({ m }) => usePositionStats({ game: 1, moves: m }), { initialProps: { m: [180] } });
    usePositionStatsQuery.mockReturnValue({ data: PENTE, currentData: undefined, isFetching: true });
    rerender({ m: [180, 181] });
    expect(result.current.data).toBeUndefined();
    usePositionStatsQuery.mockReturnValue({ data: GOMOKU, currentData: GOMOKU, isFetching: false });
    rerender({ m: [180, 181] });
    expect(result.current.data).toBe(GOMOKU);
  });

  test('an error never shows the previous result', () => {
    usePositionStatsQuery.mockReturnValue({ data: PENTE, currentData: undefined, isFetching: false, error: { status: 500 } });
    const { result } = renderHook(() => usePositionStats({ game: 1, moves: [180] }));
    expect(result.current.data).toBeUndefined();
  });
  test('a filter change while fetching hides the old filters\' data; scope change too', () => {
    const F = { player1Name: 'alice' };
    usePositionStatsQuery.mockReturnValue({ data: PENTE, currentData: PENTE, isFetching: false });
    const { result, rerender } = renderHook(
      ({ f, s }) => usePositionStats({ game: 1, moves: [180], scope: s, filters: f }),
      { initialProps: { f: null, s: 'archive' } }
    );
    usePositionStatsQuery.mockReturnValue({ data: PENTE, currentData: undefined, isFetching: true });
    rerender({ f: F, s: 'archive' });
    expect(result.current.data).toBeUndefined();
    usePositionStatsQuery.mockReturnValue({ data: GOMOKU, currentData: GOMOKU, isFetching: false });
    rerender({ f: F, s: 'archive' });
    expect(result.current.data).toBe(GOMOKU);
    usePositionStatsQuery.mockReturnValue({ data: GOMOKU, currentData: undefined, isFetching: true });
    rerender({ f: F, s: 'both' });
    expect(result.current.data).toBeUndefined();
  });
});
