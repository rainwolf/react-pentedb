// displayedCandidates — the ONE candidate set the explorer shows: drop cells already on the
// board, order by the chosen sort, then keep the first `limit`. ExplorerPanel (list) and
// BoardHeatOverlay (board heat) both call this, so they cannot diverge; heat domain is then
// computed over exactly these displayed moves.
import { sortedRows } from './StatsRows';
import { usableCandidates } from './heatScale';

export const DEFAULT_EXPLORER_LIMIT = 20;

export function displayedCandidates(nextMoves = [], moves = [], sortMode = 'winrate', limit = DEFAULT_EXPLORER_LIMIT) {
  const n = Number.isInteger(limit) && limit >= 1 ? limit : DEFAULT_EXPLORER_LIMIT;
  return sortedRows(usableCandidates(nextMoves, moves), sortMode).slice(0, n);
}
