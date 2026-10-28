// Subscriber-only gate. Renders the routed app (<Outlet/>) ONLY once `/api/db/ping` confirms
// dbAccess; until then nothing that fires data queries is mounted (gate rendering, not hiding).
// The TopBar stays visible: it only uses ping (login/logout) and the theme toggle.
import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { usePingQuery } from '../app/api';
import { hasDbAccess, loginUrl, SUBSCRIPTIONS_URL } from '../features/auth/access';
import { useThemeModeContext } from './theme';
import TopBar from './TopBar';

function GateCard({ children }) {
  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper sx={{ p: 4, maxWidth: 460, textAlign: 'center' }} data-testid="access-gate">
        {children}
      </Paper>
    </Box>
  );
}

export default function AccessGate() {
  const { data, isLoading, isError, refetch } = usePingQuery();
  const [mode, toggleTheme] = useThemeModeContext();

  if (!isLoading && !isError && hasDbAccess(data)) return <Outlet />;

  const authName = data?.auth ?? null;
  let body;
  if (isLoading) {
    body = (
      <Box sx={{ textAlign: 'center' }} role="status" aria-label="Checking access">
        <CircularProgress />
      </Box>
    );
  } else if (isError) {
    body = (
      <>
        <Typography variant="h6" gutterBottom>
          Could not check your access
        </Typography>
        <Button variant="contained" onClick={() => refetch()}>
          Retry
        </Button>
      </>
    );
  } else if (!authName) {
    body = (
      <>
        <Typography variant="h6" gutterBottom>
          The Pente.org database is available to subscribers
        </Typography>
        <Button variant="contained" href={loginUrl()}>
          Log in
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <Typography variant="h6" gutterBottom>
          The Pente.org database is available to subscribers
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          It is open to <Link href={SUBSCRIPTIONS_URL}>subscribers</Link>, or to new players with at
          least 1 game within their first 2 months.
        </Typography>
        <Button variant="contained" href={SUBSCRIPTIONS_URL}>
          View subscriptions
        </Button>
      </>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar mode={mode} onToggleTheme={toggleTheme} showMenuButton={false} />
      <GateCard>{body}</GateCard>
    </Box>
  );
}
