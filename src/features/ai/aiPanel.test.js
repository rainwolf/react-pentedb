// AI panel tests (P4 Task 2, brief Step 1). The aiClient seam is mocked — no real worker
// ever spawns under vitest/jsdom. Coverage mirrors the brief's five required cases plus the
// busy/error discipline the interface calls out:
//   - unsupported variant -> fallback copy, no Hint control;
//   - Hint -> requestMove(raw id, level, book, line) -> ghost on board + coordinate chip;
//   - the chip plays the suggestion into the tree;
//   - Hint is disabled while a request is in flight (single in-flight);
//   - an engine crash surfaces a visible error; a *cancelled* rejection stays silent;
//   - play-vs-AI answers the AI's turn and appends the reply into the tree;
//   - Connect6 applies a two-stone reply as ONE turn from ONE request;
//   - leaving the panel (tab switch) while pending calls cancel().
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import docsReducer, { openTab, navPrev, selectActivePosition } from '../../model/docSlice';
import { createTree, addMove } from '../../model/gameTree';

// The ONLY seam to the engine. Keep getAiCapability real (pure), stub the async surface.
vi.mock('./aiClient', () => {
  const SUPPORTED = new Set([1, 2, 3, 4, 11, 12, 13, 14, 15, 16, 25, 26]);
  return {
    getAiCapability: (game) => ({
      supported: SUPPORTED.has(game),
      engineGame: game % 2 === 0 ? game - 1 : game,
    }),
    requestMove: vi.fn(),
    cancel: vi.fn(),
  };
});
// eslint-disable-next-line import/first
import { requestMove, cancel } from './aiClient';
// eslint-disable-next-line import/first
import aiReducer from './aiSlice';
// eslint-disable-next-line import/first
import AiPanel from './AiPanel';
// eslint-disable-next-line import/first
import AiGhostOverlay from './AiGhostOverlay';

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

function makeStore(moves = [], cursorPath = [], game = 1) {
  const store = configureStore({ reducer: { docs: docsReducer, ai: aiReducer } });
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  requestMove.mockReset();
  cancel.mockReset();
});
afterEach(() => cleanup());

// ===================================================================================
// Capability gating
// ===================================================================================
describe('AiPanel — capability gating', () => {
  test('an unsupported variant renders a fallback and no Hint control', () => {
    renderWith(makeStore([], [], 19), <AiPanel />); // 19 = Go, not AI-supported
    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.queryByTestId('ai-hint')).toBeNull();
  });

  test('a supported variant renders the Hint control', () => {
    renderWith(makeStore([], [], 1), <AiPanel />);
    expect(screen.getByTestId('ai-hint')).toBeTruthy();
  });
});

// ===================================================================================
// Hint -> ghost suggestion
// ===================================================================================
describe('AiPanel — Hint / ghost suggestion', () => {
  test('Hint forwards the RAW id + level + book + canonical line and renders a ghost + chip', async () => {
    requestMove.mockResolvedValue({ moves: [200] });
    const store = makeStore([180], [0], 1);
    const { container } = renderWith(
      store,
      <>
        <AiPanel />
        <AiGhostOverlay />
      </>
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-hint'));
    });
    expect(requestMove).toHaveBeenCalledTimes(1);
    expect(requestMove).toHaveBeenCalledWith(
      expect.objectContaining({ game: 1, moves: [180] })
    );
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-chip')).toBeTruthy());
    // the chip names the coordinate (A1-style label), never a raw cell index
    expect(screen.getByTestId('ai-suggestion-chip').textContent).toMatch(/[A-HJ-T]\d/);
    // and a distinct ghost is painted on the board for the suggested cell
    expect(container.querySelector('[data-testid="ai-ghost-200"]')).toBeTruthy();
  });

  test('the suggestion is bound to its position — navigating away removes the ghost AND the chip', async () => {
    requestMove.mockResolvedValue({ moves: [200] });
    const store = makeStore([180, 181], [0, 0], 1);
    const { container } = renderWith(
      store,
      <>
        <AiPanel />
        <AiGhostOverlay />
      </>
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-hint'));
    });
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-chip')).toBeTruthy());
    expect(container.querySelector('[data-testid="ai-ghost-200"]')).toBeTruthy();

    // Step to a DIFFERENT position: the suggestion (cell 200 for the line [180]) no longer
    // applies, so both the ghost and the clickable chip must disappear.
    await act(async () => {
      store.dispatch(navPrev());
    });
    expect(screen.queryByTestId('ai-suggestion-chip')).toBeNull();
    expect(container.querySelector('[data-testid="ai-ghost-200"]')).toBeNull();
  });

  test('clicking the suggestion chip plays the move into the tree', async () => {
    requestMove.mockResolvedValue({ moves: [200] });
    const store = makeStore([180], [0], 1);
    renderWith(store, <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-hint'));
    });
    await waitFor(() => screen.getByTestId('ai-suggestion-chip'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-suggestion-chip'));
    });
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 200]);
  });

  test('Hint is disabled while a request is in flight (single in-flight)', async () => {
    const d = deferred();
    requestMove.mockReturnValue(d.promise);
    renderWith(makeStore([180], [0], 1), <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-hint'));
    });
    expect(screen.getByTestId('ai-thinking')).toBeTruthy();
    expect(screen.getByTestId('ai-hint').disabled).toBe(true);
  });
});

