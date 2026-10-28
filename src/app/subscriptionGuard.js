// A 403 {error:{code:"subscription_required"}} from any /api/db endpoint means the session's
// database access is gone (e.g. subscription expired mid-session). Refetch `ping` so
// `dbAccess` flips to false and AccessGate swaps the app for the gate card.
import { isRejectedWithValue } from '@reduxjs/toolkit';
import { api } from './api';

export const subscriptionGuard = (storeApi) => (next) => (action) => {
  const result = next(action);
  if (
    isRejectedWithValue(action) &&
    action.meta?.arg?.endpointName !== 'ping' &&
    action.payload?.status === 403 &&
    action.payload?.data?.error?.code === 'subscription_required'
  ) {
    storeApi.dispatch(api.endpoints.ping.initiate(undefined, { forceRefetch: true })).unsubscribe();
  }
  return result;
};
