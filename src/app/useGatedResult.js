// useGatedResult - closes the RTK Query "data retains the previous arg's result while fetching"
// hazard across a caller-defined KEY. `key` names everything that must never bleed from an old
// answer into a new one (game, scope, applied filters...); args that may keep their stale data
// while refetching (the move line - no flicker while stepping) stay out of the key.
// Returns the query result with `data` undefined while a different-keyed fetch is in flight.
import { useRef } from 'react';

export default function useGatedResult(result, key) {
  const settledKey = useRef(null);
  const settled = result.currentData !== undefined || (!result.isFetching && !result.error);
  if (settled) settledKey.current = key;
  if (settled || settledKey.current === key) return result;
  return { ...result, data: undefined };
}

// Stable string key for a (game, scope, filters) triple.
export function resultKey(game, scope, filters) {
  return `${game}|${scope}|${JSON.stringify(filters ?? null)}`;
}
