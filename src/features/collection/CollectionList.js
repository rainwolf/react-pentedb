// Personal collection list (P3 Task 6). Mirrors search/ResultsList — offset-paginated rows of
// GameHeaders — but over useCollectionQuery (source "mine", gid == wgid) and with a per-row
// delete. Auth-gated: anonymous users get a sign-in hint and the query is skipped so no 401 is
// fired; a query error is surfaced visibly via the shared PanelError (the Phase-2 pickup).
//
// Row open is STORE-FIRST (mirrors ResultsList / AnalysesList): fetch the collection game's
// moves on demand, then openTab directly and let Workbench's activePos→URL sync follow. The
// tab id is namespaced `w:<wgid>` so a personal game never collides with an archive `/g/:gid`.
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

import {
  usePingQuery,
  useCollectionQuery,
  useCollectionGameQuery,
  useDeleteCollectionGameMutation,
} from '../../app/api';
import { openTab, activateTab } from '../../model/docSlice';
import { createTree, addMove } from '../../model/gameTree';
import PanelError from '../../shell/PanelError';
import WinnerStone from '../search/WinnerStone';

const PAGE_SIZE = 25;

function playerLabel(p) {
  if (!p) return 'Unknown';
  return p.rating != null ? `${p.name} (${p.rating})` : p.name;
}

function buildTreeFromMoves(moves) {
  let res = { tree: createTree(), path: [] };
  for (const m of moves || []) res = addMove(res.tree, res.path, m);
  return res;
}

function gameTitle(header) {
  const p1 = header && header.player1 && header.player1.name;
  const p2 = header && header.player2 && header.player2.name;
  if (p1 || p2) return `${p1 || 'Unknown'} vs ${p2 || 'Unknown'}`;
  return header && header.gid != null ? `Game ${header.gid}` : 'Game';
}

export default function CollectionList({ game }) {
  const dispatch = useDispatch();
  const tabs = useSelector((s) => s.docs.tabs);
  const { data: ping } = usePingQuery();
  const authName = ping?.auth ?? null;

  const [offset, setOffset] = useState(0);
  const [openingWgid, setOpeningWgid] = useState(null);
  const [confirm, setConfirm] = useState(null); // { wgid, label } pending deletion

  const { data, isFetching, error } = useCollectionQuery(
    { game, offset, limit: PAGE_SIZE },
    { skip: !authName }
  );
  const [deleteGame, { isLoading: deleting }] = useDeleteCollectionGameMutation();

  const games = (data && data.games) || [];
  const total = (data && data.total) || 0;

  // A new game filter resets to page 1.
  useEffect(() => {
    setOffset(0);
  }, [game]);

  const openingQuery = useCollectionGameQuery(openingWgid, { skip: openingWgid == null });
  useEffect(() => {
    if (openingWgid == null || !openingQuery.data) return;
    const id = `w:${openingWgid}`;
    const existing = tabs.find((t) => t.id === id);
    if (existing) {
      dispatch(activateTab(id));
    } else {
      const header = openingQuery.data.header || {};
      const { tree, path } = buildTreeFromMoves(openingQuery.data.moves || []);
      dispatch(
        openTab({ id, kind: 'game', title: gameTitle({ ...header, gid: openingWgid }), game: header.game || game, gid: openingWgid, tree, cursorPath: path })
      );
    }
    setOpeningWgid(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingWgid, openingQuery.data]);

  const handleRowClick = (header) => {
    const id = `w:${header.gid}`;
    if (tabs.find((t) => t.id === id)) {
      dispatch(activateTab(id));
      return;
    }
    setOpeningWgid(header.gid);
  };

  const runDelete = async () => {
    if (!confirm) return;
    try {
      await deleteGame(confirm.wgid).unwrap();
    } catch {
      /* tag stays valid; nothing vanished */
    } finally {
      setConfirm(null);
    }
  };

  if (!authName) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          My games
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Log in to import and manage your personal collection.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <PanelError error={error} />
      <Box sx={{ maxHeight: 56 * 7, overflowY: 'auto' }} data-testid="collection-viewport">
        {games.map((h) => (
          <Box
            key={h.gid}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              height: 56,
              borderBottom: 1,
              borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <WinnerStone header={h} />
            <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => handleRowClick(h)}>
              <Typography variant="body2" noWrap>
                {playerLabel(h.player1)} vs {playerLabel(h.player2)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {h.event || h.site || ''} {h.playDate ? new Date(h.playDate).toLocaleDateString() : ''}
              </Typography>
            </Box>
            {openingWgid === h.gid && <CircularProgress size={14} />}
            <IconButton
              edge="end"
              size="small"
              aria-label={`Delete ${playerLabel(h.player1)} vs ${playerLabel(h.player2)}`}
              onClick={() => setConfirm({ wgid: h.gid, label: `${playerLabel(h.player1)} vs ${playerLabel(h.player2)}` })}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {!error && games.length === 0 && !isFetching && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No games in your collection yet.
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.5 }}>
        <Typography variant="caption">
          {total === 0 ? 'Showing 0 of 0' : `Showing ${offset + 1}–${offset + games.length} of ${total}`}
        </Typography>
        <Box>
          <IconButton aria-label="Previous page" size="small" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <IconButton aria-label="Next page" size="small" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      {isFetching && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 0.5 }}>
          <CircularProgress size={16} />
        </Box>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} aria-labelledby="delete-collection-title">
        <DialogTitle id="delete-collection-title">Delete game?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete “{confirm ? confirm.label : ''}” from your collection? This cannot be undone.
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
