// The per-variant venue invariant lives in the store: site/event/round/section are dropped from
// the applied filters whenever the active tab's game changes, with NO FilterForm mounted.
import { describe, test, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import docsReducer, { openTab, activateTab, switchToVariant } from '../model/docSlice';
import uiReducer, { setFilters, selectFilters } from './uiSlice';
import { venueGuard } from './venueGuard';

const F = (o) => ({
  player1Name: null, player1Seat: 1, player2Name: null, player2Seat: 2,
  site: null, event: null, round: null, section: null,
  afterDate: null, beforeDate: null, winner: 0, ...o,
});

function mk() {
  return configureStore({
    reducer: { docs: docsReducer, ui: uiReducer },
    middleware: (g) => g().concat(venueGuard),
  });
}

describe('venueGuard', () => {
  test('tab switch to another variant strips venue fields, keeps the rest', () => {
    const s = mk();
    s.dispatch(openTab({ id: 'a', kind: 'scratch', title: 'A', game: 1 }));
    s.dispatch(openTab({ id: 'b', kind: 'scratch', title: 'B', game: 2 }));
    s.dispatch(activateTab('a'));
    s.dispatch(setFilters(F({ site: 'PlayOK', event: 'Open', round: '3', player1Name: 'bob' })));
    expect(selectFilters(s.getState()).site).toBe('PlayOK');
    s.dispatch(activateTab('b'));
    const f = selectFilters(s.getState());
    expect(f).toMatchObject({ site: null, event: null, round: null, section: null, player1Name: 'bob' });
  });

  test('stripping the only active field collapses filters to null', () => {
    const s = mk();
    s.dispatch(openTab({ id: 'a', kind: 'scratch', title: 'A', game: 1 }));
    s.dispatch(openTab({ id: 'b', kind: 'scratch', title: 'B', game: 2 }));
    s.dispatch(activateTab('a'));
    s.dispatch(setFilters(F({ site: 'PlayOK' })));
    s.dispatch(activateTab('b'));
    expect(selectFilters(s.getState())).toBeNull();
  });

  test('same-game tab switch keeps venue fields', () => {
    const s = mk();
    s.dispatch(openTab({ id: 'a', kind: 'scratch', title: 'A', game: 1 }));
    s.dispatch(openTab({ id: 'c', kind: 'scratch', title: 'C', game: 1 }));
    s.dispatch(setFilters(F({ site: 'PlayOK' })));
    s.dispatch(activateTab('a'));
    expect(selectFilters(s.getState()).site).toBe('PlayOK');
  });

  test('switchToVariant (retargets / opens a tab) strips too', () => {
    const s = mk();
    s.dispatch(openTab({ id: 'a', kind: 'scratch', title: 'A', game: 1 }));
    s.dispatch(setFilters(F({ event: 'X', winner: 1 })));
    s.dispatch(switchToVariant(3));
    expect(selectFilters(s.getState())).toMatchObject({ event: null, winner: 1 });
  });
});
