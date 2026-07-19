import { describe, test, expect } from 'vitest';
import {
  renjuOpeningUiReducer, renjuBeginPlace, renjuBeginOffer, renjuTogglePick, renjuMarkPending, renjuResetOpeningUi,
} from '../renjuOpeningUi';

const init = () => renjuOpeningUiReducer(undefined, { type: '@@INIT' });

describe('renjuOpeningUi slice', () => {
  test('initial state is idle with no picks', () => {
    expect(init()).toEqual({ mode: 'idle', picks: [] });
  });
  test('beginPlace -> placing; beginOffer -> offering (picks reset)', () => {
    expect(renjuOpeningUiReducer(init(), renjuBeginPlace())).toEqual({ mode: 'placing', picks: [] });
    expect(renjuOpeningUiReducer({ mode: 'idle', picks: [9] }, renjuBeginOffer())).toEqual({ mode: 'offering', picks: [] });
  });
  test('togglePick adds then removes (only in offering mode)', () => {
    let s = renjuOpeningUiReducer(init(), renjuBeginOffer());
    s = renjuOpeningUiReducer(s, renjuTogglePick(40));
    expect(s.picks).toEqual([40]);
    s = renjuOpeningUiReducer(s, renjuTogglePick(40));
    expect(s.picks).toEqual([]);
  });
  test('reset -> idle/empty', () => {
    expect(renjuOpeningUiReducer({ mode: 'offering', picks: [1, 2] }, renjuResetOpeningUi())).toEqual({ mode: 'idle', picks: [] });
  });
  test('unrelated action returns the SAME reference (no-op, matches modals slice)', () => {
    const s = init();
    expect(renjuOpeningUiReducer(s, { type: 'SOMETHING_ELSE' })).toBe(s);
  });
  test('table exit / boot resets to idle (stale picks must not leak into the next game)', () => {
    expect(renjuOpeningUiReducer({ mode: 'offering', picks: [1, 2, 3] }, { type: 'dsgExitTableEvent' }))
      .toEqual({ mode: 'idle', picks: [] });
    expect(renjuOpeningUiReducer({ mode: 'placing', picks: [] }, { type: 'dsgBootTableEvent' }))
      .toEqual({ mode: 'idle', picks: [] });
  });
  test('markPending -> pending; any phase-advancing server echo resets it to idle', () => {
    const pending = renjuOpeningUiReducer(init(), renjuMarkPending());
    expect(pending).toEqual({ mode: 'pending', picks: [] });
    // the server echo (a move) is what returns the UI to idle — not the click
    expect(renjuOpeningUiReducer(pending, { type: 'dsgMoveTableEvent' })).toEqual({ mode: 'idle', picks: [] });
    // a swap / select echo clears any transient mode too
    expect(renjuOpeningUiReducer({ mode: 'offering', picks: [1, 2] }, { type: 'dsgRenjuTaraguchi10Select1TableEvent' }))
      .toEqual({ mode: 'idle', picks: [] });
  });
  test('game/table reset clears a stale mid-opening mode (no leak into the next game)', () => {
    expect(renjuOpeningUiReducer({ mode: 'placing', picks: [] }, { type: 'dsgGameStateTableEvent' }))
      .toEqual({ mode: 'idle', picks: [] });
    expect(renjuOpeningUiReducer({ mode: 'offering', picks: [40, 41] }, { type: 'dsgChangeStateTableEvent' }))
      .toEqual({ mode: 'idle', picks: [] });
  });
  test('a rejected decision (move-error echo) unlocks pending', () => {
    const pending = renjuOpeningUiReducer(init(), renjuMarkPending());
    expect(renjuOpeningUiReducer(pending, { type: 'dsgMoveTableErrorEvent' })).toEqual({ mode: 'idle', picks: [] });
  });
});
