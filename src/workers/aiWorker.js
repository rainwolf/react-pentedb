// aiWorker — hosts the MMAI WASM engine off the UI thread.
//
// Classic Web Worker (uses importScripts). The emscripten glue (ai.js) is the
// non-MODULARIZE global-`Module` build: pre-define self.Module (with locateFile +
// onRuntimeInitialized) BEFORE importScripts so the glue extends it. Nothing loads until
// the first 'move' message arrives (spec §14: no wasm until the AI panel is used).
//
// Message protocol (driven by src/features/ai/aiClient.js):
//   in : { type:'move', id, game, level, openingBook, moves:number[], aiBase }
//   out: { type:'result', id, move }   // raw engine return; client decodes Connect6
//        { type:'error',  id, message }

let enginePromise = null;

// Lazily load + initialise the engine, resolving to the ready Module. aiBase points at
// the directory holding ai.js/ai.wasm (/ai/ in dev, /gameServer/db/ai/ in prod).
function loadEngine(aiBase) {
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    self.Module = {
      // Redirect the ai.wasm lookup next to ai.js under aiBase (the worker's own URL is
      // a bundled chunk elsewhere, so the default script-relative resolution won't do).
      locateFile: (path) => aiBase + path,
      onRuntimeInitialized() {
        resolve(self.Module);
      },
      onAbort(what) {
        reject(new Error('wasm aborted: ' + what));
      },
    };
    try {
      self.importScripts(aiBase + 'ai.js');
    } catch (err) {
      reject(err);
    }
  });
  return enginePromise;
}

// Copy the moves Int32Array into the wasm heap and call getAIMove — byte-for-byte the
// marshalling react_mmai's saga uses (wasm-ai-contract.md §3).
function callEngine(M, { game, level, openingBook, moves }) {
  const typedArray = new Int32Array(moves);
  const numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
  const ptr = M._malloc(numBytes);
  const heapBytes = new Uint8Array(M.HEAPU8.buffer, ptr, numBytes);
  heapBytes.set(new Uint8Array(typedArray.buffer));
  const move = M.ccall(
    'getAIMove',
    'number',
    ['number', 'number', 'number', 'number', 'number'],
    [game, level, openingBook, heapBytes.byteOffset, typedArray.length],
  );
  M._free(heapBytes.byteOffset);
  return move;
}

self.onmessage = async (event) => {
  const msg = event && event.data;
  if (!msg || msg.type !== 'move') return;
  try {
    const M = await loadEngine(msg.aiBase);
    const move = callEngine(M, msg);
    self.postMessage({ type: 'result', id: msg.id, move });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
