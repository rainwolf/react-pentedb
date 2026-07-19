// aiClient — the ONLY seam between UI code and the MMAI WASM engine.
//
// The engine runs in a Web Worker (src/workers/aiWorker.js) so a multi-second search
// never blocks the UI thread. This module owns the worker lifecycle, marshals requests,
// and decodes replies. See docs/.../wasm-ai-contract.md for the engine contract.

// Canonical variant ids the AI supports: the six odd "base" variants plus their even
// "Speed" twins. (D-Pente=5/6, G-Pente=7/8, Go=19.. etc. are intentionally excluded —
// the engine falls back to plain Pente for them.)
const SUPPORTED = new Set([1, 2, 3, 4, 11, 12, 13, 14, 15, 16, 25, 26]);

// Connect6 (base 13) plays two stones per turn; its even twin is 14.
const isConnect6 = (game) => game === 13 || game === 14;

// Where the ai.js/ai.wasm public assets live at runtime. The prod app is served under
// /gameServer/db/ (rsbuild assetPrefix); the dev server serves public/ at the root.
// NODE_ENV is inlined by rsbuild (same pattern as the sibling react_ apps).
const AI_ASSET_BASE =
  process.env.NODE_ENV === 'production' ? '/gameServer/db/ai/' : '/ai/';

/**
 * Capability probe for a canonical game id.
 * @returns {{supported: boolean, engineGame: number}}
 *   engineGame = the odd base id (even Speed twins collapse to base-1). NOTE: this is a
 *   JS-side grouping only — 2 collapses to 1 here, but the engine itself maps a *literal*
 *   2 to Keryo (3). requestMove() forwards the RAW id, so the engine's quirk is what
 *   actually governs play; engineGame is for UI grouping/labelling (Task 2).
 */
export function getAiCapability(game) {
  const engineGame = game % 2 === 0 ? game - 1 : game;
  return { supported: SUPPORTED.has(game), engineGame };
}

/**
 * Build an AI client bound to a worker factory. Exposed for tests (which inject a fake
 * worker); production code uses the default singleton exported below.
 */
export function createAiClient(workerFactory) {
  let worker = null;
  let seq = 0;
  const pending = new Map(); // id -> { resolve, reject, game }

  function handleMessage(event) {
    const data = event && event.data;
    if (!data || typeof data.id !== 'number') return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);

    if (data.type === 'error') {
      entry.reject(new Error(data.message || 'AI engine error'));
      return;
    }
    if (data.type !== 'result') return;

    // Connect6 packs the AI's two stones as m1*362 + m2, where m2 === 361 is the
    // single-stone sentinel (opening / mid-pair). Every other variant returns a plain
    // cell index 0..360. (wasm-ai-contract.md §1)
    if (isConnect6(entry.game)) {
      const m1 = Math.floor(data.move / 362);
      const m2 = data.move % 362;
      entry.resolve({ moves: m2 === 361 ? [m1] : [m1, m2] });
    } else {
      entry.resolve({ moves: [data.move] });
    }
  }

  function handleError() {
    const err = new Error('AI worker crashed');
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = workerFactory();
    worker.onmessage = handleMessage;
    worker.onerror = handleError;
    return worker;
  }

  /**
   * Ask the engine for the AI's move.
   * @param {{game:number, level:number, openingBook:(0|1), moves:number[]}} req
   * @returns {Promise<{moves: number[]}>} one cell, or two for Connect6.
   */
  function requestMove({ game, level, openingBook, moves }) {
    const w = ensureWorker();
    const id = (seq += 1);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, game });
      // Forward the RAW canonical id (no JS normalization — the engine owns id mapping,
      // wasm-ai-contract.md §5). aiBase tells the worker where to load ai.js/ai.wasm.
      w.postMessage({ type: 'move', id, game, level, openingBook, moves, aiBase: AI_ASSET_BASE });
    });
  }

  /**
   * Abort the current search. The engine call isn't interruptible, so we terminate the
   * worker outright, reject anything in flight, and respawn a fresh worker so the next
   * request starts cleanly.
   */
  function cancel() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    const err = new Error('AI request cancelled');
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
    ensureWorker(); // respawn eagerly
  }

  return { getAiCapability, requestMove, cancel };
}

// Default singleton: a real Web Worker. The `new URL(..., import.meta.url)` form lets
// rsbuild/rspack bundle the worker as its own chunk. The factory runs lazily (first
// requestMove/cancel), so importing this module never constructs a Worker — keeping it
// safe under vitest+jsdom.
const defaultClient = createAiClient(
  () => new Worker(new URL('../../workers/aiWorker.js', import.meta.url)),
);

export const requestMove = defaultClient.requestMove;
export const cancel = defaultClient.cancel;
