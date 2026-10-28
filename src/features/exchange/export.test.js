// Export UI tests (P3 Task 5, brief Step 1):
//   - sanitizeFilename strips path separators/colons and collapses whitespace
//   - "SGF (analysis tree)" downloads a Blob whose content equals exportAnalysisSgf's output
//   - "SGF (game)" / "PGN" on a game tab use the header fetched via useGameQuery
//   - PGN always exports the MAINLINE ONLY, even when the tree has a branch and the cursor
//     sits earlier than the end of the mainline (spec §12)
//   - the download filename is `<name-or-players>-<date>.<ext>`, sanitized
//
// jsdom has no native URL.createObjectURL; it's stubbed below to capture the Blob passed in.
// HTMLAnchorElement.prototype.click is stubbed too (jsdom logs "not implemented: navigation"
// otherwise) and captures `this` so the download filename can be asserted.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab } from '../../model/docSlice';
import { createTree, addMove, mainline } from '../../model/gameTree';
import { exportAnalysisSgf, exportGameSgf } from '../../export/sgf';
import { exportGamePgn } from '../../export/pgn';

const apiMock = vi.hoisted(() => ({
  useGameQuery: vi.fn(() => ({ data: undefined, isLoading: true })),
}));
vi.mock('../../app/api', () => ({ useGameQuery: apiMock.useGameQuery, useCollectionGameQuery: () => ({ data: undefined }) }));

// eslint-disable-next-line import/first
import ExportMenu, { sanitizeFilename, exportFilename } from './ExportMenu';

const theme = createTheme();

function treeFromLine(moves) {
  let tree = createTree();
  let path = [];
  for (const m of moves) {
    const res = addMove(tree, path, m);
    tree = res.tree;
    path = res.path;
  }
  return { tree, path };
}

function makeStore(tab) {
  const store = configureStore({ reducer: { docs: docsReducer } });
  store.dispatch(openTab(tab));
  return store;
}

function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
    </Provider>
  );
}

let capturedBlob;
let capturedAnchor;

beforeEach(() => {
  capturedBlob = null;
  capturedAnchor = null;
  window.URL.createObjectURL = vi.fn((blob) => {
    capturedBlob = blob;
    return 'blob:mock-url';
  });
  window.URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn(function click() {
    capturedAnchor = this;
  });
  apiMock.useGameQuery.mockReset();
  apiMock.useGameQuery.mockReturnValue({ data: undefined, isLoading: true });
});

afterEach(() => {
  cleanup();
});

describe('sanitizeFilename', () => {
  test('replaces slashes and colons with a dash', () => {
    expect(sanitizeFilename('Alice/Bob: Game 1')).toBe('Alice-Bob-_Game_1');
  });

  test('collapses whitespace runs to a single underscore', () => {
    expect(sanitizeFilename('a   b')).toBe('a_b');
  });

  test('falls back to "export" for empty/blank/nullish input', () => {
    expect(sanitizeFilename('')).toBe('export');
    expect(sanitizeFilename('   ')).toBe('export');
    expect(sanitizeFilename(null)).toBe('export');
  });
});

describe('exportFilename', () => {
  test('joins the sanitized base and date with the extension', () => {
    expect(exportFilename('Alice vs Bob', '2026-01-05', 'sgf')).toBe(
      'Alice_vs_Bob-2026-01-05.sgf'
    );
  });
});

