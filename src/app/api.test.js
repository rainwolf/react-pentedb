// RTK Query slice contract tests.
//
// These assert the SERIALIZED request each endpoint sends (method / path / query /
// body / credentials) against the Phase 1 wire contracts, that canned responses parse
// into the documented shapes, that scope mine/both carries the Collection tag (so an
// import refetches them), and that a 401 from an auth endpoint surfaces isError.
//
// Network is stubbed with vitest's fetch mock (react_live_game_room has no msw/
// fetch-mock precedent, so per the task brief we use vitest's fetch mock). Endpoints
// are exercised by dispatching `api.endpoints.<name>.initiate(arg)` on a throwaway
// store — the standard, hook-free way to test an RTK Query slice.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';

// --- Request shim -----------------------------------------------------------------
// fetchBaseQuery builds `new Request(baseUrl + url, config)`. The slice's baseUrl is the
// RELATIVE '/api/db' (browsers resolve it against the page origin; the dev proxy / prod
// same-origin routes it). Under vitest's jsdom the global Request is undici's, which
// throws on a relative URL. Resolve relative URLs against http://localhost for the test
// environment only — production is untouched (it never constructs an absolute here).
let RealRequest;
beforeAll(() => {
  RealRequest = globalThis.Request;
  globalThis.Request = class extends RealRequest {
    constructor(input, init) {
      if (typeof input === 'string' && input.startsWith('/')) input = 'http://localhost' + input;
      super(input, init);
    }
  };
});
afterAll(() => {
  globalThis.Request = RealRequest;
});

// --- Helpers ----------------------------------------------------------------------
function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// Inspect the (only) request the slice sent.
async function captured() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const req = fetchMock.mock.calls[0][0];
  const u = new URL(req.url);
  const text = await req.clone().text();
  return {
    method: req.method,
    path: u.pathname,
    search: u.search,
    credentials: req.credentials,
    body: text ? JSON.parse(text) : undefined,
  };
}

function countPath(pathname) {
  return fetchMock.mock.calls.filter((c) => new URL(c[0].url).pathname === pathname).length;
}

// Await up to N microtask/macrotask ticks for an async condition (invalidation refetch).
async function until(pred, tries = 100) {
  for (let i = 0; i < tries; i++) {
    if (pred()) return;
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  expect(pred()).toBe(true);
}

// The query cache keys currently registered as providers of the {Collection, LIST} tag,
// read straight from RTK Query's tag index — a deterministic view of `providesTags`.
function collectionListProviders(store) {
  const provided = store.getState().api.provided;
  return provided?.tags?.Collection?.LIST || [];
}

// A minimal GameHeader per the Phase 1 Task 4 contract (player fields NULLABLE).
const HEADER = {
  gid: 123456,
  source: 'archive',
  game: 1,
  player1: { name: 'alice', rating: 1810 },
  player2: null, // NULLABLE per contract
  winner: 1,
  site: 'Pente.org',
  event: '...',
  round: '1',
  section: '',
  playDate: '2019-05-01T12:00:00Z',
  moveCount: 42,
};

// ===================================================================================
// position-stats  (Phase 1 Task 3)
// ===================================================================================
describe('positionStats — POST /api/db/position-stats', () => {
  test('sends game/moves/scope/filters and parses the stats shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        totalGames: 1234,
        totalWinPct: 55.1,
        rotation: 3,
        nextMoves: [{ move: 199, games: 812, wins: 495, winPct: 61.0 }],
      })
    );
    const store = makeStore();
    const res = await store.dispatch(
      api.endpoints.positionStats.initiate(
        { game: 1, moves: [180, 210], scope: 'archive', filters: null },
        { subscribe: false }
      )
    );
    const c = await captured();
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/api/db/position-stats');
    expect(c.credentials).toBe('include');
    expect(c.body).toEqual({ game: 1, moves: [180, 210], scope: 'archive', filters: null });
    expect(res.data.totalGames).toBe(1234);
    expect(res.data.totalWinPct).toBe(55.1);
    expect(res.data.rotation).toBe(3);
    expect(res.data.nextMoves[0]).toEqual({ move: 199, games: 812, wins: 495, winPct: 61.0 });
  });

  test('scope:mine provides the {Collection, LIST} tag (so an import invalidates it)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ totalGames: 0, totalWinPct: 0, rotation: 0, nextMoves: [] })
    );
    const store = makeStore();
    await store.dispatch(
      api.endpoints.positionStats.initiate({ game: 1, moves: [180], scope: 'mine', filters: null })
    );
    const providers = collectionListProviders(store);
    expect(providers.some((k) => k.includes('positionStats') && k.includes('"scope":"mine"'))).toBe(true);
  });

  test('scope:archive does NOT provide the Collection tag', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ totalGames: 0, totalWinPct: 0, rotation: 0, nextMoves: [] })
    );
    const store = makeStore();
    await store.dispatch(
      api.endpoints.positionStats.initiate({ game: 1, moves: [180], scope: 'archive', filters: null })
    );
    expect(collectionListProviders(store).some((k) => k.includes('positionStats'))).toBe(false);
  });
});

