// Dependency-free tab/URL/title helpers shared by the shell (Workbench.js) and the
// feature panels (e.g. search/ResultsList.js). Extracted from Workbench.js to break a
// module-init cycle: Workbench.js lazy-imports the panels, and a panel importing these
// helpers back from Workbench.js formed Workbench -> ExplorerPanel/SearchPanel ->
// ResultsList -> Workbench. That cycle left one module's factory unregistered on cold
// load, which surfaced as a blank first render ("factory is undefined") that only a
// reload — warming the module cache — could paper over. Keep this module a leaf: it may
// only import other leaves (the pure gameTree model), never the shell or any feature.
import { createTree, addMove } from '../model/gameTree';

// No prefs feature yet — the root route's default scratch tab always starts as pente
// (variant 1) until a preferences slice supplies a real default.
export const DEFAULT_GAME = 1;

export function gameTitle(header) {
  if (!header) return 'Game';
  const p1 = header.player1 && header.player1.name;
  const p2 = header.player2 && header.player2.name;
  if (p1 && p2) return `${p1} vs ${p2}`;
  if (p1 || p2) return p1 || p2;
  return header.gid != null ? `Game ${header.gid}` : 'Game';
}

// Parses the `/p/:game/:moves` params into {game, cells}, or null if malformed —
// dash-separated non-negative ints, e.g. "180-199-210" (spec §8). Malformed params are
// the route's invalid-input case ("invalid -> redirect /").
export function parsePositionParams(gameParam, movesParam) {
  const gameNum = Number(gameParam);
  if (!Number.isInteger(gameNum) || gameNum <= 0) return null;
  if (!movesParam) return null;
  const parts = movesParam.split('-');
  const cells = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    cells.push(Number(part));
  }
  if (cells.length === 0) return null;
  return { game: gameNum, cells };
}

// The canonical URL for a tab's current state — game/analysis tabs are addressed by
// id and ignore cursor position; scratch tabs (and any tab without a gid/aid) are
// addressed by their move line via /p/:game/:moves, falling back to '/' at the root
// (no moves played yet, e.g. a brand new scratch tab).
export function canonicalUrl(tab, pos) {
  if (tab.kind === 'game' && tab.gid != null) return `/g/${tab.gid}`;
  if (tab.kind === 'analysis' && tab.aid != null) return `/a/${tab.aid}`;
  if (!pos.moves || pos.moves.length === 0) return '/';
  return `/p/${pos.game}/${pos.moves.join('-')}`;
}

export function buildTreeFromMoves(moves) {
  let tree = createTree();
  let path = [];
  for (const m of moves) {
    ({ tree, path } = addMove(tree, path, m));
  }
  return { tree, path };
}

// The docSlice tab id convention for a loaded game — shared with ResultsList's row-click
// "open at final position" handler so a search result and the /g/:gid route always
// resolve to the SAME tab instead of racing to open a duplicate.
export function gameTabId(gid) {
  return `g:${gid}`;
}
