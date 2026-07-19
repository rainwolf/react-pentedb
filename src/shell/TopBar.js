import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';

// Top app bar: title, a hamburger button (medium breakpoint only — opens the left
// search-panel drawer) and a light/dark theme toggle.
export default function TopBar({ mode, onToggleTheme, onOpenDrawer, showMenuButton }) {
  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar variant="dense">
        {showMenuButton && (
          <IconButton edge="start" aria-label="Open search panel" onClick={onOpenDrawer} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
        )}
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          pentedb
        </Typography>
        <IconButton
          aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={onToggleTheme}
        >
          {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
