// RTK Query slice for the pentedb backend (`/api/db/*`).
//
// Endpoint names, argument shapes, and request/response JSON here are BINDING wire
// contracts: they mirror the Phase 1 backend (branch webdb-api) verbatim. Sources, in
// authority order: the Phase 1 Task 3/4/6 "Interfaces" blocks
// (.superpowers/sdd/p1-task-{3,4,6}-brief.md).
//
// Base URL is the RELATIVE '/api/db' — same-origin in production, and the rsbuild dev
// server proxies '/api/db' to the backend. `credentials:'include'` sends the pente.org
// session cookie so the auth'd endpoints (collection, analyses, scope mine/both) see the
// logged-in user.
//
// Tags: an import writes to the caller's personal collection, so it must invalidate both
// the collection lists AND any position-stats / games-search results taken over the
// personal data (scope 'mine' or 'both'). Those queries therefore also provide the
// Collection tag; archive-only queries do not (nothing an import does can change them).
//
// Error envelope (JsonHttp): non-2xx responses carry `{error:{code,message}}` in
// `error.data`; `error.status` is the HTTP status (e.g. 401 anonymous on auth endpoints,
// 400 bad_request, 404 unknown/cross-owner, 413 tree too large).
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const withCollectionTag = (result, error, arg) =>
  arg && (arg.scope === 'mine' || arg.scope === 'both') ? [{ type: 'Collection', id: 'LIST' }] : [];

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/db', credentials: 'include' }),
  tagTypes: ['Analyses', 'Collection'],
  endpoints: (builder) => ({
    // --- auth (Phase 3 Task 1) -----------------------------------------------------
    // GET /api/db/ping → {ok, auth:"name"|null, dbAccess:boolean} — session probe. `auth` is
    // the BINDING login signal; `dbAccess` is the subscriber-only gate (subscriber, or a new
    // player <60 days old with >=1 game; see AccessGate). A missing dbAccess means NO access.
    // Every other /api/db/* returns 401 anonymous / 403 {error.code:"subscription_required"}
    // without access (subscriptionGuard refetches ping on that 403).
    ping: builder.query({
      query: () => '/ping',
    }),

    // --- position stats (Phase 1 Task 3) -----------------------------------------
    // POST /api/db/position-stats  {game, moves, scope, filters}
    //   → {totalGames, totalWinPct, rotation, nextMoves:[{move, games, wins, winPct}]}
    // nextMoves[].move is ALREADY in the caller's local board orientation — the server
    // (PositionStatsHandler) rotates each candidate back to it via rotateMoveToLocalRotation
    // (rotateFirstMove when numMoves===0) before responding. The top-level `rotation` is
    // INFORMATIONAL ONLY (how the position itself was normalized for the master-tree lookup) —
    // the client must NOT re-apply it to `move`; doing so double-rotates and corrupts the cell.
    positionStats: builder.query({
      query: ({ game, moves, scope = 'archive', filters = null }) => ({
        url: '/position-stats',
        method: 'POST',
        body: { game, moves, scope, filters },
      }),
      providesTags: withCollectionTag,
    }),

    // --- games search / load / venues / players (Phase 1 Task 4) ------------------
    // POST /api/db/games/search  {game, moves?, scope, filters, offset, limit}
    //   → {total, games:[GameHeader]}   (GameHeader.player1/player2 are NULLABLE)
    gamesSearch: builder.query({
      query: ({ game, moves, scope = 'archive', filters = null, offset = 0, limit = 25 }) => ({
        url: '/games/search',
        method: 'POST',
        // `moves` is omitted for a no-position (filter-only) search — leaving it undefined
        // drops it from the serialized body, which is the no-position signal to the server.
        body: { game, moves, scope, filters, offset, limit },
      }),
      providesTags: withCollectionTag,
    }),

    // GET /api/db/games/{gid} → {header: GameHeader, moves:[...], renjuOffers?:[...]}
    game: builder.query({
      query: (gid) => `/games/${gid}`,
    }),

    // GET /api/db/venues → {variants:[{game, name, sites:[{id, name, events:[{id, name}]}]}]}
    venues: builder.query({
      query: () => '/venues',
    }),

    // GET /api/db/players?q=al → {players:[...]} (max 20; server rejects q < 2 chars with 400)
    players: builder.query({
      query: (q) => ({ url: '/players', params: { q } }),
    }),

    // --- collection (Phase 1 Task 6, auth'd) --------------------------------------
    // GET /api/db/collection?game=&offset=&limit= → {total, games:[GameHeader]}
    //   (source:"mine", gid == wgid)
    collection: builder.query({
      query: ({ game, offset = 0, limit = 25 }) => ({
        url: '/collection',
        params: { game, offset, limit },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.games.map((g) => ({ type: 'Collection', id: g.gid })),
              { type: 'Collection', id: 'LIST' },
            ]
          : [{ type: 'Collection', id: 'LIST' }],
    }),

    // GET /api/db/collection/{wgid} → {header: GameHeader, moves:[...]}
    collectionGame: builder.query({
      query: (wgid) => `/collection/${wgid}`,
      providesTags: (result, error, wgid) => [{ type: 'Collection', id: wgid }],
    }),

    // --- analyses (Phase 1 Task 6, auth'd) ----------------------------------------
    // GET /api/db/analyses → {analyses:[{aid, name, game, created, updated}]}
    analyses: builder.query({
      query: () => '/analyses',
      providesTags: (result) =>
        result
          ? [
              ...result.analyses.map((a) => ({ type: 'Analyses', id: a.aid })),
              { type: 'Analyses', id: 'LIST' },
            ]
          : [{ type: 'Analyses', id: 'LIST' }],
    }),

    // GET /api/db/analyses/{aid} → {aid, name, game, tree}
    analysis: builder.query({
      query: (aid) => `/analyses/${aid}`,
      providesTags: (result, error, aid) => [{ type: 'Analyses', id: aid }],
    }),

    // --- mutations ----------------------------------------------------------------
    // POST /api/db/collection/import  {games:[...]} → {imported, duplicates, errors}
    // Arg is the games array (parsed client-side); wrapped into the {games} envelope.
    importGames: builder.mutation({
      query: (games) => ({ url: '/collection/import', method: 'POST', body: { games } }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }],
    }),

    // Create OR update an analysis, switching on the presence of `aid`:
    //   no aid → POST /api/db/analyses {name, game, tree}      → {aid}
    //   aid    → PUT  /api/db/analyses/{aid} {name?, tree?}    → {ok:true}
    // (undefined name/tree are dropped by JSON serialization, matching the PUT contract.)
    saveAnalysis: builder.mutation({
      query: ({ aid, name, game, tree }) =>
        aid == null
          ? { url: '/analyses', method: 'POST', body: { name, game, tree } }
          : { url: `/analyses/${aid}`, method: 'PUT', body: { name, tree } },
      invalidatesTags: (result, error, { aid }) =>
        aid == null
          ? [{ type: 'Analyses', id: 'LIST' }]
          : [{ type: 'Analyses', id: aid }, { type: 'Analyses', id: 'LIST' }],
    }),

    // DELETE /api/db/analyses/{aid} → {ok:true}
    deleteAnalysis: builder.mutation({
      query: (aid) => ({ url: `/analyses/${aid}`, method: 'DELETE' }),
      invalidatesTags: (result, error, aid) => [
        { type: 'Analyses', id: aid },
        { type: 'Analyses', id: 'LIST' },
      ],
    }),

    // DELETE /api/db/collection/{wgid} → {ok:true}
    deleteCollectionGame: builder.mutation({
      query: (wgid) => ({ url: `/collection/${wgid}`, method: 'DELETE' }),
      invalidatesTags: (result, error, wgid) => [
        { type: 'Collection', id: wgid },
        { type: 'Collection', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  usePingQuery,
  usePositionStatsQuery,
  useGamesSearchQuery,
  useGameQuery,
  useVenuesQuery,
  usePlayersQuery,
  useCollectionQuery,
  useCollectionGameQuery,
  useAnalysesQuery,
  useAnalysisQuery,
  useImportGamesMutation,
  useSaveAnalysisMutation,
  useDeleteAnalysisMutation,
  useDeleteCollectionGameMutation,
} = api;