// ===================================================================================
// games/search, games/{gid}, venues, players  (Phase 1 Task 4)
// ===================================================================================
describe('gamesSearch — POST /api/db/games/search', () => {
  test('sends the full request and parses total + GameHeader list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 4321, games: [HEADER] }));
    const store = makeStore();
    const res = await store.dispatch(
      api.endpoints.gamesSearch.initiate(
        { game: 1, moves: [180, 210], scope: 'archive', filters: null, offset: 0, limit: 25 },
        { subscribe: false }
      )
    );
    const c = await captured();
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/api/db/games/search');
    expect(c.body).toEqual({
      game: 1,
      moves: [180, 210],
      scope: 'archive',
      filters: null,
      offset: 0,
      limit: 25,
    });
    expect(res.data.total).toBe(4321);
    expect(res.data.games[0].gid).toBe(123456);
    expect(res.data.games[0].player1).toEqual({ name: 'alice', rating: 1810 });
    expect(res.data.games[0].player2).toBeNull(); // nullable player tolerated
    expect(res.data.games[0].moveCount).toBe(42);
  });

  test('no-position search (moves omitted) does not send a moves key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, games: [] }));
    const store = makeStore();
    await store.dispatch(
      api.endpoints.gamesSearch.initiate(
        { game: 1, scope: 'archive', filters: null, offset: 0, limit: 25 },
        { subscribe: false }
      )
    );
    const c = await captured();
    expect(c.body).not.toHaveProperty('moves');
    expect(c.body).toEqual({ game: 1, scope: 'archive', filters: null, offset: 0, limit: 25 });
  });

  test('scope:both provides the {Collection, LIST} tag', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, games: [] }));
    const store = makeStore();
    await store.dispatch(
      api.endpoints.gamesSearch.initiate({ game: 1, scope: 'both', filters: null, offset: 0, limit: 25 })
    );
    const providers = collectionListProviders(store);
    expect(providers.some((k) => k.includes('gamesSearch') && k.includes('"scope":"both"'))).toBe(true);
  });
});

describe('game — GET /api/db/games/{gid}', () => {
  test('GETs the gid path and parses {header, moves, renjuOffers}', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ header: HEADER, moves: [180, 199, 210], renjuOffers: [3, 5] })
    );
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.game.initiate(123456, { subscribe: false }));
    const c = await captured();
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/api/db/games/123456');
    expect(c.credentials).toBe('include');
    expect(res.data.header.gid).toBe(123456);
    expect(res.data.moves).toEqual([180, 199, 210]);
    expect(res.data.renjuOffers).toEqual([3, 5]);
  });
});

