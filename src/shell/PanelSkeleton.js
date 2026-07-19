import React from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

// Suspense fallback for the lazy-loaded feature panels (spec §14).
export default function PanelSkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="rectangular" height={80} sx={{ mt: 1 }} />
      <Skeleton variant="text" width="40%" sx={{ mt: 1 }} />
    </Box>
  );
}
