// Saved-analyses persistence tests (P3 Task 3, brief Step 1).
//
// Covers the whole save lifecycle without a live backend:
//   - docSlice.markSaved re-keys a scratch tab to `a:<aid>` on its first server save
//     (POST) and becomes a no-op re-key on later saves (PUT), clearing dirty each time;
//   - the localStorage recovery module round-trips a tab's tree by structure;
//   - SaveDialog is presentational (name field + read-only variant);
//   - AnalysesList lists / navigates / deletes (with a confirm) against mocked hooks;
//   - the Workbench save flow: anonymous Save writes recovery + prompts login, logged-in
//     Save POSTs then re-keys the tab so a second Save PUTs, and /a/:aid loads a tab.
//
// The api module is fully mocked (no real network), mirroring Workbench.test.js. Auth is
// read through usePingQuery (UserMenu's own precedent), so the stub controls auth state.
import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, applyMove, markSaved } from '../../model/docSlice';
import { createTree, addMove, mainline, toWire } from '../../model/gameTree';
import { RECOVERY_PREFIX, writeRecovery, clearRecovery, readAllRecovery } from './recovery';
import SaveDialog, { LoginPromptDialog } from './SaveDialog';
import AnalysesList from './AnalysesList';
import { ThemeModeProvider } from '../../shell/theme';
import AppRoutes from '../../app/router';

vi.mock('../../board/Board', () => ({ default: () => <div data-testid="board-stub" /> }));

vi.mock('../../app/api', () => ({
  usePingQuery: vi.fn(() => ({ data: { ok: true, auth: null }, refetch: vi.fn() })),
  useGameQuery: vi.fn(() => ({ data: undefined })),
  useAnalysisQuery: vi.fn(() => ({ data: undefined })),
  useAnalysesQuery: vi.fn(() => ({ data: { analyses: [] }, isLoading: false, isError: false })),
  useSaveAnalysisMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    { isLoading: false },
  ]),
  useDeleteAnalysisMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({ ok: true }) })),
    { isLoading: false },
  ]),
  useGamesSearchQuery: vi.fn(() => ({ data: { total: 0, games: [] }, isFetching: false })),
  useVenuesQuery: vi.fn(() => ({ data: { variants: [] }, isLoading: false })),
  usePlayersQuery: vi.fn(() => ({ data: { players: [] }, isFetching: false })),
  usePositionStatsQuery: vi.fn(() => ({ data: undefined, isFetching: false })),
}));

// eslint-disable-next-line import/first
import {
  usePingQuery,
  useAnalysisQuery,
  useAnalysesQuery,
  useSaveAnalysisMutation,
  useDeleteAnalysisMutation,
} from '../../app/api';

// jsdom under this vitest config ships without a Storage implementation; recovery is a
// real browser feature, so install a minimal Map-backed localStorage for the test env.
// (The app code itself guards for a missing Storage, so production/other tests are fine.)
(function installLocalStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return;
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i) => (Array.from(map.keys())[i] ?? null),
    get length() { return map.size; },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
})();

const theme = createTheme();
const reducer = (s, a) => docsReducer(s, a);
const init = () => docsReducer(undefined, { type: '@@INIT' });
const active = (s) => s.tabs.find((t) => t.id === s.activeTabId);

function treeWith(moves) {
  let tree = createTree();
  let path = [];
  for (const m of moves) ({ tree, path } = addMove(tree, path, m));
  return tree;
}

function makeStore() {
  return configureStore({ reducer: { docs: docsReducer } });
}

