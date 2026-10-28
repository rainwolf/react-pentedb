// usePositionStats - usePositionStatsQuery with the RTK "data retains the previous arg's result
// while fetching" hazard closed (useGatedResult): a new query (new move line, game, scope or
// filters) clears `data` until its own response arrives, and an error never shows the previous
// result. Returns the query result with `data` gated.
import { usePositionStatsQuery } from '../../app/api';
import useGatedResult from '../../app/useGatedResult';

export default function usePositionStats(arg, options) {
  return useGatedResult(usePositionStatsQuery(arg, options));
}
