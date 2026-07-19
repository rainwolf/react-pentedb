import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Placeholder — the search panel (games search / filters) lands in P2 Task 7. Lazy-loaded
// from Workbench so its (future) real implementation doesn't bloat the main chunk.
export default function SearchPanel() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2">Search</Typography>
      <Typography variant="body2" color="text.secondary">
        Game search coming soon.
      </Typography>
    </Box>
  );
}