function renderAt(url, store) {
  return render(
    <Provider store={store}>
      <ThemeModeProvider>
        <ThemeProvider theme={theme}>
          <MemoryRouter initialEntries={[url]}>
            <AppRoutes />
          </MemoryRouter>
        </ThemeProvider>
      </ThemeModeProvider>
    </Provider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  usePingQuery.mockReturnValue({ data: { ok: true, auth: null }, refetch: vi.fn() });
  useAnalysisQuery.mockReturnValue({ data: undefined });
  useAnalysesQuery.mockReturnValue({ data: { analyses: [] }, isLoading: false, isError: false });
  useSaveAnalysisMutation.mockReturnValue([
    vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    { isLoading: false },
  ]);
  useDeleteAnalysisMutation.mockReturnValue([
    vi.fn(() => ({ unwrap: () => Promise.resolve({ ok: true }) })),
    { isLoading: false },
  ]);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('docSlice markSaved — save lifecycle', () => {
  test('first save re-keys a scratch tab to a:<aid> as an analysis and clears dirty', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'tab1', kind: 'scratch', title: 'New', game: 1 }));
    s = reducer(s, applyMove(112));
    expect(active(s).dirty).toBe(true);
    s = reducer(s, markSaved({ aid: 42, name: 'My line' }));
    const t = active(s);
    expect(t.id).toBe('a:42');
    expect(t.aid).toBe(42);
    expect(t.kind).toBe('analysis');
    expect(t.title).toBe('My line');
    expect(t.dirty).toBe(false);
    expect(s.activeTabId).toBe('a:42');
  });

  test('a later save keeps the a:<aid> id and just clears dirty (PUT path)', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'a:42', kind: 'analysis', title: 'My line', game: 1, aid: 42, tree: treeWith([112]) }));
    s = reducer(s, applyMove(113));
    expect(active(s).dirty).toBe(true);
    s = reducer(s, markSaved({ aid: 42, name: 'My line' }));
    const t = active(s);
    expect(t.id).toBe('a:42');
    expect(t.aid).toBe(42);
    expect(t.dirty).toBe(false);
  });

  test('markSaved() with no payload still clears dirty (back-compat)', () => {
    let s = init();
    s = reducer(s, openTab({ id: 'g', kind: 'game', title: 'G', game: 1 }));
    s = reducer(s, applyMove(180));
    s = reducer(s, markSaved());
    expect(active(s).dirty).toBe(false);
  });
});

describe('recovery (localStorage)', () => {
  test('writeRecovery persists a tab and readAllRecovery round-trips the tree', () => {
    writeRecovery({ id: 'tab1', title: 'X', game: 1, aid: null, tree: treeWith([180, 199, 210]) });
    const all = readAllRecovery();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('tab1');
    expect(all[0].name).toBe('X');
    expect(all[0].game).toBe(1);
    // wire form persisted; round-trips by structure
    expect(all[0].tree.v).toBe(1);
    expect(window.localStorage.getItem(RECOVERY_PREFIX + 'tab1')).toBeTruthy();
    clearRecovery('tab1');
    expect(readAllRecovery()).toHaveLength(0);
  });
});

describe('SaveDialog', () => {
  test('shows the variant read-only and saves the typed (trimmed) name', () => {
    const onSave = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SaveDialog open name="Seed" variant="pente" saving={false} onCancel={() => {}} onSave={onSave} />
      </ThemeProvider>
    );
    expect(screen.getByText('pente')).toBeTruthy();
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: '  Edited  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('Edited');
  });

  test('Save is disabled when the name is empty', () => {
    render(
      <ThemeProvider theme={theme}>
        <SaveDialog open name="" variant="pente" saving={false} onCancel={() => {}} onSave={() => {}} />
      </ThemeProvider>
    );
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
  });

  test('LoginPromptDialog surfaces a login affordance', () => {
    render(
      <ThemeProvider theme={theme}>
        <LoginPromptDialog open onCancel={() => {}} />
      </ThemeProvider>
    );
    expect(screen.getByText(/log in to save/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /log in/i })).toBeTruthy();
  });
});