describe('venues — GET /api/db/venues', () => {
  test('GETs /venues and parses the variant/site/event tree', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        variants: [
          {
            game: 1,
            name: 'Pente',
            sites: [{ id: 2, name: 'Pente.org', events: [{ id: 7, name: 'Champs' }] }],
          },
        ],
      })
    );
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.venues.initiate(undefined, { subscribe: false }));
    const c = await captured();
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/api/db/venues');
    expect(res.data.variants[0].game).toBe(1);
    expect(res.data.variants[0].sites[0].events[0]).toEqual({ id: 7, name: 'Champs' });
  });
});

describe('players — GET /api/db/players?q=', () => {
  test('GETs /players with the q query param and parses {players}', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ players: ['Al', 'alberto', 'alice'] }));
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.players.initiate('al', { subscribe: false }));
    const c = await captured();
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/api/db/players');
    expect(c.search).toBe('?q=al');
    expect(res.data.players).toEqual(['Al', 'alberto', 'alice']);
  });
});

// ===================================================================================
// collection + analyses  (Phase 1 Task 6, auth'd)
// ===================================================================================
describe('collection — GET /api/db/collection', () => {
  test('GETs with game/offset/limit params and parses {total, games}', async () => {
    const mine = { ...HEADER, source: 'mine' };
    fetchMock.mockResolvedValue(jsonResponse({ total: 3, games: [mine] }));
    const store = makeStore();
    const res = await store.dispatch(
      api.endpoints.collection.initiate({ game: 1, offset: 0, limit: 25 }, { subscribe: false })
    );
    const c = await captured();
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/api/db/collection');
    expect(new URLSearchParams(c.search).get('game')).toBe('1');
    expect(new URLSearchParams(c.search).get('offset')).toBe('0');
    expect(new URLSearchParams(c.search).get('limit')).toBe('25');
    expect(res.data.total).toBe(3);
    expect(res.data.games[0].source).toBe('mine');
  });
});

describe('collectionGame — GET /api/db/collection/{wgid}', () => {
  test('GETs the wgid path and parses {header, moves}', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ header: { ...HEADER, source: 'mine' }, moves: [180, 199] }));
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.collectionGame.initiate(555, { subscribe: false }));
    const c = await captured();
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/api/db/collection/555');
    expect(res.data.moves).toEqual([180, 199]);
  });
});

describe('analyses — GET /api/db/analyses', () => {
  test('GETs /analyses and parses the analyses list', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        analyses: [{ aid: 1, name: 'Opening', game: 1, created: 'c', updated: 'u' }],
      })
    );
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.analyses.initiate(undefined, { subscribe: false }));
    const c = await captured();
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/api/db/analyses');
    expect(res.data.analyses[0]).toEqual({ aid: 1, name: 'Opening', game: 1, created: 'c', updated: 'u' });
  });
});

describe('analysis — GET /api/db/analyses/{aid}', () => {
  test('GETs the aid path and parses {aid, name, game, tree}', async () => {
    const tree = { v: 1, root: { kids: [] } };
    fetchMock.mockResolvedValue(jsonResponse({ aid: 7, name: 'Study', game: 1, tree }));
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.analysis.initiate(7, { subscribe: false }));
    const c = await captured();
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/api/db/analyses/7');
    expect(res.data).toEqual({ aid: 7, name: 'Study', game: 1, tree });
  });
});

// ===================================================================================
// mutations
// ===================================================================================
describe('importGames — POST /api/db/collection/import', () => {
  test('sends {games} and parses {imported, duplicates, errors}', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ imported: 2, duplicates: [1], errors: [{ index: 3, message: 'illegal move at 12' }] })
    );
    const store = makeStore();
    const games = [{ game: 1, player1: 'x', player2: 'y', winner: 1, moves: [180, 199] }];
    const res = await store.dispatch(api.endpoints.importGames.initiate(games));
    const c = await captured();
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/api/db/collection/import');
    expect(c.body).toEqual({ games });
    expect(res.data.imported).toBe(2);
    expect(res.data.duplicates).toEqual([1]);
    expect(res.data.errors[0]).toEqual({ index: 3, message: 'illegal move at 12' });
  });

  test('invalidates Collection so an active collection query refetches', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, games: [] }));
    const store = makeStore();
    await store.dispatch(api.endpoints.collection.initiate({ game: 1, offset: 0, limit: 25 }));
    expect(countPath('/api/db/collection')).toBe(1);
    fetchMock.mockResolvedValue(jsonResponse({ imported: 1, duplicates: [], errors: [] }));
    await store.dispatch(api.endpoints.importGames.initiate([{ game: 1, moves: [180] }]));
    await until(() => countPath('/api/db/collection') === 2);
  });
});

