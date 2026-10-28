// Games list: the explorer's single "games through this position" list. Every request carries the
// shared applied filters + scope together with the current position (desktop parity: one filter set
// feeds both the next-move stats and this list), newest first. Rows stack in pages: the page size
// is a persisted pref (10/25/50/100) and "Show more" appends the next page as its own query.
// Row click loads the full game and opens it as a docSlice tab at its final position, reusing
// Workbench's tab-id convention and tree-building helper so a search result and the /g/:gid route
// resolve to the same tab.
import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import CircularProgress from '@mui/material/CircularProgress';

import { useGamesSearchQuery, useGameQuery, useCollectionGameQuery } from '../../app/api';
import { openTab, activateTab } from '../../model/docSlice';
import {
  selectGamesPageSize,
  setGamesPageSize,
  persistGamesPageSize,
  GAMES_PAGE_SIZES,
} from '../../app/uiSlice';
import useGatedResult, { resultKey } from '../../app/useGatedResult';
import { buildTreeFromMoves, gameTitle, gameTabId } from '../../shell/gameTab';
import PanelError from '../../shell/PanelError';
import WinnerStone from './WinnerStone';

const ROW_HEIGHT = 56;
const VIEWPORT_HEIGHT = ROW_HEIGHT * 7;

// Pure: header text saying what the list ACTUALLY is for a scope. games/search ignores the
// position and the filters for personal ("mine") games, so the label must not claim otherwise.
export function listHeaderLabel(scope, movesLen) {
  const archive = movesLen ? `Games through this position (${movesLen} moves)` : 'All matching games';
  if (scope === 'mine') return 'My games (position and filters not applied)';
  if (scope === 'both') return `${archive}, plus all your games (personal games not position-filtered)`;
  return archive;
}

// Pure: "x of N games" (x = rows currently loaded).
export function gamesCountLabel(shown, total) {
  return `${shown} of ${total} games`;
}

function playerLabel(p) {
  if (!p) return 'Unknown';
  return p.rating != null ? `${p.name} (${p.rating})` : p.name;
}