describe('AnalysesList', () => {
  function renderList(store) {
    return render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <AnalysesList />
        </ThemeProvider>
      </Provider>
    );
  }

  test('anonymous users get a login hint instead of a list', () => {
    usePingQuery.mockReturnValue({ data: { ok: true, auth: null }, refetch: vi.fn() });
    renderList(makeStore());
    expect(screen.getByText(/log in/i)).toBeTruthy();
  });

  test('lists saved analyses and opens the tab (fromWire) on row click', async () => {
    usePingQuery.mockReturnValue({ data: { ok: true, auth: 'iostest' }, refetch: vi.fn() });
    useAnalysesQuery.mockReturnValue({
      data: { analyses: [{ aid: 7, name: 'Opening trap', game: 1, updated: 0 }] },
      isLoading: false,
      isError: false,
    });
    useAnalysisQuery.mockReturnValue({
      data: { aid: 7, name: 'Opening trap', game: 1, tree: toWire(treeWith([180, 199])) },
    });
    const store = makeStore();
    renderList(store);
    fireEvent.click(screen.getByText('Opening trap'));
    await waitFor(() => expect(store.getState().docs.tabs.some((t) => t.id === 'a:7')).toBe(true));
    const t = store.getState().docs.tabs.find((t) => t.id === 'a:7');
    expect(t.kind).toBe('analysis');
    expect(mainline(t.tree)).toEqual([180, 199]);
  });

  test('delete asks to confirm, then calls the delete mutation with the aid', async () => {
    usePingQuery.mockReturnValue({ data: { ok: true, auth: 'iostest' }, refetch: vi.fn() });
    useAnalysesQuery.mockReturnValue({
      data: { analyses: [{ aid: 7, name: 'Opening trap', game: 1, updated: 0 }] },
      isLoading: false,
      isError: false,
    });
    const del = vi.fn(() => ({ unwrap: () => Promise.resolve({ ok: true }) }));
    useDeleteAnalysisMutation.mockReturnValue([del, { isLoading: false }]);
    renderList(makeStore());
    fireEvent.click(screen.getByRole('button', { name: /delete opening trap/i }));
    // confirmation appears; the mutation only fires after confirming
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith(7));
  });
});

