// Search panel. Composes the ScopeToggle (Archive/Mine/Both, logged-in only), an Import button
// (logged-in only) that opens the ImportDialog, and two inner tabs: the FilterForm and "My games"
// (the personal collection). The form only edits the ONE shared applied filter set in the ui
// slice; there is no list here - the explorer's stats and its single games-through-position list
// both consume that same set (and the same scope), so they always agree.
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { usePingQuery } from '../../app/api';
import { switchToVariant, selectActivePosition } from '../../model/docSlice';
import FilterForm from './FilterForm';
import ScopeToggle from '../collection/ScopeToggle';
import CollectionList from '../collection/CollectionList';
import ImportDialog from '../exchange/ImportDialog';

export default function SearchPanel() {
  const dispatch = useDispatch();
  const activePos = useSelector(selectActivePosition);
  const activeGame = activePos ? activePos.game : undefined;
  const [tab, setTab] = useState('search');
  const [importOpen, setImportOpen] = useState(false);

  const { data: ping } = usePingQuery();
  const authName = ping?.auth ?? null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <Box sx={{ px: 1, pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2">Search</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScopeToggle />
          {authName && (
            <Button size="small" startIcon={<UploadFileIcon fontSize="small" />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
          )}
        </Box>
      </Box>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="fullWidth">
        <Tab value="search" label="Search" />
        <Tab value="mine" label="My games" />
      </Tabs>

      {tab === 'search' && (
        <>
          <FilterForm initialGame={activeGame ?? 1} syncGame={activeGame} onVariantChange={(g) => dispatch(switchToVariant(g))} />
        </>
      )}
      {tab === 'mine' && <CollectionList game={activeGame ?? 1} />}

      {importOpen && <ImportDialog open onClose={() => setImportOpen(false)} />}
    </Box>
  );
}
