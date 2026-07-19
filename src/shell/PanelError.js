// Shared panel error state (P3 Task 6, folding in the Phase-2 pickup). The list/stat panels
// (ResultsList, ExplorerPanel, CollectionList) previously rendered an RTK Query error the same
// as an empty result ("No games found"), which silently hid 401s and 500s — and now that the
// mine/both scopes can 401 when the session lapses, an invisible failure is a real bug. This
// module gives all three one message-derivation rule and one tiny presentational component so
// the failure is always visible and worded the same way.
//
// The JsonHttp error envelope (see api.js): `error.status` is the HTTP status and
// `error.data.error.message` carries the server's human message for non-2xx responses.
import Typography from '@mui/material/Typography';

// error -> user-facing string (or null when there is no error). A 401 is special-cased to a
// sign-in nudge because it is the expected failure when an anonymous/expired session hits a
// mine/both query; everything else prefers the server's own message, falling back to a generic
// line when the envelope is absent (e.g. a network error with no body).
export function panelErrorMessage(error) {
  if (!error) return null;
  if (error.status === 401) return 'Sign in to view this.';
  const msg = error.data && error.data.error && error.data.error.message;
  return msg || 'Something went wrong loading this.';
}

export default function PanelError({ error }) {
  const message = panelErrorMessage(error);
  if (!message) return null;
  return (
    <Typography variant="body2" color="error" sx={{ px: 2, py: 1 }} role="alert">
      {message}
    </Typography>
  );
}
