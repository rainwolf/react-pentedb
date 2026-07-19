// Real-wasm engine smoke test (`npm run test:engine`).
//
// jsdom can't host a Web Worker running emscripten wasm, so — following
// react_mmai/tests/engine_referee.test.mjs — we load the checked-in public/ai/ai.js
// glue directly under Node (prepending `var Module = ...` so the emscripten CJS glue
// extends our object) and call getAIMove through the SAME ccall marshalling the worker
// uses. Gate: the engine must return a LEGAL reply to [180] for each of the 6 base
// variants at level 1 with the opening book on. Legal = empty cell in 0..360; Connect6
// (game 13) returns two DISTINCT empty cells packed as m1*362 + m2.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const aiJs = join(here, '..', 'public', 'ai', 'ai.js');

// The glue derives ai.wasm's location from its own directory, so write the temp copy
// next to ai.js/ai.wasm (public/ai/) — no locateFile override needed under Node.
const glueTmp = join(dirname(aiJs), `.smoke_ai.${process.pid}.js`);
const M = {};
const ready = new Promise((resolve) => {
  M.onRuntimeInitialized = () => resolve();
});
globalThis.__SMOKE_M = M;
writeFileSync(glueTmp, 'var Module = globalThis.__SMOKE_M;\n' + readFileSync(aiJs, 'utf8'));
require(glueTmp);
await ready;
try {
  unlinkSync(glueTmp);
} catch {
  /* best-effort cleanup */
}

// Same marshalling as src/workers/aiWorker.js (and react_mmai's saga): copy the moves
// Int32Array into the wasm heap, ccall getAIMove(game, level, book, ptr, numMoves).
function engineMove(game, moves, level, book) {
  const ta = new Int32Array(moves);
  const ptr = M._malloc(ta.length * ta.BYTES_PER_ELEMENT);
  M.HEAPU8.set(new Uint8Array(ta.buffer), ptr);
  const mv = M.ccall(
    'getAIMove',
    'number',
    ['number', 'number', 'number', 'number', 'number'],
    [game, level, book, ptr, ta.length],
  );
  M._free(ptr);
  return mv;
}

const BASE_VARIANTS = [
  [1, 'Pente'],
  [3, 'Keryo-Pente'],
  [11, 'Poof-Pente'],
  [13, 'Connect6'],
  [15, 'Boat-Pente'],
  [25, 'O-Pente'],
];
const SEED = [180]; // center opening (matches the start-game seed)
const emptyCell = (m) => Number.isInteger(m) && m >= 0 && m <= 360 && !SEED.includes(m);

let fail = 0;
for (const [game, name] of BASE_VARIANTS) {
  const mv = engineMove(game, SEED, 1, 1);
  let ok;
  let detail;
  if (game === 13) {
    const m1 = Math.floor(mv / 362);
    const m2 = mv % 362;
    // After the single opening stone it's a full two-stone turn: expect two distinct
    // empty cells (sentinel 361 would mean a single stone, which is illegal here).
    ok = emptyCell(m1) && m2 !== 361 && emptyCell(m2) && m1 !== m2;
    detail = `packed=${mv} m1=${m1} m2=${m2}`;
  } else {
    ok = emptyCell(mv);
    detail = `move=${mv}`;
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} - game ${game} (${name}) legal reply to [180]  :: ${detail}`);
  if (!ok) fail += 1;
}

console.log(`\n${BASE_VARIANTS.length - fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
