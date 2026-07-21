// ExplorerPanel — the position explorer. Reads the debounced active position, queries master
// statistics for it, and presents:
//   1. a position summary (games seen, win% for the side to move);
//   2. a "Heat on board" toggle — the green→red candidate heat is overlaid on the REAL board
//      (BoardHeatOverlay), so this panel no longer carries its own mini-board preview;
//   3. StatsRows — the candidate continuations; hovering a row lights that cell up brightly on
//      the board (via the shared ui hover cell), clicking plays the move;
//   4. "games through here" — a ResultsList constrained to games passing through this line.
//
// CANONICAL vs DISPLAY. Everything that leaves this panel toward the model is canonical: the
// position-stats query uses the canonical line (selectActivePosition().moves, via the debounce
// hook), a row click dispatches applyMove(canonicalCell), and onHover writes the canonical cell
// into the ui slice. Moves coming BACK from the query (nextMoves[].move, via StatsRows) are
// already in that same local/canonical orientation — the server pre-rotates them before
// responding (see api.js) — so nothing here re-rotates them. The response's top-level `rotation`
// is informational only and must NOT be re-applied to nextMoves; that would double-rotate and
// corrupt the cell. The separate VIEW-rotation transform (for a locally-rotated board display)
// lives entirely in HeatOverlay (used by BoardHeatOverlay over the real board).
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { usePositionStatsQuery, usePingQuery } from '../../app/api';
import {
  selectScope,
  selectEffectiveScope,
  selectHeatOnBoard,
  selectHeatHoverCell,
  selectExplorerSort,
  setHeatOnBoard,
  setHeatHoverCell,
  setExplorerSort,
} from '../../app/uiSlice';
import { applyMove } from '../../model/docSlice';
import { gridSizeForGame } from '../../board/boardGeometry';
import PanelError from '../../shell/PanelError';
import ResultsList from '../search/ResultsList';
import useDebouncedPosition from './useDebouncedPosition';
import StatsRows, { sortedRows } from './StatsRows';
import { usableCandidates } from './heatScale';

export default function ExplorerPanel() {
  const dispatch = useDispatch();
  const pos = useDebouncedPosition(150);
  const heatOn = useSelector(selectHeatOnBoard);
  const { data: ping } = usePingQuery();
  // Effective scope coerces mine/both -> archive when unauthenticated, so a logout/expiry
  // never leaves the stats + "games through here" list firing 401-ing authed queries.
  const scope = selectEffectiveScope(ping?.auth ?? null, useSelector(selectScope));

  const hasPos = !!pos;
  const game = pos ? pos.game : 1;
  const moves = pos ? pos.moves : [];
  const gridSize = gridSizeForGame(game);

  const { data, isFetching, error } = usePositionStatsQuery(
    { game, moves, scope, filters: null },
    { skip: !hasPos }
  );

  const sortMode = useSelector(selectExplorerSort);
  const hoverCell = useSelector(selectHeatHoverCell);

  const nextMoves = (data && data.nextMoves) || [];
  // Exclude candidates already on the board (a backend nextMoves can echo a played cell at 0%)
  // BEFORE the heat domain and the list — the SAME filter BoardHeatOverlay applies, so the list
  // and the board heat stay on one filtered set and their green→red ramps agree. `sortMode` only
  // reorders the list (popularity vs win rate); the board heat colouring is unaffected.
  const rows = sortedRows(usableCandidates(nextMoves, moves), sortMode);
  const totalGames = data ? data.totalGames : null;
  const totalWinPct = data ? data.totalWinPct : null;

  const handleSelect = useCallback(
    (cell) => {
      dispatch(applyMove(cell)); // canonical cell — NEVER a display/rotated cell
      dispatch(setHeatHoverCell(null));
    },
    [dispatch]
  );

  // Hovering a row lifts the canonical cell into the ui slice; BoardHeatOverlay reads it and
  // brightly highlights that cell on the real board. onHover(null) on mouse-leave clears it.
  const handleHover = useCallback((cell) => dispatch(setHeatHoverCell(cell)), [dispatch]);

  if (!hasPos) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2">Explorer</Typography>
        <Typography variant="body2" color="text.secondary">
          Open a game or scratch board to explore master statistics.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <Box sx={{ px: 1, pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">Explorer</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isFetching && <CircularProgress size={14} />}
          <FormControlLabel
            sx={{ m: 0 }}
            labelPlacement="start"
            control={
              <Switch
                size="small"
                checked={heatOn}
                onChange={(e) => dispatch(setHeatOnBoard(e.target.checked))}
                inputProps={{ 'data-testid': 'heat-on-board-toggle', 'aria-label': 'Show heat on board' }}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                Heat on board
              </Typography>
            }
          />
        </Box>
      </Box>

      <Box sx={{ px: 1, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography variant="caption" color="text.secondary">
          Sort
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sortMode}
          onChange={(e, val) => {
            if (val) dispatch(setExplorerSort(val)); // ignore the null a re-click of the active button sends
          }}
          aria-label="Sort candidate moves"
          sx={{
            '& .MuiToggleButton-root': {
              py: 0.1,
              px: 0.9,
              textTransform: 'none',
              fontSize: '0.68rem',
              lineHeight: 1.4,
            },
          }}
        >
          <ToggleButton value="games" data-testid="sort-games" aria-label="Sort by popularity">
            Popularity
          </ToggleButton>
          <ToggleButton value="winrate" data-testid="sort-winrate" aria-label="Sort by win rate">
            Win rate
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <PanelError error={error} />

      {!error && (
        <Typography data-testid="explorer-summary" variant="caption" color="text.secondary" sx={{ px: 1 }}>
          {totalGames != null
            ? `${totalGames} games · ${totalWinPct != null ? `${totalWinPct}% win for mover` : 'win% n/a'}`
            : 'No master games from this position.'}
        </Typography>
      )}

      <StatsRows rows={rows} gridSize={gridSize} onSelect={handleSelect} onHover={handleHover} hoverCell={hoverCell} />

      <Divider sx={{ mt: 1 }} />
      <Box sx={{ px: 1, pt: 1 }}>
        <Typography variant="subtitle2">Games through here</Typography>
      </Box>
      <ResultsList game={game} scope={scope} filters={null} moves={moves} />
    </Box>
  );
}
