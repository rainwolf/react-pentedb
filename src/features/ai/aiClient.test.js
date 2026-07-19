// aiClient is the ONLY seam between UI code and the WASM engine. The Worker is mocked
// here (jsdom has no real Worker / wasm); the real-engine contract is covered by the
// node smoke runner (scripts/ai-smoke.mjs, `npm run test:engine`).
import { describe, it, expect, beforeEach } from 'vitest';
import { getAiCapability, createAiClient } from './aiClient';

// Minimal Worker double: records posted messages, lets a test push a reply back through
// onmessage, and records terminate() so cancel()/respawn is observable.
class FakeWorker {
  constructor() {
    this.posted = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    FakeWorker.instances.push(this);
  }
  postMessage(m) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  // Test helper: simulate the worker replying.
  _reply(data) {
    if (this.onmessage) this.onmessage({ data });
  }
}
FakeWorker.instances = [];

const factory = () => new FakeWorker();

beforeEach(() => {
  FakeWorker.instances = [];
});

describe('getAiCapability', () => {
  // Every supported id -> its odd engine base. 2->1 (NOT 2): the odd-base collapse
  // treats 2 as Speed-Pente's base; the literal-2->Keryo quirk lives in the engine,
  // not here (see wasm-ai-contract.md §5).
  const supported = [
    [1, 1], [2, 1], [3, 3], [4, 3],
    [11, 11], [12, 11], [13, 13], [14, 13],
    [15, 15], [16, 15], [25, 25], [26, 25],
  ];
  it.each(supported)('game %i -> supported, engineGame %i', (game, engineGame) => {
    expect(getAiCapability(game)).toEqual({ supported: true, engineGame });
  });

  it('marks the 2->1 quirk explicitly (Speed-Pente base is 1, not 2)', () => {
    expect(getAiCapability(2)).toEqual({ supported: true, engineGame: 1 });
  });

  it.each([0, 5, 7, 9, 17, 19, 21, 23, 100, -1])(
    'game %i -> unsupported',
    (game) => {
      expect(getAiCapability(game).supported).toBe(false);
    },
  );
});

describe('requestMove', () => {
  it('lazily creates a single worker and posts the exact message shape', () => {
    const client = createAiClient(factory);
    client.requestMove({ game: 1, level: 3, openingBook: 1, moves: [180] }).catch(() => {});
    expect(FakeWorker.instances.length).toBe(1);
    const [w] = FakeWorker.instances;
    expect(w.posted.length).toBe(1);
    const msg = w.posted[0];
    expect(msg).toMatchObject({
      type: 'move',
      game: 1,
      level: 3,
      openingBook: 1,
      moves: [180],
    });
    expect(typeof msg.id).toBe('number');
    // The main thread computes the asset base and hands it to the worker.
    expect(typeof msg.aiBase).toBe('string');
    expect(msg.aiBase.endsWith('/ai/')).toBe(true);
  });

  it('passes the RAW game id through (no JS-side normalization)', () => {
    const client = createAiClient(factory);
    // 4 must NOT be pre-normalized to 3 in JS; the engine does that itself.
    client.requestMove({ game: 4, level: 1, openingBook: 0, moves: [180] }).catch(() => {});
    expect(FakeWorker.instances[0].posted[0].game).toBe(4);
    expect(FakeWorker.instances[0].posted[0].openingBook).toBe(0);
  });

  it('resolves a single move for non-Connect6 variants', async () => {
    const client = createAiClient(factory);
    const p = client.requestMove({ game: 1, level: 1, openingBook: 1, moves: [180] });
    const w = FakeWorker.instances[0];
    w._reply({ type: 'result', id: w.posted[0].id, move: 200 });
    await expect(p).resolves.toEqual({ moves: [200] });
  });

  it('unpacks a Connect6 two-stone reply (m1*362 + m2)', async () => {
    const client = createAiClient(factory);
    const p = client.requestMove({ game: 13, level: 1, openingBook: 1, moves: [180] });
    const w = FakeWorker.instances[0];
    const m1 = 200;
    const m2 = 201;
    w._reply({ type: 'result', id: w.posted[0].id, move: m1 * 362 + m2 });
    await expect(p).resolves.toEqual({ moves: [200, 201] });
  });

  it('unpacks a Connect6 single-stone sentinel (m2 === 361 -> one move)', async () => {
    const client = createAiClient(factory);
    const p = client.requestMove({ game: 14, level: 1, openingBook: 1, moves: [180] });
    const w = FakeWorker.instances[0];
    const m1 = 180;
    w._reply({ type: 'result', id: w.posted[0].id, move: m1 * 362 + 361 });
    await expect(p).resolves.toEqual({ moves: [180] });
  });

  it('rejects when the worker reports an error', async () => {
    const client = createAiClient(factory);
    const p = client.requestMove({ game: 1, level: 1, openingBook: 1, moves: [180] });
    const w = FakeWorker.instances[0];
    w._reply({ type: 'error', id: w.posted[0].id, message: 'boom' });
    await expect(p).rejects.toThrow(/boom/);
  });

  it('routes concurrent replies to the right promise by id', async () => {
    const client = createAiClient(factory);
    const p1 = client.requestMove({ game: 1, level: 1, openingBook: 1, moves: [180] });
    const p2 = client.requestMove({ game: 1, level: 1, openingBook: 1, moves: [180, 200] });
    const w = FakeWorker.instances[0];
    const [m1, m2] = w.posted;
    // reply out of order
    w._reply({ type: 'result', id: m2.id, move: 55 });
    w._reply({ type: 'result', id: m1.id, move: 44 });
    await expect(p1).resolves.toEqual({ moves: [44] });
    await expect(p2).resolves.toEqual({ moves: [55] });
  });
});

describe('cancel', () => {
  it('terminates the running worker and immediately respawns a fresh one', () => {
    const client = createAiClient(factory);
    client.requestMove({ game: 1, level: 1, openingBook: 1, moves: [180] }).catch(() => {});
    expect(FakeWorker.instances.length).toBe(1);
    const first = FakeWorker.instances[0];

    client.cancel();
    expect(first.terminated).toBe(true);
    // respawned eagerly so the next request starts from a clean engine
    expect(FakeWorker.instances.length).toBe(2);

    client.requestMove({ game: 1, level: 1, openingBook: 1, moves: [180] }).catch(() => {});
    // the new request went to the fresh worker, not the terminated one
    expect(FakeWorker.instances[1].posted.length).toBe(1);
    expect(first.posted.length).toBe(1);
  });

  it('rejects any in-flight request (engine calls are not interruptible)', async () => {
    const client = createAiClient(factory);
    const p = client.requestMove({ game: 1, level: 1, openingBook: 1, moves: [180] });
    client.cancel();
    await expect(p).rejects.toThrow();
  });
});
