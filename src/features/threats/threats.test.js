// Threat overlays (P4 Task 4, brief Step 1). Three concerns, all TDD-first:
//   - threatModel: the safety gate (AI-supported ∩ not-Connect6 ∩ strictly-alternating
//     opening) and the type→category map that decides which threats are ever drawn.
//   - ThreatBands: the board overlay — one translucent player-tinted band per shown threat
//     run, gain squares dotted, cells transformed canonical→display via symCell(rotation).
//     Toggle state (persisted in the ui slice) drives which bands render.
//   - ThreatsPanel: the per-player × {trias, fours, potential captures} toggle grid, and the
//     explanatory message when the variant/position is not capture-alternation-safe.
//
// The threats are produced by the REAL Task-3 engine on a real fixture position (a P1 open
// four + a P2 open tria), so the panel is tested against engine truth, not a mock. Assertions
// are engine-driven (count shown threats from the analysis) so they can't drift on a detail.
import { describe, test, expect, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, selectActivePosition } from '../../model/docSlice';
import { createTree, addMove } from '../../model/gameTree';
import uiReducer, {
  setThreatToggle,
  selectThreatToggles,
  setRotation,
} from '../../app/uiSlice';
import { analyzePosition } from '../../threats/threatEngine';
import { buildBoardGame } from '../viewer/boardGameFactory';
import { symCell } from '../viewer/boardSymmetry';
import { threatGate, categoryOf, shownThreats } from './threatModel';
import ThreatBands from './ThreatBands';
import ThreatsPanel from './ThreatsPanel';
import BoardPane from '../viewer/BoardPane';

const theme = createTheme();
const N = 19;

// Fixture: P1 open four on row 9 (cols 5-8), P2 open tria at col 2 (rows 2-4). Move list
// strictly alternates P1(even idx), P2(odd idx) — the only interleaving the engine accepts.
const FOUR_CELLS = [176, 177, 178, 179]; // (5,9)(6,9)(7,9)(8,9)
const TRIA_CELLS = [40, 59, 78]; // (2,2)(2,3)(2,4)
const FIXTURE = [176, 40, 177, 59, 178, 78, 179];

const ALL_ON = {
  1: { trias: true, fours: true, captures: true },
  2: { trias: true, fours: true, captures: true },
};

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

function makeStore({ moves = FIXTURE, game = 1, toggles = null, rotation = 0 } = {}) {
  const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
  const { tree, path } = treeFromLine(moves);
  store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game, tree, cursorPath: path }));
  if (rotation) store.dispatch(setRotation(rotation));
  if (toggles) {
    for (const p of [1, 2]) {
      for (const k of ['trias', 'fours', 'captures']) {
        store.dispatch(setThreatToggle({ player: p, kind: k, value: toggles[p][k] }));
      }
    }
  }
  return store;
}

function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
    </Provider>
  );
}

function analyzeFixture(moves = FIXTURE, game = 1) {
  return analyzePosition({ game: buildBoardGame(game, moves), moves, boardW: N, boardH: N });
}

function bandEls(container) {
  return Array.from(container.querySelectorAll('[data-testid^="threat-band-"]'));
}

afterEach(() => cleanup());

describe('threatModel', () => {
  test('categoryOf maps only trias / fours / potential-captures (others hidden)', () => {
    expect(categoryOf(5)).toBe('trias'); // TYPE_TRIA
    expect(categoryOf(6)).toBe('fours'); // TYPE_CLOSED_FOUR
    expect(categoryOf(7)).toBe('fours'); // TYPE_OPEN_FOUR
    expect(categoryOf(1)).toBe('captures'); // TYPE_POTENTIAL_CAPTURE
    expect(categoryOf(4)).toBeNull(); // TYPE_POTENTIAL_FOUR — not shown
    expect(categoryOf(0)).toBeNull(); // TYPE_BLOCKED — not shown
  });

  test('the fixture yields a real P1 four and a real P2 tria', () => {
    const r = analyzeFixture();
    expect(r.threats.some((t) => t.player === 1 && categoryOf(t.type) === 'fours')).toBe(true);
    expect(r.threats.some((t) => t.player === 2 && categoryOf(t.type) === 'trias')).toBe(true);
  });

  test('gate: pente (variant 1) with a plain alternating opening is safe', () => {
    expect(threatGate({ game: 1, moves: FIXTURE }).safe).toBe(true);
  });

  test('gate: an unsupported variant is unsafe with reason "variant"', () => {
    // 19 (Go) is not in the AI-supported set.
    const g = threatGate({ game: 19, moves: [180] });
    expect(g.safe).toBe(false);
    expect(g.reason).toBe('variant');
  });

  test('gate: Connect6 (13) is unsafe with reason "connect6"', () => {
    const g = threatGate({ game: 13, moves: [180, 200, 201] });
    expect(g.safe).toBe(false);
    expect(g.reason).toBe('connect6');
  });
});

