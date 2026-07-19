import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Placeholder — the position explorer lands in P2 Task 8. Lazy-loaded from Workbench so
// its (future) real implementation doesn't bloat the main chunk.
export default function ExplorerPanel() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2">Explorer</Typography>
      <Typography variant="body2" color="text.secondary">
        Position explorer coming soon.
      </Typography>
    </Box>
  );
}
