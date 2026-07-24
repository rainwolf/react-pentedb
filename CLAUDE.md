# react_pentedb — Pente database workbench (web)

React 18 + MUI + Redux Toolkit/RTK Query, built with RSBuild. Served in prod at
`https://pente.org/gameServer/db/` (assetPrefix `/gameServer/db`, **never** a
`/pentedb/` URL segment — LoginFilter gates those). Backend: `/api/db/*` JSON API
(pente.org repo, branch `webdb-api`, PR #20).

## Commands
- `npm start` — dev server on :3000. **The owner runs this themselves and keeps a
  browser tab on it. NEVER start/kill/restart dev servers or ports; verify headless
  against the already-running :3000.**
- `npm test` — vitest (639+). `responsive-1400px` flakes ~1/3 — rerun once before
  calling it a regression.
- `npm run test:e2e` — Playwright vs live local backend; creds via `E2E_USER`/`E2E_PASS`
  (source: `../pente-react-native/.env.local`, test acct iostest — never commit/print).
- `npm run test:engine` — real-WASM AI smoke, 6 variants.
- `.env.local` → `PUBLIC_LOCAL_BACKEND=1` proxies `/api/db` + `/gameServer` to
  `https://localhost` (never commit it).

## Map
- `src/model/` — pure game tree (`gameTree.js`, paths = child-index arrays) + `docSlice`
  (tabs/cursor). `src/game/` + `src/board/` — rules & board copied byte-faithful from
  `../react_live_game_room` (don't edit rules logic).
- `src/app/api.js` — RTK Query slice, contract-locked to the Phase-1 backend.
  `src/app/uiSlice.js` — view prefs (rotation, heatOnBoard, explorerSort, treeExpanded…).
- `src/shell/` — Workbench (routes `/`, `/g/:gid`, `/p/:game/:moves`, `/a/:aid`),
  `gameTab.js` (shared tab/URL helpers — extracted to break an import cycle; keep it a leaf).
- `src/features/` — viewer (BoardPane + overlays), explorer (stats/heat), search,
  analysis (TreeView diagram, `treeLayout.js`), ai (worker client), threats, exchange.
- `src/export/` — SGF/PGN codecs, golden-tested; `coords.js` strict `cellToAlpha` for
  codecs, tolerant `formatMove` for UI.
- `src/workers/aiWorker.js` + `public/ai/` — WASM engine, byte-copied from
  `../react_mmai/MMAIWASM` (never rebuild here; deploy script refreshes it).

## Invariants (each of these was an expensive lesson)
- **Move cells are board-relative**: `cell = y*gridSize + x`, `gridSize =
  gridSizeForGame(game)` (9/13 small Go, 15 Renju, else 19). Never hardcode 19 in UI.
  Pass sentinel = `gridSize²` → render "PASS", never feed it to `cellToAlpha`.
- **`BoardSquare` emits STRING cell ids** (`e.target.id`) — `Number()`-coerce before any
  comparison/arithmetic (a strict `===` here silently broke rotation input once).
- **position-stats `nextMoves[].move` are ALREADY LOCAL** (server applies
  `rotateMoveToLocalRotation`); the response `rotation` field is informational —
  re-applying it double-rotates. Candidates are symmetry-reduced in proportion to the
  position's symmetry (octant for a lone center stone) — that's correct, not a bug.
- **Two distinct rotations**: DB canonical→local (server-side, done) vs the user's board
  view-rotation (`selectRotation` + `symCell`, applied at render; inverse-map clicks).
- **RTK Query `data` retains the previous arg's result while fetching** — any
  "open X by id" effect must gate on the response matching the requested id
  (`data.header.gid === openingGid` pattern) or it opens stale data.
- **Heat scale** is green→red, min-max normalized across the *displayed* candidates
  (mobile-app parity; deliberate override of the CVD-safe palette). Occupied cells are
  excluded from domain + render (`usableCandidates`).
- **Board size is width-based only** (`width:100%, maxWidth:640, aspectRatio:1/1,
  flexShrink:0`) — it must never shrink when trays grow; the column scrolls instead.
- `dev.lazyCompilation` stays **false** (cold-load blank-screen bug) and `gameTab.js`
  must not import from the shell/features (madge cycle → factory-undefined blank).
- Commits: always `git commit -S` (gpg hiccup after reboot: `gpgconf --kill all`).

## Process
- Ledger (source of truth for state/decisions):
  `../pente.org/.superpowers/sdd/progress.md`. Plans: `../docs/superpowers/plans/`.
  Research extracts (format/contract authorities): `../docs/superpowers/plans/research/pentedb/`.
- The backend stack on this machine **is production-adjacent**: read-only queries fine,
  writes only via test accts to `webdb_*`, never deploy/restart/DDL without the owner.
- Deploy is owner-run: `../pente.org/docs/webdb-deploy-checklist.md`
  (SQL → image rebuild → `sync_gameServer.sh` → verify).
- Current phase: beta iteration with a tester — reproduce feedback live against :3000
  before fixing; never dismiss a user-seen symptom without reproducing a working state.
