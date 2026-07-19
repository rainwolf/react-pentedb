import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Placeholder — the threats overlay panel is explicitly Phase 4 per the Task 5 brief.
export default function ThreatsPanel() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2">Threats</Typography>
      <Typography variant="body2" color="text.secondary">
        Threats coming in Phase 4.
      </Typography>
    </Box>
  );
}
