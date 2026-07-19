import { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

import { usePingQuery } from '../../app/api';

// Where pente.org's (non-SPA, session-cookie-setting) login page sends the browser back
// to on success: this app's own current URL, full same-origin navigation so the session
// cookie login.jsp sets is shared with this app.
function loginUrl() {
  const ret = typeof window !== 'undefined' ? window.location.href : '';
  return `/gameServer/login.jsp?return=${encodeURIComponent(ret)}`;
}

// TopBar's login/account affordance: a "Log in" link while anonymous, or the user's name
// (opens a menu with Log out) once `/api/db/ping` reports a session. Logout hits the
// (non-SPA) /gameServer/logout endpoint, then refetches ping so the UI drops back to the
// login link — RTK Query's cache, not local state, is the source of truth throughout.
export default function UserMenu() {
  const { data, refetch } = usePingQuery();
  const [anchorEl, setAnchorEl] = useState(null);
  const authName = data?.auth ?? null;

  if (!authName) {
    return (
      <Button color="inherit" href={loginUrl()}>
        Log in
      </Button>
    );
  }

  const open = Boolean(anchorEl);

  const handleLogout = async () => {
    setAnchorEl(null);
    try {
      await fetch('/gameServer/logout', { credentials: 'include' });
    } finally {
      refetch();
    }
  };

  return (
    <>
      <Button
        color="inherit"
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        startIcon={<AccountCircleIcon />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        {authName}
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={handleLogout}>Log out</MenuItem>
      </Menu>
    </>
  );
}
