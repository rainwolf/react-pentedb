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

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
