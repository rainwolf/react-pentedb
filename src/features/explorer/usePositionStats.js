// usePositionStats - usePositionStatsQuery with the RTK "data retains the previous arg's result
// while fetching" hazard closed across game, scope AND applied-filter changes (useGatedResult).
// Switching variant or changing a filter re-keys the query, but `data` keeps the old answer until
// the new response lands; the explorer/heat would then show numbers for the wrong game/filters as
// if current. Within one (game, scope, filters) the retained data is kept (no flicker while
// stepping through moves). Returns the query result with `data` gated.
import { usePositionStatsQuery } from '../../app/api';
import useGatedResult, { resultKey } from '../../app/useGatedResult';

export default function usePositionStats(arg, options) {
  const result = usePositionStatsQuery(arg, options);
  const key = arg ? resultKey(arg.game, arg.scope, arg.filters) : '';
  return useGatedResult(result, key);
}
