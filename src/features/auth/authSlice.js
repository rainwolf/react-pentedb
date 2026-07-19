// Auth state has no reducer of its own: the RTK Query `ping` endpoint's cache IS the
// source of truth (single source of truth avoids a slice/cache sync bug). This module
// just exposes the BINDING selector every later Phase-3 task gates rendering on.
import { api } from '../../app/api';

const selectPingResult = api.endpoints.ping.select();

// state -> string|null: the logged-in username from the last resolved /api/db/ping, or
// null when anonymous, not yet loaded, or errored.
export function selectAuthName(state) {
  return selectPingResult(state)?.data?.auth ?? null;
}
