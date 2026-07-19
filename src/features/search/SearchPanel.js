// Search panel (P3 Task 6 wires the real auth/scope/import affordances over the P2 skeleton).
// Composes the ScopeToggle (Archive/Mine/Both, logged-in only), an Import button (logged-in
// only) that opens the ImportDialog, and two inner tabs: archive/scope search (FilterForm +
// ResultsList) and "My games" (the personal collection). The scope comes from the ui slice, so
// this panel's results and the ExplorerPanel's stats always agree on which corpus they show.
import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { usePingQuery } from '../../app/api';
import { selectScope } from '../../app/uiSlice';
import FilterForm from './FilterForm';
import ResultsList from './ResultsList';
import ScopeToggle from '../collection/ScopeToggle';
import CollectionList from '../collection/CollectionList';
import ImportDialog from '../exchange/ImportDialog';

export default function SearchPanel() {
  const [game, setGame] = useState(1);
  const [filters, setFilters] = useState(null);
  const [tab, setTab] = useState('search');
  const [importOpen, setImportOpen] = useState(false);

  const { data: ping } = usePingQuery();
  const authName = ping?.auth ?? null;
  const scope = useSelector(selectScope);

  const handleSubmit = useCallback(({ game: g, filters: f }) => {
    setGame(g);
    setFilters(f);
  }, []);

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
          <FilterForm initialGame={game} onSubmit={handleSubmit} />
          <Divider />
          <ResultsList game={game} scope={scope} filters={filters} />
        </>
      )}
      {tab === 'mine' && <CollectionList game={game} />}

      {importOpen && <ImportDialog open onClose={() => setImportOpen(false)} />}
    </Box>
  );
}
