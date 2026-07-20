// "My analyses" left-panel tab (P3 Task 3): the signed-in user's saved analyses. Each row
// opens the analysis as a docSlice tab (fetching its tree on demand), delete asks for
// confirmation then hits useDeleteAnalysisMutation (which invalidates the Analyses list tag
// so this list refetches). Anonymous users get a sign-in hint instead of a list.
//
// Opening is STORE-FIRST (mirrors search/ResultsList): we openTab/activateTab directly and
// let Workbench's activePos->URL sync push /a/:aid. Navigating the router first instead
// races that sync effect (while a different tab is still active it reverts the URL), so the
// analysis would never load. Reusing the `a:<aid>` tab-id convention keeps a row-open and a
// direct /a/:aid visit resolving to the SAME tab.
//
// Auth is read via usePingQuery (UserMenu's precedent); the list query is skipped while
// anonymous so no 401 is fired.
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

import { usePingQuery, useAnalysesQuery, useAnalysisQuery, useDeleteAnalysisMutation } from '../../app/api';
import { openTab, activateTab } from '../../model/docSlice';
import { fromWire } from '../../model/gameTree';
import { variantKey } from '../../board/boardGeometry';
import PanelError from '../../shell/PanelError';

function updatedLabel(updated) {
  if (updated == null) return '';
  const d = new Date(updated);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function AnalysesList() {
  const dispatch = useDispatch();
  const tabs = useSelector((s) => s.docs.tabs);
  const { data: ping } = usePingQuery();
  const authName = ping?.auth ?? null;
  const { data, isLoading, isError, error } = useAnalysesQuery(undefined, { skip: !authName });
  const [deleteAnalysis, { isLoading: deleting }] = useDeleteAnalysisMutation();
  const [confirm, setConfirm] = useState(null); // { aid, name } pending deletion
  const [openingAid, setOpeningAid] = useState(null); // aid whose tree is being fetched to open
  const [openError, setOpenError] = useState(null); // a failed open (404/500/etc.) to surface
  const openingQuery = useAnalysisQuery(openingAid, { skip: openingAid == null });

  // Open (or re-activate) the clicked analysis's tab once ITS OWN tree has loaded. Same
  // stale-read guard as search/ResultsList: RTK Query keeps the PREVIOUSLY-opened analysis in
  // `data` while a new aid is still fetching, so opening on `data` alone would build an
  // a:<new> tab carrying the prior analysis's name/tree (and then setOpeningAid(null) cancels
  // the real fetch, so it never recovers). Gate on the response's own aid (GET /analyses/{aid}
  // returns {aid,name,game,tree}) matching openingAid, and !isFetching.
  useEffect(() => {
    if (openingAid == null) return;
    const id = `a:${openingAid}`;
    if (tabs.some((t) => t.id === id)) {
      dispatch(activateTab(id)); // store-first dedup: reuse the existing a:<aid> tab
      setOpeningAid(null);
      return;
    }
    if (openingQuery.isError) {
      setOpenError(openingQuery.error); // surface 404/500/etc. instead of spinning forever
      setOpeningAid(null);
      return;
    }
    const d = openingQuery.data;
    if (openingQuery.isFetching || !d || d.aid !== openingAid) {
      return; // still fetching, or `data` is the PREVIOUS analysis's — wait for THIS aid
    }
    dispatch(
      openTab({ id, kind: 'analysis', title: d.name, game: d.game, aid: openingAid, tree: fromWire(d.tree) })
    );
    setOpeningAid(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingAid, openingQuery.data, openingQuery.isFetching, openingQuery.isError]);

  const handleOpen = (aid) => {
    const id = `a:${aid}`;
    if (tabs.find((t) => t.id === id)) {
      dispatch(activateTab(id));
      return;
    }
    setOpenError(null); // clear any prior failed-open before starting a new one
    setOpeningAid(aid);
  };

  if (!authName) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          My analyses
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Log in to see and save your analyses.
        </Typography>
      </Box>
    );
  }

  const analyses = (data && data.analyses) || [];

  const runDelete = async () => {
    if (!confirm) return;
    try {
      await deleteAnalysis(confirm.aid).unwrap();
    } catch {
      /* leave the list as-is; the tag stays valid so nothing vanished */
    } finally {
      setConfirm(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <Box sx={{ px: 2, pt: 1 }}>
        <Typography variant="subtitle2">My analyses</Typography>
      </Box>
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={18} />
        </Box>
      )}
      <PanelError error={error || openError} />
      {!isLoading && !isError && analyses.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
          No saved analyses yet.
        </Typography>
      )}
      <List dense disablePadding>
        {analyses.map((a) => (
          <ListItem
            key={a.aid}
            disablePadding
            secondaryAction={
              <IconButton
                edge="end"
                size="small"
                aria-label={`Delete ${a.name || 'analysis'}`}
                onClick={() => setConfirm({ aid: a.aid, name: a.name })}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemButton onClick={() => handleOpen(a.aid)}>
              <ListItemText
                primary={a.name || '(untitled)'}
                secondary={`${variantKey(a.game)}${updatedLabel(a.updated) ? ` · ${updatedLabel(a.updated)}` : ''}`}
                primaryTypographyProps={{ noWrap: true }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} aria-labelledby="delete-analysis-title">
        <DialogTitle id="delete-analysis-title">Delete analysis?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete “{confirm ? confirm.name || '(untitled)' : ''}”? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button onClick={runDelete} color="error" variant="contained" disabled={deleting}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
