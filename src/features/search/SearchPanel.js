// Search panel. Composes the ScopeToggle (Archive/Mine/Both, logged-in only), an Import button
// (logged-in only) that opens the ImportDialog, and two inner tabs: the FilterForm and "My games"
// (the personal collection). The form only edits the ONE shared applied filter set in the ui
// slice. Below the form (Search tab) sits the single "Games through here" ResultsList: it takes
// the same debounced position (useDebouncedPosition(150)), effective scope and applied filters as
// the explorer's stats query, so the two always agree. The explorer panel no longer has a list.
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { usePingQuery } from '../../app/api';
import { selectScope, selectEffectiveScope, selectFilters } from '../../app/uiSlice';
import { switchToVariant, selectActivePosition } from '../../model/docSlice';
import FilterForm from './FilterForm';
import ResultsList from './ResultsList';
import useDebouncedPosition from '../explorer/useDebouncedPosition';
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
  // Same derivation as ExplorerPanel so the list and the stats share one position/scope/filter set.
  const pos = useDebouncedPosition(150);
  const scope = selectEffectiveScope(authName, useSelector(selectScope));
  const filters = useSelector(selectFilters);

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
          <Divider sx={{ mt: 1 }} />
          <Box sx={{ px: 1, pt: 1 }}>
            <Typography variant="subtitle2">Games through here</Typography>
          </Box>
          {pos ? (
            <ResultsList game={pos.game} scope={scope} filters={filters} moves={pos.moves} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>
              Open a game or scratch board to list games through a position.
            </Typography>
          )}
        </>
      )}
      {tab === 'mine' && <CollectionList game={activeGame ?? 1} />}

      {importOpen && <ImportDialog open onClose={() => setImportOpen(false)} />}
    </Box>
  );
}