describe('ThreatBands — toggle state drives which bands render', () => {
  test('all toggles on: one band per shown threat (engine-driven count)', () => {
    const store = makeStore({ toggles: ALL_ON });
    const { container } = renderWith(store, <ThreatBands rotation={0} />);
    const expected = shownThreats(analyzeFixture(), ALL_ON).length;
    expect(expected).toBeGreaterThan(0);
    expect(bandEls(container)).toHaveLength(expected);
  });

  test('only P1 fours enabled: fours render, trias do not', () => {
    const toggles = {
      1: { trias: false, fours: true, captures: false },
      2: { trias: false, fours: false, captures: false },
    };
    const store = makeStore({ toggles });
    const { container } = renderWith(store, <ThreatBands rotation={0} />);
    const bands = bandEls(container);
    expect(bands.length).toBe(shownThreats(analyzeFixture(), toggles).length);
    expect(bands.every((b) => b.getAttribute('data-testid').startsWith('threat-band-1-fours'))).toBe(true);
  });

  test('all toggles off: nothing renders', () => {
    const off = {
      1: { trias: false, fours: false, captures: false },
      2: { trias: false, fours: false, captures: false },
    };
    const store = makeStore({ toggles: off });
    const { container } = renderWith(store, <ThreatBands rotation={0} />);
    expect(bandEls(container)).toHaveLength(0);
  });

  test('unsafe variant: no bands even with toggles on', () => {
    const store = makeStore({ moves: [180, 200, 201], game: 13, toggles: ALL_ON });
    const { container } = renderWith(store, <ThreatBands rotation={0} />);
    expect(bandEls(container)).toHaveLength(0);
  });
});

describe('ThreatBands — rotation maps canonical→display via symCell', () => {
  test('each band data-cells === data-canonical mapped through the active rotation', () => {
    for (const rot of [0, 2, 5]) {
      const store = makeStore({ toggles: ALL_ON });
      const { container, unmount } = renderWith(store, <ThreatBands rotation={rot} />);
      const bands = bandEls(container);
      expect(bands.length).toBeGreaterThan(0);
      for (const b of bands) {
        const canonical = b.getAttribute('data-canonical').split(',').map(Number);
        const display = b.getAttribute('data-cells').split(',').map(Number);
        expect(display).toEqual(canonical.map((c) => symCell(c, rot, N)));
      }
      unmount();
    }
  });
});

describe('rotation lift — the shared board value drives every overlay', () => {
  test('rotating via BoardPane transforms the ThreatBands on the shared board', () => {
    const store = makeStore({ toggles: ALL_ON });
    const { container } = renderWith(store, <BoardPane />);

    // rotation 0: display === canonical
    let band = bandEls(container).find((b) => b.getAttribute('data-testid').startsWith('threat-band-1-fours'));
    expect(band).toBeTruthy();
    let canonical = band.getAttribute('data-canonical').split(',').map(Number);
    expect(band.getAttribute('data-cells').split(',').map(Number)).toEqual(canonical);

    // rotate once via the control -> rotation 1 in the ui slice
    fireEvent.click(screen.getByLabelText('Rotate board'));
    expect(store.getState().ui.rotation).toBe(1);

    band = bandEls(container).find((b) => b.getAttribute('data-testid').startsWith('threat-band-1-fours'));
    canonical = band.getAttribute('data-canonical').split(',').map(Number);
    expect(band.getAttribute('data-cells').split(',').map(Number)).toEqual(
      canonical.map((c) => symCell(c, 1, N))
    );
  });

  test('rotation persists in the ui slice and BoardPane reads it back', () => {
    const store = makeStore({ rotation: 3 });
    renderWith(store, <BoardPane />);
    // a reset control appears only when rotation !== 0 (BoardPane reads the shared value)
    expect(screen.getByLabelText('Reset board orientation')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Reset board orientation'));
    expect(store.getState().ui.rotation).toBe(0);
  });
});

describe('ThreatsPanel', () => {
  test('safe variant: renders per-player × category toggles that dispatch (flip)', () => {
    const store = makeStore();
    renderWith(store, <ThreatsPanel />);
    const input = screen.getByTestId('threat-toggle-1-trias'); // inputProps puts the id on the input
    // the checkbox reflects the persisted value...
    expect(input.checked).toBe(selectThreatToggles(store.getState())[1].trias);
    const before = selectThreatToggles(store.getState())[1].trias;
    // ...and clicking flips it in the ui slice.
    fireEvent.click(input);
    expect(selectThreatToggles(store.getState())[1].trias).toBe(!before);
  });

  test('unsafe variant: shows the explanatory message, no toggles', () => {
    const store = makeStore({ moves: [180, 200, 201], game: 13 });
    renderWith(store, <ThreatsPanel />);
    expect(screen.getByTestId('threats-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('threat-toggle-1-trias')).toBeNull();
  });

  test('no open document: prompts to open a game', () => {
    const store = configureStore({ reducer: { docs: docsReducer, ui: uiReducer } });
    renderWith(store, <ThreatsPanel />);
    expect(selectActivePosition(store.getState())).toBeNull();
    expect(screen.getByTestId('threats-empty')).toBeTruthy();
  });
});
