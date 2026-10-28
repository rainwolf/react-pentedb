// useGatedResult - closes the RTK Query "data retains the previous arg's result while fetching"
// hazard. Every new query (any arg change: move line, game, scope, filters...) shows NOTHING until
// its own response lands: while `currentData` is undefined and the request is in flight (or failed),
// `data` is returned undefined, so no stale heat / candidate rows / games list is painted.
// `isFetching` is untouched so loading indicators keep working. Results without `currentData`
// (plain mocks) pass through when settled.
export default function useGatedResult(result) {
  if (result.currentData !== undefined) return result;
  if (!result.isFetching && !result.error) return result;
  return { ...result, data: undefined };
}
