// Archive search results: offset-paginated, hand-rolled windowed rendering (no new deps —
// only PAGE_SIZE rows ever arrive per page, but the row list is rendered through the same
// scroll-windowing math a longer list would need). Row click loads the full game and opens
// it as a docSlice tab at its final position, reusing Workbench's tab-id convention and
// tree-building helper so a search result and the /g/:gid route resolve to the same tab.
import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { useGamesSearchQuery, useGameQuery } from '../../app/api';
import { openTab, activateTab } from '../../model/docSlice';
import { buildTreeFromMoves, gameTitle, gameTabId } from '../../shell/Workbench';

export const PAGE_SIZE = 25;
const ROW_HEIGHT = 56;
const VIEWPORT_HEIGHT = ROW_HEIGHT * 7;
const OVERSCAN = 3;

// Pure: offset/limit/total/count -> "Showing x-y of total" (or "Showing 0 of 0").
export function paginationLabel(offset, total, count) {
  if (total === 0 || count === 0) return 'Showing 0 of 0';
  const from = offset + 1;
  const to = offset + count;
  return `Showing ${from}–${to} of ${total}`;
}

// Pure: hand-rolled windowing — given a scroll position, return the [start, end) row
// index range to actually render (viewport rows + overscan on both edges, clipped to
// the real row count). No IntersectionObserver / list library — plain arithmetic.
export function visibleRowRange(scrollTop, viewportHeight, rowHeight, count, overscan = 0) {
  if (count === 0) return { start: 0, end: 0 };
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const end = Math.min(count, first + visibleCount);
  return { start: first, end };
}

function playerLabel(p) {
  if (!p) return 'Unknown';
  return p.rating != null ? `${p.name} (${p.rating})` : p.name;
}

function winnerGlyph(header) {
  if (header.winner === 1) return '●'; // filled = player 1
  if (header.winner === 2) return '○'; // open = player 2
  return '—'; // em dash = no winner / draw / unknown
}

export default function ResultsList({ game, scope, filters, moves }) {
  const dispatch = useDispatch();
  const tabs = useSelector((s) => s.docs.tabs);
  const [offset, setOffset] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [openingGid, setOpeningGid] = useState(null);

  // Position-constrained ("games through here") mode: when the explorer passes a `moves`
  // line, the search is scoped to games passing through that CANONICAL position. Without the
  // prop this stays Task 7's filter-only search. `movesKey` gives the effect/query a stable
  // dependency (a plain array would be a fresh reference every render).
  const positionMode = Array.isArray(moves);
  const movesKey = positionMode ? moves.join('-') : null;

  // A new search (game/scope/filters/position changed) always starts back at page 1.
  useEffect(() => {
    setOffset(0);
    setScrollTop(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, scope, filters, movesKey]);

  // Filter-only search omits `moves` entirely (not null/[]) so the backend takes the
  // pente_game filter path; position-constrained mode includes the canonical `moves` line so
  // it takes the position-hash path.
  const searchArg = positionMode
    ? { game, moves, scope, filters, offset, limit: PAGE_SIZE }
    : { game, scope, filters, offset, limit: PAGE_SIZE };
  const { data, isFetching } = useGamesSearchQuery(searchArg);
  const games = (data && data.games) || [];
  const total = (data && data.total) || 0;

  const openingQuery = useGameQuery(openingGid, { skip: openingGid == null });
  useEffect(() => {
    if (openingGid == null || !openingQuery.data) return;
    const id = gameTabId(openingGid);
    const existing = tabs.find((t) => t.id === id);
    if (existing) {
      dispatch(activateTab(id));
    } else {
      const header = openingQuery.data.header;
      const { tree, path } = buildTreeFromMoves(openingQuery.data.moves || []);
      dispatch(
        openTab({
          id,
          kind: 'game',
          title: gameTitle(header),
          game: header ? header.game : game,
          gid: openingGid,
          tree,
          cursorPath: path,
        })
      );
    }
    setOpeningGid(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingGid, openingQuery.data]);

  const handleRowClick = (header) => {
    const id = gameTabId(header.gid);
    if (tabs.find((t) => t.id === id)) {
      dispatch(activateTab(id));
      return;
    }
    setOpeningGid(header.gid);
  };

  const { start, end } = visibleRowRange(scrollTop, VIEWPORT_HEIGHT, ROW_HEIGHT, games.length, OVERSCAN);
  const visible = games.slice(start, end);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {positionMode && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.5 }} data-testid="position-mode-header">
          Games through this position{moves.length ? ` (${moves.length} moves)` : ''}
        </Typography>
      )}
      <Box
        sx={{ height: VIEWPORT_HEIGHT, overflowY: 'auto', position: 'relative' }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        data-testid="results-viewport"
      >
        <Box sx={{ height: games.length * ROW_HEIGHT, position: 'relative' }}>
          {visible.map((h, i) => {
            const idx = start + i;
            return (
              <Box
                key={h.gid}
                onClick={() => handleRowClick(h)}
                sx={{
                  position: 'absolute',
                  top: idx * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
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
                <Typography component="span" sx={{ width: 16 }} aria-hidden>
                  {winnerGlyph(h)}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {playerLabel(h.player1)} vs {playerLabel(h.player2)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {h.event || h.site || ''} {h.playDate ? new Date(h.playDate).toLocaleDateString() : ''}
                  </Typography>
                </Box>
                {openingGid === h.gid && <CircularProgress size={14} />}
              </Box>
            );
          })}
          {games.length === 0 && !isFetching && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No games found.
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.5 }}>
        <Typography variant="caption">{paginationLabel(offset, total, games.length)}</Typography>
        <Box>
          <IconButton
            aria-label="Previous page"
            size="small"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <IconButton
            aria-label="Next page"
            size="small"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
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