describe('saveAnalysis — POST (create) / PUT (update) switch on aid', () => {
  test('no aid → POST /api/db/analyses with {name, game, tree}, parses {aid}', async () => {
    const tree = { v: 1, root: { kids: [] } };
    fetchMock.mockResolvedValue(jsonResponse({ aid: 7 }));
    const store = makeStore();
    const res = await store.dispatch(
      api.endpoints.saveAnalysis.initiate({ name: 'New', game: 1, tree })
    );
    const c = await captured();
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/api/db/analyses');
    expect(c.body).toEqual({ name: 'New', game: 1, tree });
    expect(res.data.aid).toBe(7);
  });

  test('with aid → PUT /api/db/analyses/{aid} with {name, tree}, parses {ok}', async () => {
    const tree = { v: 1, root: { kids: [] } };
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const store = makeStore();
    const res = await store.dispatch(
      api.endpoints.saveAnalysis.initiate({ aid: 7, name: 'Renamed', tree })
    );
    const c = await captured();
    expect(c.method).toBe('PUT');
    expect(c.path).toBe('/api/db/analyses/7');
    expect(c.body).toEqual({ name: 'Renamed', tree });
    expect(res.data.ok).toBe(true);
  });
});

describe('deleteAnalysis — DELETE /api/db/analyses/{aid}', () => {
  test('DELETEs the aid path and parses {ok}', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.deleteAnalysis.initiate(7));
    const c = await captured();
    expect(c.method).toBe('DELETE');
    expect(c.path).toBe('/api/db/analyses/7');
    expect(res.data.ok).toBe(true);
  });
});

describe('deleteCollectionGame — DELETE /api/db/collection/{wgid}', () => {
  test('DELETEs the wgid path and parses {ok}', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.deleteCollectionGame.initiate(555));
    const c = await captured();
    expect(c.method).toBe('DELETE');
    expect(c.path).toBe('/api/db/collection/555');
    expect(res.data.ok).toBe(true);
  });
});

// ===================================================================================
// auth: 401
// ===================================================================================
describe('auth 401', () => {
  test('an anonymous request to an auth endpoint surfaces isError with status 401', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'anonymous', message: 'login required' } }, 401)
    );
    const store = makeStore();
    await store.dispatch(api.endpoints.analyses.initiate(undefined)); // keep subscription for select()
    const entry = api.endpoints.analyses.select(undefined)(store.getState());
    expect(entry.isError).toBe(true);
    expect(entry.status).toBe('rejected');
    expect(entry.error.status).toBe(401);
    expect(entry.error.data).toEqual({ error: { code: 'anonymous', message: 'login required' } });
    expect(entry.data).toBeUndefined();
  });
});

// ===================================================================================
// exported hooks (names are binding for later tasks)
// ===================================================================================
describe('generated hooks', () => {
  test('exports every hook named in the task contract', async () => {
    const mod = await import('./api');
    for (const name of [
      'usePositionStatsQuery',
      'useGamesSearchQuery',
      'useGameQuery',
      'useVenuesQuery',
      'usePlayersQuery',
      'useCollectionQuery',
      'useCollectionGameQuery',
      'useAnalysesQuery',
      'useAnalysisQuery',
      'useImportGamesMutation',
      'useSaveAnalysisMutation',
      'useDeleteAnalysisMutation',
      'useDeleteCollectionGameMutation',
    ]) {
      expect(typeof mod[name], name).toBe('function');
    }
  });
});
