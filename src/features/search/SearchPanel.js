// Real search panel (replaces the placeholder): scope toggle (Archive-only until Phase 3
// wires auth UI) + FilterForm + ResultsList, composed here and wired to the live game/
// filters state. Lazy-loaded from Workbench.js — this file's own export stays the same
// default-export shape the lazy() call already expects.
import React, { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import FilterForm from './FilterForm';
import ResultsList from './ResultsList';

export default function SearchPanel() {
  const [game, setGame] = useState(1);
  const [filters, setFilters] = useState(null);

  const handleSubmit = useCallback(({ game: g, filters: f }) => {
    setGame(g);
    setFilters(f);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <Box sx={{ px: 1, pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">Search</Typography>
        <Tooltip title="Personal collection search arrives with sign-in (Phase 3)">
          <span>
            <ToggleButtonGroup value="archive" exclusive size="small" aria-label="Search scope">
              <ToggleButton value="archive" aria-label="Archive">
                Archive
              </ToggleButton>
              <ToggleButton value="mine" aria-label="Mine" disabled>
                Mine
              </ToggleButton>
              <ToggleButton value="both" aria-label="Both" disabled>
                Both
              </ToggleButton>
            </ToggleButtonGroup>
          </span>
        </Tooltip>
      </Box>
      <FilterForm initialGame={game} onSubmit={handleSubmit} />
      <Divider />
      <ResultsList game={game} scope="archive" filters={filters} />
    </Box>
  );
}
