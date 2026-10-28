// Auth state has no reducer of its own: the RTK Query `ping` endpoint's cache IS the
// source of truth (single source of truth avoids a slice/cache sync bug). This module
// just exposes the BINDING selector every later Phase-3 task gates rendering on.
import { api } from '../../app/api';
import { hasDbAccess } from './access';

const selectPingResult = api.endpoints.ping.select();

// state -> string|null: the logged-in username from the last resolved /api/db/ping, or
// null when anonymous, not yet loaded, or errored.
export function selectAuthName(state) {
  return selectPingResult(state)?.data?.auth ?? null;
}

// state -> boolean: backend-reported database access from the last resolved ping. False while
// loading, on error, anonymous, or when the field is missing (fail closed).
export function selectDbAccess(state) {
  return hasDbAccess(selectPingResult(state)?.data);
}
