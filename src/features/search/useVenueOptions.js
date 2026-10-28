// Derives the cascading variant -> site -> event option lists FilterForm needs from a
// single useVenuesQuery() call (venues.variants[].sites[].events[] per the Phase 1
// /api/db/venues response shape).
import { useVenuesQuery } from '../../app/api';

// Drops variants whose name duplicates an earlier one, keeping the lowest game id per name
// (the server also leaks turn-based ids such as 77:Swap2-Pente next to 1..32). Input order
// of the survivors is preserved.
export function dedupeVariants(variants) {
  const lowest = new Map();
  for (const v of variants) {
    const cur = lowest.get(v.name);
    if (cur === undefined || v.game < cur) lowest.set(v.name, v.game);
  }
  return variants.filter((v) => lowest.get(v.name) === v.game);
}

export default function useVenueOptions(game, siteName) {
  const { data, isLoading, isFetching } = useVenuesQuery();
  const variants = dedupeVariants((data && data.variants) || []);
  const variant = variants.find((v) => v.game === game) || null;
  const sites = (variant && variant.sites) || [];
  const site = sites.find((s) => s.name === siteName) || null;
  const events = (site && site.events) || [];
  return { variants, sites, events, isLoading: Boolean(isLoading || isFetching) };
}
