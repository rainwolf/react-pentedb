import React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Typography from '@mui/material/Typography';

// Document tab strip above the board — one tab per open docSlice tab (game / analysis /
// scratch). Clicking the label activates the tab; the (x) closes it.
//
// Built from plain Box/ButtonBase rather than MUI's Tabs/Tab: Tab renders a <button>, and
// nesting the close IconButton's <button> inside it would be invalid HTML. Keeping label
// and close as SIBLINGS avoids that while staying visually equivalent.
export default function PanelTabs({ tabs, activeTabId, onActivate, onClose }) {
  if (!tabs.length) {
    return (
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" color="text.secondary">
          No documents open
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      role="tablist"
      aria-label="Open documents"
      sx={{ display: 'flex', overflowX: 'auto', borderBottom: 1, borderColor: 'divider' }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const label = tab.title || '(untitled)';
        return (
          <Box
            key={tab.id}
            role="tab"
            aria-selected={active}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              pl: 1,
              pr: 0.5,
              py: 0.5,
              flexShrink: 0,
              borderBottom: 2,
              borderColor: active ? 'primary.main' : 'transparent',
              bgcolor: active ? 'action.selected' : 'transparent',
            }}
          >
            <ButtonBase onClick={() => onActivate(tab.id)} sx={{ px: 0.5, borderRadius: 1 }}>
              <Typography variant="body2" noWrap title={label} sx={{ maxWidth: 140 }}>
                {label}
                {tab.dirty ? ' *' : ''}
              </Typography>
            </ButtonBase>
            <IconButton
              size="small"
              aria-label={`Close ${label}`}
              onClick={() => onClose(tab.id)}
              sx={{ p: 0.25 }}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </Box>
        );
      })}
    </Box>
  );
}