describe('ExportMenu — analysis tab', () => {
  test('"SGF (analysis tree)" downloads a Blob equal to exportAnalysisSgf output', async () => {
    const { tree } = treeFromLine([180, 200, 220]);
    const store = makeStore({
      id: 'a1',
      kind: 'analysis',
      title: 'My Analysis',
      game: 1,
      tree,
      cursorPath: [],
    });
    const tab = store.getState().docs.tabs[0];
    renderWith(store, <ExportMenu />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'SGF (analysis tree)' }));

    expect(capturedBlob).toBeTruthy();
    const text = await capturedBlob.text();
    expect(text).toBe(exportAnalysisSgf({ name: tab.title, game: tab.game, tree: tab.tree }));
    expect(capturedAnchor.download).toMatch(/^My_Analysis-\d{4}-\d{2}-\d{2}\.sgf$/);
  });

  test('"PGN" exports the mainline only — full mainline, ignoring both a side branch and an earlier cursor (spec §12)', async () => {
    const { tree: base } = treeFromLine([180, 200, 220]);
    const tree = addMove(base, [0], 205).tree; // 180's kids: [200 (mainline), 205 (branch)]
    const store = makeStore({
      id: 'a2',
      kind: 'analysis',
      title: 'Branchy',
      game: 1,
      tree,
      cursorPath: [0], // cursor sits at move 180, well before the end of the mainline
    });
    const tab = store.getState().docs.tabs[0];
    expect(mainline(tab.tree)).toEqual([180, 200, 220]); // sanity: branch didn't alter mainline
    renderWith(store, <ExportMenu />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'PGN' }));

    const text = await capturedBlob.text();
    // Equal to the codec's own output for the full mainline — NOT lineTo(tree, cursorPath)
    // (which would stop at 180) and NOT anything derived from the 205 branch.
    expect(text).toBe(exportGamePgn({ game: tab.game }, [180, 200, 220]));
  });

  test('filename sanitizes slashes, colons, and spaces in the tab title', () => {
    const store = makeStore({
      id: 'a3',
      kind: 'analysis',
      title: 'Round 1/2: Final Game',
      game: 1,
      tree: createTree(),
      cursorPath: [],
    });
    renderWith(store, <ExportMenu />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'SGF (analysis tree)' }));

    expect(capturedAnchor.download).not.toMatch(/[/\\: ]/);
    expect(capturedAnchor.download.startsWith('Round_1-2-_Final_Game-')).toBe(true);
  });
});

describe('ExportMenu — game tab', () => {
  const header = {
    game: 1,
    site: 'pente.org',
    event: 'Ladder',
    round: '3',
    section: null,
    date: '2025-06-01',
    player1: { name: 'Alice', rating: 1900 },
    player2: { name: 'Bob', rating: 1850 },
    result: 'player1',
    rated: true,
    timeControl: '1d',
  };

  function gameStore() {
    const { tree } = treeFromLine([180, 200, 220]);
    return makeStore({
      id: 'g:1',
      kind: 'game',
      title: 'Alice vs Bob',
      game: 1,
      gid: 1,
      tree,
      cursorPath: [],
    });
  }

  test('"SGF (game)" downloads a Blob equal to exportGameSgf output using the fetched header', async () => {
    apiMock.useGameQuery.mockReturnValue({ data: { header, moves: [180, 200, 220] }, isLoading: false });
    const store = gameStore();
    const tab = store.getState().docs.tabs[0];
    renderWith(store, <ExportMenu />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'SGF (game)' }));

    const text = await capturedBlob.text();
    expect(text).toBe(exportGameSgf(header, mainline(tab.tree)));
    expect(capturedAnchor.download).toMatch(/^Alice_vs_Bob-2025-06-01\.sgf$/);
  });

  test('"PGN" on a game tab uses the fetched header and the mainline moves', async () => {
    apiMock.useGameQuery.mockReturnValue({ data: { header, moves: [180, 200, 220] }, isLoading: false });
    const store = gameStore();
    const tab = store.getState().docs.tabs[0];
    renderWith(store, <ExportMenu />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'PGN' }));

    const text = await capturedBlob.text();
    expect(text).toBe(exportGamePgn(header, mainline(tab.tree)));
  });

  test('"SGF (game)" and "PGN" are disabled until the header has loaded', () => {
    apiMock.useGameQuery.mockReturnValue({ data: undefined, isLoading: true });
    const store = gameStore();
    renderWith(store, <ExportMenu />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('menuitem', { name: 'SGF (game)' }).getAttribute('aria-disabled')).toBe(
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'PGN' }).getAttribute('aria-disabled')).toBe('true');
    // the branch-preserving format needs no server round trip, so it stays enabled
    expect(
      screen.getByRole('menuitem', { name: 'SGF (analysis tree)' }).getAttribute('aria-disabled')
    ).not.toBe('true');
  });
});

describe('ExportMenu — no active tab', () => {
  test('renders nothing', () => {
    const store = configureStore({ reducer: { docs: docsReducer } });
    renderWith(store, <ExportMenu />);
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });
});
