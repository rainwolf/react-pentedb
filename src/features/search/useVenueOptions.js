// Derives the cascading variant -> site -> event option lists FilterForm needs from a
// single useVenuesQuery() call (venues.variants[].sites[].events[] per the Phase 1
// /api/db/venues response shape).
import { useVenuesQuery } from '../../app/api';

export default function useVenueOptions(game, siteName) {
  const { data, isLoading, isFetching } = useVenuesQuery();
  const variants = (data && data.variants) || [];
  const variant = variants.find((v) => v.game === game) || null;
  const sites = (variant && variant.sites) || [];
  const site = sites.find((s) => s.name === siteName) || null;
  const events = (site && site.events) || [];
  return { variants, sites, events, isLoading: Boolean(isLoading || isFetching) };
}
