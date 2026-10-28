// Subscriber-only gate: pure helpers (no api import, so they are safe to use from modules
// whose tests mock '../app/api').
//
// Access rule (mirrors legacy database.jsp): the BACKEND decides — `ping` reports
// `dbAccess` = pdata.databaseAccess() || (registered within the last 60 days && totalGames > 0).
// A missing / non-boolean field is treated as NO access (fail closed).
export function hasDbAccess(pingData) {
  return pingData?.dbAccess === true;
}

export const SUBSCRIPTIONS_URL = '/gameServer/subscriptions';

export function loginUrl() {
  const ret = typeof window !== 'undefined' ? window.location.href : '';
  return `/gameServer/login.jsp?return=${encodeURIComponent(ret)}`;
}