function GameRow({ header: h, opening, onClick }) {
  return (
    <Box
      data-testid={`result-row-${h.gid}`}
      onClick={() => onClick(h)}
      sx={{
        height: ROW_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        cursor: 'pointer',
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <WinnerStone header={h} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {playerLabel(h.player1)} vs {playerLabel(h.player2)}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {h.event || h.site || ''} {h.playDate ? new Date(h.playDate).toLocaleDateString() : ''}
        </Typography>
      </Box>
      {opening && <CircularProgress size={14} />}
    </Box>
  );
}

// One extra "Show more" page: its own query (offset = page * size), so each page is cached and
// fetched independently while the rows simply stack. Gated on the same key as page 0 so a
// filter/scope/game change never paints an old page under the new answer. Reports how many rows
// it has actually loaded so "x of N" counts loaded rows only.
function MorePage({ index, arg, gateKey, openingId, onRowClick, onCount }) {
  const res = useGatedResult(useGamesSearchQuery(arg), gateKey);
  const games = (res.data && res.data.games) || [];
  useEffect(() => {
    onCount(index, games.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, games.length]);
  return (
    <>
      <PanelError error={res.error} />
      {games.map((h) => (
        <GameRow key={`${h.source}-${h.gid}`} header={h} opening={openingId === rowId(h)} onClick={onRowClick} />
      ))}
    </>
  );
}

// Personal-collection rows (source "mine") carry a wgid in `gid`, not an archive gid.
const isMine = (h) => h.source === 'mine';
const rowId = (h) => (isMine(h) ? `w:${h.gid}` : gameTabId(h.gid));

// Personal games: the same opener CollectionList uses (collection endpoint, tab id `w:<wgid>`).
// A child component so the collection hook only exists while a personal row is being opened.
function CollectionOpener({ wgid, fallbackGame, onDone, onError }) {
  const dispatch = useDispatch();
  const tabs = useSelector((s) => s.docs.tabs);
  const q = useCollectionGameQuery(wgid);
  useEffect(() => {
    const id = `w:${wgid}`;
    if (tabs.some((t) => t.id === id)) {
      dispatch(activateTab(id));
      onDone();
      return;
    }
    if (q.isError) {
      onError(q.error);
      onDone();
      return;
    }
    if (q.isFetching || !q.data) return;
    const header = q.data.header || {};
    const { tree, path } = buildTreeFromMoves(q.data.moves || []);
    dispatch(
      openTab({
        id,
        kind: 'game',
        title: gameTitle({ ...header, gid: wgid }),
        game: header.game || fallbackGame,
        gid: wgid,
        tree,
        cursorPath: path,
      })
    );
    onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wgid, q.data, q.isFetching, q.isError]);
  return null;
}

export default function ResultsList({ game, scope, filters, moves }) {
  const dispatch = useDispatch();
  const tabs = useSelector((s) => s.docs.tabs);
  const pageSize = useSelector(selectGamesPageSize);
  const [openingGid, setOpeningGid] = useState(null); // archive gid being opened
  const [openingWgid, setOpeningWgid] = useState(null); // personal-collection wgid being opened
  const [openError, setOpenError] = useState(null); // failed open (404/500/etc.) surfaced
  const [pageState, setPageState] = useState({ key: null, pages: 1, counts: {} });

  // `moves` is the CANONICAL line. A non-empty line takes the backend's position-hash path
  // (filters ANDed on); an EMPTY line (free-first-move board) omits `moves` entirely so the backend
  // scans pente_game with the filters - every game matches an empty line.
  const hasMoves = moves.length > 0;
  const searchKey = JSON.stringify([game, scope, filters ?? null, moves.join('-'), pageSize]);
  // Page state is KEYED on the search: for a new search it reads as page 1 / no loaded rows during
  // the very render that sees new args, so no page-2+ request ever fires for them.
  const cur = pageState.key === searchKey ? pageState : { key: searchKey, pages: 1, counts: {} };
  const pages = cur.pages;
  const showMore = () => setPageState({ ...cur, pages: cur.pages + 1 });
  const onCount = (i, n) =>
    setPageState((p) => {
      const base = p.key === searchKey ? p : { key: searchKey, pages: 1, counts: {} };
      return base.counts[i] === n ? base : { ...base, counts: { ...base.counts, [i]: n } };
    });

  const argFor = (offset) =>
    hasMoves
      ? { game, moves, scope, filters, offset, limit: pageSize }
      : { game, scope, filters, offset, limit: pageSize };
  // The retention gate keys on game+scope+filters (NOT the move line): stale rows for old filters
  // must never render as current, while stepping through moves keeps the list from flickering.
  const gateKey = resultKey(game, scope, filters);
  const { data, isFetching, error } = useGatedResult(useGamesSearchQuery(argFor(0)), gateKey);
  const games = (data && data.games) || [];
  const total = (data && data.total) || 0;
  const shown = games.length + Object.entries(cur.counts).reduce((a, [i, n]) => (Number(i) < pages - 1 ? a + n : a), 0);

  const openingQuery = useGameQuery(openingGid, { skip: openingGid == null });
  // Open (or re-activate) the clicked game's tab once ITS OWN moves have loaded. The guard
  // must prove the fetched game belongs to the CURRENT openingGid: RTK Query keeps the
  // PREVIOUSLY-opened game in `data` while a new gid is still fetching, so gating on the
  // response header's gid matching openingGid (and !isFetching) keeps this path and the
  // /g/:gid route loader opening the SAME, correct game.
  useEffect(() => {
    if (openingGid == null) return;
    const id = gameTabId(openingGid);
    if (tabs.some((t) => t.id === id)) {
      dispatch(activateTab(id)); // store-first dedup: reuse existing g:<gid> tab
      setOpeningGid(null);
      return;
    }
    if (openingQuery.isError) {
      setOpenError(openingQuery.error); // surface 404/500/etc. instead of spinning forever
      setOpeningGid(null);
      return;
    }
    const loaded = openingQuery.data;
    if (openingQuery.isFetching || !loaded || !loaded.header || loaded.header.gid !== openingGid) {
      return; // still fetching, or `data` is the PREVIOUS game's - wait for THIS gid
    }
    const { tree, path } = buildTreeFromMoves(loaded.moves || []);
    dispatch(
      openTab({
        id,
        kind: 'game',
        title: gameTitle(loaded.header),
        game: loaded.header.game,
        gid: openingGid,
        tree,
        cursorPath: path,
      })
    );
    setOpeningGid(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingGid, openingQuery.data, openingQuery.isFetching, openingQuery.isError]);

  const handleRowClick = (header) => {
    const id = rowId(header);
    if (tabs.find((t) => t.id === id)) {
      dispatch(activateTab(id));
      return;
    }
    setOpenError(null); // clear any prior failed-open before starting a new one
    if (isMine(header)) setOpeningWgid(header.gid);
    else setOpeningGid(header.gid);
  };
  const openingId = openingWgid != null ? `w:${openingWgid}` : openingGid != null ? gameTabId(openingGid) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {openingWgid != null && (
        <CollectionOpener
          wgid={openingWgid}
          fallbackGame={game}
          onDone={() => setOpeningWgid(null)}
          onError={setOpenError}
        />
      )}
      <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.5 }} data-testid="position-mode-header">
        {listHeaderLabel(scope, moves.length)}
      </Typography>
      <Box sx={{ maxHeight: VIEWPORT_HEIGHT, overflowY: 'auto', position: 'relative' }} data-testid="results-viewport">
        {games.map((h) => (
          <GameRow key={`${h.source}-${h.gid}`} header={h} opening={openingId === rowId(h)} onClick={handleRowClick} />
        ))}
        {Array.from({ length: pages - 1 }, (_, i) => (
          <MorePage
            key={`${searchKey}#${i + 1}`}
            index={i}
            arg={argFor((i + 1) * pageSize)}
            gateKey={gateKey}
            openingId={openingId}
            onRowClick={handleRowClick}
            onCount={onCount}
          />
        ))}
        <PanelError error={error || openError} />
        {!error && games.length === 0 && !isFetching && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No games found.
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1, py: 0.5 }}>
        <Typography variant="caption" data-testid="games-count">
          {gamesCountLabel(shown, total)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Page size
          </Typography>
          <Select
            size="small"
            variant="standard"
            value={pageSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              dispatch(setGamesPageSize(n));
              persistGamesPageSize(n);
            }}
            inputProps={{ 'aria-label': 'Games page size', 'data-testid': 'games-page-size' }}
            sx={{ fontSize: '0.75rem' }}
          >
            {GAMES_PAGE_SIZES.map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </Select>
          <Button size="small" disabled={shown >= total} onClick={showMore}>
            Show more
          </Button>
        </Box>
      </Box>
      {isFetching && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 0.5 }}>
          <CircularProgress size={16} />
        </Box>
      )}
    </Box>
  );
}
