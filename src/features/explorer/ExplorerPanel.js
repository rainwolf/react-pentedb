// ExplorerPanel — the position explorer. Reads the debounced active position, queries master
// statistics for it, and presents:
//   1. a position summary (games seen, win% for the side to move);
//   2. a "Heat on board" toggle — the green→red candidate heat is overlaid on the REAL board
//      (BoardHeatOverlay), so this panel no longer carries its own mini-board preview;
//   3. StatsRows — the candidate continuations; hovering a row lights that cell up brightly on
//      the board (via the shared ui hover cell), clicking plays the move;
//   4. "games through here" — a ResultsList constrained to games passing through this line.
//
// FILTERS. The ONE applied filter set (ui slice, edited by the left FilterForm) rides along with
// the position on BOTH the stats query and the games list (desktop parity), and is summarised as
// chips above the stats with a clear-all.
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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { usePingQuery } from '../../app/api';
import usePositionStats from './usePositionStats';
import {
  selectScope,
  selectEffectiveScope,
  selectHeatOnBoard,
  selectHeatHoverCell,
  selectExplorerSort,
  selectExplorerLimit,
  selectFilters,
  clearFilters,
  setExplorerLimit,
  setHeatOnBoard,
  setHeatHoverCell,
  setExplorerSort,
} from '../../app/uiSlice';
import { applyMove } from '../../model/docSlice';
import { gridSizeForGame } from '../../board/boardGeometry';
import PanelError from '../../shell/PanelError';
import ResultsList from '../search/ResultsList';
import useDebouncedPosition from './useDebouncedPosition';
import StatsRows from './StatsRows';
import ActiveFilters from './ActiveFilters';
import TextField from '@mui/material/TextField';
import { displayedCandidates } from './displayedCandidates';
import { usableCandidates } from './heatScale';

// "Show" counter. Keeps a local string draft so the field can be cleared / retyped; commits to the
// store after a short debounce (arrows apply promptly, multi-digit typing isn't committed half-way),
// and immediately on Enter / blur. Invalid drafts revert to the stored value on blur / Enter.
const LIMIT_DEBOUNCE_MS = 400;
function parseLimit(str) {
  return /^\d+$/.test(str.trim()) && Number(str) >= 1 ? Number(str) : null;
}
function LimitField({ limit, onCommit }) {
  const [draft, setDraft] = useState(String(limit));
  const timer = useRef(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => { setDraft(String(limit)); }, [limit]); // external store change
  useEffect(() => clear, []);
  const commitNow = (str) => {
    clear();
    const n = parseLimit(str);
    if (n == null) setDraft(String(limit));
    else if (n !== limit) onCommit(n);
  };
  return (
    <TextField
      size="small"
      type="number"
      label="Show"
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        clear();
        const n = parseLimit(v);
        if (n != null) timer.current = setTimeout(() => { timer.current = null; onCommit(n); }, LIMIT_DEBOUNCE_MS);
      }}
      onBlur={(e) => commitNow(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commitNow(e.target.value); }}
      inputProps={{ min: 1, step: 1, 'aria-label': 'Moves to display', 'data-testid': 'explorer-limit' }}
      InputLabelProps={{ shrink: true }}
      sx={{ ml: 'auto', width: 76, '& input': { py: 0.4, fontSize: '0.75rem' }, '& label': { fontSize: '0.8rem' } }}
    />
  );
}

export default function ExplorerPanel() {
  const dispatch = useDispatch();
  const pos = useDebouncedPosition(150);
  const heatOn = useSelector(selectHeatOnBoard);
  const { data: ping } = usePingQuery();
  // Effective scope coerces mine/both -> archive when unauthenticated, so a logout/expiry
  // never leaves the stats + "games through here" list firing 401-ing authed queries.
  const scope = selectEffectiveScope(ping?.auth ?? null, useSelector(selectScope));

  const filters = useSelector(selectFilters);

  const hasPos = !!pos;
  const game = pos ? pos.game : 1;
  const moves = pos ? pos.moves : [];
  const gridSize = gridSizeForGame(game);

  const { data, isFetching, error } = usePositionStats(
    { game, moves, scope, filters },
    { skip: !hasPos }
  );

  const sortMode = useSelector(selectExplorerSort);
  const limit = useSelector(selectExplorerLimit);
  const hoverCell = useSelector(selectHeatHoverCell);

  const nextMoves = (data && data.nextMoves) || [];
  // Exclude candidates already on the board (a backend nextMoves can echo a played cell at 0%)
  // BEFORE the heat domain and the list — the SAME filter BoardHeatOverlay applies, so the list
  // and the board heat stay on one filtered set and their green→red ramps agree. `sortMode` only
  // reorders the list (popularity vs win rate); the board heat colouring is unaffected.
  const rows = displayedCandidates(nextMoves, moves, sortMode, limit);
  const availableCount = usableCandidates(nextMoves, moves).length;
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
        <LimitField limit={limit} onCommit={(n) => dispatch(setExplorerLimit(n))} />
      </Box>

      <ActiveFilters filters={filters} scope={scope} onClear={() => dispatch(clearFilters())} />

      <PanelError error={error} />

      {!error && (
        <Typography data-testid="explorer-summary" variant="caption" color="text.secondary" sx={{ px: 1 }}>
          {moves.length === 0
            ? 'Play a first move to see move statistics.'
            : totalGames != null
            ? `${totalGames} games · ${totalWinPct != null ? `${totalWinPct}% win for mover` : 'win% n/a'}`
            : isFetching
              ? 'Loading…'
              : filters
                ? 'No games match these filters from this position.'
                : 'No master games from this position.'}
        </Typography>
      )}

      {availableCount > rows.length && (
        <Typography data-testid="explorer-limit-hint" variant="caption" color="text.disabled" sx={{ px: 1 }}>
          {`${rows.length} of ${availableCount} moves`}
        </Typography>
      )}
      <StatsRows rows={rows} gridSize={gridSize} onSelect={handleSelect} onHover={handleHover} hoverCell={hoverCell} />

      <Divider sx={{ mt: 1 }} />
      <Box sx={{ px: 1, pt: 1 }}>
        <Typography variant="subtitle2">Games through here</Typography>
      </Box>
      <ResultsList game={game} scope={scope} filters={filters} moves={moves} />
    </Box>
  );
}