describe('Workbench save flow', () => {
  test('/a/:aid loads the analysis into a tab (fromWire)', async () => {
    useAnalysisQuery.mockReturnValue({
      data: { aid: 7, name: 'Saved', game: 1, tree: toWire(treeWith([180, 199])) },
    });
    const store = makeStore();
    renderAt('/a/7', store);
    await waitFor(() => expect(store.getState().docs.tabs.some((t) => t.aid === 7)).toBe(true));
    const t = store.getState().docs.tabs.find((t) => t.aid === 7);
    expect(t.kind).toBe('analysis');
    expect(mainline(t.tree)).toEqual([180, 199]);
  });

  test('anonymous Save writes recovery and prompts login (no mutation)', async () => {
    usePingQuery.mockReturnValue({ data: { ok: true, auth: null }, refetch: vi.fn() });
    const saveTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
    useSaveAnalysisMutation.mockReturnValue([saveTrigger, { isLoading: false }]);
    const store = makeStore();
    renderAt('/', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    store.dispatch(applyMove(112));
    fireEvent.click(screen.getByRole('button', { name: 'Save analysis' }));
    expect(readAllRecovery().length).toBeGreaterThan(0);
    expect(screen.getByText(/log in to save/i)).toBeTruthy();
    expect(saveTrigger).not.toHaveBeenCalled();
  });

  test('logged-in Save POSTs then re-keys the tab; a second Save PUTs', async () => {
    usePingQuery.mockReturnValue({ data: { ok: true, auth: 'iostest' }, refetch: vi.fn() });
    const saveTrigger = vi.fn((arg) => ({
      unwrap: () => Promise.resolve(arg.aid == null ? { aid: 42 } : { ok: true }),
    }));
    useSaveAnalysisMutation.mockReturnValue([saveTrigger, { isLoading: false }]);
    const store = makeStore();
    renderAt('/', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    store.dispatch(applyMove(112));

    fireEvent.click(screen.getByRole('button', { name: 'Save analysis' }));
    const input = await screen.findByLabelText('Name');
    fireEvent.change(input, { target: { value: 'My opening' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveTrigger).toHaveBeenCalledTimes(1));
    const arg1 = saveTrigger.mock.calls[0][0];
    expect(arg1.aid == null).toBe(true);
    expect(arg1.name).toBe('My opening');
    expect(arg1.game).toBe(1);
    expect(arg1.tree.v).toBe(1);
    await waitFor(() => expect(store.getState().docs.tabs.some((t) => t.id === 'a:42')).toBe(true));
    // Wait for the (async) dialog close to flush before re-querying the background toolbar —
    // an open MUI Dialog aria-hides the rest of the app, so the Save button is unreachable.
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());

    // Second save now carries the aid -> PUT.
    store.dispatch(applyMove(113));
    fireEvent.click(screen.getByRole('button', { name: 'Save analysis' }));
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveTrigger).toHaveBeenCalledTimes(2));
    expect(saveTrigger.mock.calls[1][0].aid).toBe(42);
  });

  test('beforeunload snapshots dirty tabs to recovery (logged in or not)', async () => {
    usePingQuery.mockReturnValue({ data: { ok: true, auth: 'iostest' }, refetch: vi.fn() });
    const store = makeStore();
    renderAt('/', store);
    await waitFor(() => expect(store.getState().docs.tabs).toHaveLength(1));
    store.dispatch(applyMove(112));
    fireEvent(window, new Event('beforeunload'));
    expect(readAllRecovery().length).toBeGreaterThan(0);
  });

  test('recovery from a previous visit is offered for restore on mount', async () => {
    writeRecovery({ id: 'tab-old', title: 'Yesterday', game: 1, aid: null, tree: treeWith([180]) });
    const store = makeStore();
    renderAt('/', store);
    expect(await screen.findByText(/restore unsaved work/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(store.getState().docs.tabs.some((t) => t.id === 'tab-old')).toBe(true));
    expect(readAllRecovery()).toHaveLength(0);
  });
});

describe('recovery restore dedup (no duplicate tabs)', () => {
  test('id collision with the default scratch tab yields ONE tab holding the recovered tree', async () => {
    // The default '/' scratch tab is auto-id 'tab1'; a recovery snapshot from a previous
    // session shares that id. Restore must REPLACE, not push a second 'tab1'.
    writeRecovery({ id: 'tab1', title: 'Recovered', game: 1, aid: null, tree: treeWith([180, 199]) });
    const store = makeStore();
    renderAt('/', store);
    await waitFor(() => expect(store.getState().docs.tabs.some((t) => t.id === 'tab1')).toBe(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => {
      const t1 = store.getState().docs.tabs.filter((t) => t.id === 'tab1');
      expect(t1).toHaveLength(1);
      expect(mainline(t1[0].tree)).toEqual([180, 199]);
    });
    expect(store.getState().docs.tabs).toHaveLength(1);
    expect(store.getState().docs.activeTabId).toBe('tab1');
    expect(readAllRecovery()).toHaveLength(0);
  });

  test('id collision with a dirty /a/:aid tab yields ONE tab with the recovered tree', async () => {
    // Reloading at /a/42 loads the SAVED tree; the recovery holds the dirtier unsaved line.
    useAnalysisQuery.mockReturnValue({ data: { aid: 42, name: 'Saved', game: 1, tree: toWire(treeWith([180])) } });
    writeRecovery({ id: 'a:42', title: 'Saved', game: 1, aid: 42, tree: treeWith([180, 199, 210]) });
    const store = makeStore();
    renderAt('/a/42', store);
    await waitFor(() => expect(store.getState().docs.tabs.some((t) => t.id === 'a:42')).toBe(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => {
      const t = store.getState().docs.tabs.filter((t) => t.id === 'a:42');
      expect(t).toHaveLength(1);
      expect(mainline(t[0].tree)).toEqual([180, 199, 210]);
    });
    expect(store.getState().docs.tabs.filter((t) => t.id === 'a:42')).toHaveLength(1);
    expect(readAllRecovery()).toHaveLength(0);
  });
});
