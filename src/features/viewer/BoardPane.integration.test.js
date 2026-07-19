// Integration test: BoardPane wired to the REAL <Board> (NOT the stub used by viewer.test.js).
// This exercises the actual click->onMove contract the stub could not: the real BoardSquare
// hands BoardPane `e.target.id` — a STRING flat-index with its quotes stripped — so the
// rotation inverse-map must survive that. Regression guard for the Phase-2 live defect where a
// click on a rotated board stored the raw display index (string) as if it were canonical.
import { describe, test, expect, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, fireEvent, act, cleanup, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, selectActivePosition } from '../../model/docSlice';
import { createTree, addMove } from '../../model/gameTree';
import { invSymCell } from './boardSymmetry';
import BoardPane from './BoardPane';

const theme = createTheme();
const N = 19;

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

function makeStore(moves, cursorPath, game = 1) {
  const store = configureStore({ reducer: { docs: docsReducer } });
  const { tree } = treeFromLine(moves);
  store.dispatch(openTab({ id: 't', kind: 'scratch', title: 'T', game, tree, cursorPath }));
  return store;
}

function renderWith(store, node) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>{node}</ThemeProvider>
    </Provider>
  );
}

// The real BoardSquare renders each cell's hit-rect with id=`"<flatIndex>"` (literal quotes).
function rectFor(container, displayCell) {
  return [...container.querySelectorAll('rect[id]')].find((r) => r.id === `"${displayCell}"`);
}

afterEach(() => cleanup());

describe('BoardPane + real Board — rotation-aware move input', () => {
  test('a click on the rotated board stores the CANONICAL cell and paints the stone under the cursor', () => {
    const store = makeStore([180], [0]); // one centre stone; the centre is rotation-invariant
    const { container } = renderWith(store, <BoardPane />);

    fireEvent.click(screen.getByLabelText('Rotate board')); // rotation -> 1 (non-identity)

    const displayCell = 200; // an empty interior cell on the rotated view
    const expectedCanonical = invSymCell(displayCell, 1, N); // 198
    expect(expectedCanonical).not.toBe(displayCell); // the transform must actually move it

    const target = rectFor(container, displayCell);
    expect(target).toBeTruthy();
    act(() => {
      fireEvent.click(target);
    });

    // 1) the stored move is the canonical preimage, as a number (tree stays canonical)
    expect(selectActivePosition(store.getState()).moves).toEqual([180, expectedCanonical]);

    // 2) the stone paints at the CLICKED display cell — its group now holds a placed Stone
    const g = rectFor(container, displayCell).closest('g');
    expect(g).toBeTruthy();
    expect(g.querySelector('circle[filter="url(#shadow)"]')).toBeTruthy();
  });
});
