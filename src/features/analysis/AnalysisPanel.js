import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Placeholder narrow-layout tab — analysis workspace tooling is out of scope for the
// Task 5 shell (viewer interaction / analysis editing land in later tasks).
export default function AnalysisPanel() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2">Analysis</Typography>
      <Typography variant="body2" color="text.secondary">
        Analysis tools coming soon.
      </Typography>
    </Box>
  );
}