// ===================================================================================
// Error discipline
// ===================================================================================
describe('AiPanel — error discipline', () => {
  test('an engine crash surfaces a visible error', async () => {
    const err = new Error('boom');
    err.workerCrashed = true;
    requestMove.mockRejectedValue(err);
    renderWith(makeStore([180], [0], 1), <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-hint'));
    });
    await waitFor(() => expect(screen.getByTestId('ai-error')).toBeTruthy());
  });

  test('a cancelled rejection stays silent (no error, no spinner)', async () => {
    const err = new Error('cancelled');
    err.cancelled = true;
    requestMove.mockRejectedValue(err);
    renderWith(makeStore([180], [0], 1), <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-hint'));
    });
    await waitFor(() => expect(screen.queryByTestId('ai-thinking')).toBeNull());
    expect(screen.queryByTestId('ai-error')).toBeNull();
  });
});

// ===================================================================================
// Play vs AI
// ===================================================================================
describe('AiPanel — play vs AI', () => {
  test('answers when it is the AI\'s turn and appends the reply into the tree', async () => {
    requestMove.mockResolvedValue({ moves: [200] });
    const store = makeStore([180], [0], 1); // after 1 move it is player 2's turn
    renderWith(store, <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-play-toggle')); // AI defaults to the second player
    });
    await waitFor(() =>
      expect(selectActivePosition(store.getState()).moves).toEqual([180, 200])
    );
    expect(requestMove).toHaveBeenCalledWith(expect.objectContaining({ game: 1, moves: [180] }));
  });

  test('Connect6: a two-stone reply is applied as ONE turn from ONE request', async () => {
    requestMove.mockResolvedValue({ moves: [200, 201] });
    const store = makeStore([180], [0], 13); // connect6: after the lone opener, player 2 plays two
    renderWith(store, <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-play-toggle'));
    });
    await waitFor(() =>
      expect(selectActivePosition(store.getState()).moves).toEqual([180, 200, 201])
    );
    expect(requestMove).toHaveBeenCalledTimes(1);
  });

  test('does not answer when it is the human\'s turn', async () => {
    requestMove.mockResolvedValue({ moves: [200] });
    const store = makeStore([180, 181], [0, 0], 1); // [centre, reply]: player 1 (human, AI is second) to move
    renderWith(store, <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-play-toggle'));
    });
    // give any stray effect a chance to (wrongly) fire
    await act(async () => {
      await Promise.resolve();
    });
    expect(requestMove).not.toHaveBeenCalled();
    expect(selectActivePosition(store.getState()).moves).toEqual([180, 181]);
  });
});

// ===================================================================================
// Cancellation on tab switch (unmount while pending)
// ===================================================================================
describe('AiPanel — cancellation', () => {
  test('leaving the panel while a request is pending cancels it', async () => {
    const d = deferred();
    requestMove.mockReturnValue(d.promise);
    const { unmount } = renderWith(makeStore([180], [0], 1), <AiPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-hint'));
    });
    expect(screen.getByTestId('ai-thinking')).toBeTruthy();
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
