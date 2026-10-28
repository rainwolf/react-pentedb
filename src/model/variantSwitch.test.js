// switchToVariant(game): picking a search Variant moves the workbench onto a scratch tab for
// that game — reuse an untouched scratch tab of that game, else retarget an untouched ACTIVE
// scratch tab, else open a new one. Tabs with moves / loaded games / analyses are never mutated.
import { describe, test, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import reducer, { openTab, applyMove, switchToVariant, isUntouchedScratch } from './docSlice';
import { centerCell } from '../board/boardGeometry';
import { buildTreeFromMoves } from '../shell/gameTab';

const mk = () => configureStore({ reducer: { docs: reducer } });
const tabs = (s) => s.getState().docs.tabs;
const active = (s) => tabs(s).find((t) => t.id === s.getState().docs.activeTabId);

describe('switchToVariant', () => {
  test('active untouched scratch tab is retargeted to the new game, with its forced opening', () => {
    const s = mk();
    s.dispatch(openTab({ kind: 'scratch', title: 'New position', game: 1 }));
    s.dispatch(switchToVariant(5));
    expect(tabs(s)).toHaveLength(1);
    const t = active(s);
    expect(t.game).toBe(5);
    expect(t.tree.root.kids.map((k) => k.m)).toEqual([centerCell(5)]);
    expect(t.cursorPath).toEqual([0]);
    expect(t.dirty).toBe(false);
  });

  test('Go retarget starts empty (free first move)', () => {
    const s = mk();
    s.dispatch(openTab({ kind: 'scratch', game: 1 }));
    s.dispatch(switchToVariant(27));
    expect(active(s).game).toBe(27);
    expect(active(s).tree.root.kids).toEqual([]);
  });

  test('retargeted tab gets a fresh id so a later /p/1/180 route cannot match the old key', () => {
    const s = mk();
    s.dispatch(openTab({ id: 'p:1:180', kind: 'scratch', game: 1, tree: buildTreeFromMoves([180]).tree }));
    s.dispatch(switchToVariant(5));
    expect(tabs(s).map((t) => t.id)).not.toContain('p:1:180');
    expect(s.getState().docs.activeTabId).toBe(active(s).id);
  });

  test('tab with user moves is never mutated; a new scratch tab opens', () => {
    const s = mk();
    s.dispatch(openTab({ kind: 'scratch', game: 1 }));
    s.dispatch(applyMove(181));
    const before = JSON.stringify(active(s));
    const id = active(s).id;
    s.dispatch(switchToVariant(5));
    expect(tabs(s)).toHaveLength(2);
    expect(JSON.stringify(tabs(s).find((t) => t.id === id))).toBe(before);
    expect(active(s).game).toBe(5);
    expect(active(s).id).not.toBe(id);
  });

  test('loaded game / analysis tabs are never mutated', () => {
    const s = mk();
    s.dispatch(openTab({ id: 'g:9', kind: 'game', gid: 9, game: 1, tree: buildTreeFromMoves([180]).tree }));
    s.dispatch(switchToVariant(5));
    expect(tabs(s).find((t) => t.id === 'g:9').game).toBe(1);
    expect(tabs(s)).toHaveLength(2);
    s.dispatch(openTab({ id: 'a:3', kind: 'analysis', aid: 3, game: 1 }));
    s.dispatch(switchToVariant(6));
    expect(tabs(s).find((t) => t.id === 'a:3').game).toBe(1);
    expect(active(s).game).toBe(6);
  });

  test('reuses an existing untouched scratch tab of that game instead of opening another', () => {
    const s = mk();
    s.dispatch(openTab({ kind: 'scratch', game: 1 }));
    s.dispatch(applyMove(181)); // pente tab now touched
    s.dispatch(switchToVariant(5)); // opens gomoku tab (active)
    s.dispatch(openTab({ id: 'g:9', kind: 'game', gid: 9, game: 1 }));
    const n = tabs(s).length;
    s.dispatch(switchToVariant(5));
    expect(tabs(s)).toHaveLength(n);
    expect(active(s).game).toBe(5);
    expect(active(s).kind).toBe('scratch');
  });

  test('same game as the active untouched tab is a no-op', () => {
    const s = mk();
    s.dispatch(openTab({ kind: 'scratch', game: 1 }));
    const id = active(s).id;
    s.dispatch(switchToVariant(1));
    expect(tabs(s)).toHaveLength(1);
    expect(active(s).id).toBe(id);
  });

  test('isUntouchedScratch', () => {
    const s = mk();
    s.dispatch(openTab({ kind: 'scratch', game: 1 }));
    expect(isUntouchedScratch(active(s))).toBe(true);
    s.dispatch(applyMove(181));
    expect(isUntouchedScratch(active(s))).toBe(false);
  });
});
