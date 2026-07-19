// ExplorerPanel — the position explorer (P2 Task 8), replacing the placeholder. Reads the
// debounced active position, queries master statistics for it, and presents:
//   1. a position summary (games seen, win% for the side to move);
//   2. a heat preview — ghost stones on the candidate cells, colored by win% (HeatOverlay);
//   3. StatsRows — the candidate continuations; hover previews a ghost, click plays the move;
//   4. "games through here" — a ResultsList constrained to games passing through this line.
//
// CANONICAL vs DISPLAY. Everything that leaves this panel toward the model is canonical: the
// position-stats query uses the canonical line (selectActivePosition().moves, via the
// debounce hook), and a row click dispatches applyMove(canonicalCell). The only place a view
// rotation would apply is rendering candidate cells; HeatOverlay owns that transform. This
// panel's own preview is unrotated (rotation 0) — the shared board's live rotation is local
// to BoardPane; wiring the overlay onto that board (lifting its rotation to shared state) is
// a Task 9 integration item. The rotation transform itself is exercised by HeatOverlay's unit
// tests at rotation ≠ 0.
import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';

import { usePositionStatsQuery, usePingQuery } from '../../app/api';
import { selectScope, selectEffectiveScope } from '../../app/uiSlice';
import { applyMove } from '../../model/docSlice';
import { gridSizeForGame } from '../../board/boardGeometry';
import PanelError from '../../shell/PanelError';
import ResultsList from '../search/ResultsList';
import useDebouncedPosition from './useDebouncedPosition';
import StatsRows, { sortedRows } from './StatsRows';
import HeatOverlay from './HeatOverlay';

const PREVIEW_ROTATION = 0; // this panel's own preview is unrotated (see header note)

export default function ExplorerPanel() {
  const dispatch = useDispatch();
  const pos = useDebouncedPosition(150);
  const [hoverCell, setHoverCell] = useState(null);
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

  const nextMoves = (data && data.nextMoves) || [];
  const rows = sortedRows(nextMoves);
  const totalGames = data ? data.totalGames : null;
  const totalWinPct = data ? data.totalWinPct : null;

  const handleSelect = useCallback(
    (cell) => {
      dispatch(applyMove(cell)); // canonical cell — NEVER a display/rotated cell
      setHoverCell(null);
    },
    [dispatch]
  );

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
        {isFetching && <CircularProgress size={14} />}
      </Box>

      <PanelError error={error} />

      {!error && (
        <Typography data-testid="explorer-summary" variant="caption" color="text.secondary" sx={{ px: 1 }}>
          {totalGames != null
            ? `${totalGames} games · ${totalWinPct != null ? `${totalWinPct}% win for mover` : 'win% n/a'}`
            : 'No master games from this position.'}
        </Typography>
      )}

      <Box sx={{ p: 1 }}>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: 240,
            aspectRatio: '1 / 1',
            mx: 'auto',
            borderRadius: 1,
            bgcolor: 'action.hover',
          }}
        >
          <HeatOverlay cells={nextMoves} gridSize={gridSize} rotation={PREVIEW_ROTATION} hoverCell={hoverCell} />
        </Box>
      </Box>

      <StatsRows rows={rows} gridSize={gridSize} onSelect={handleSelect} onHover={setHoverCell} />

      <Divider sx={{ mt: 1 }} />
      <Box sx={{ px: 1, pt: 1 }}>
        <Typography variant="subtitle2">Games through here</Typography>
      </Box>
      <ResultsList game={game} scope={scope} filters={null} moves={moves} />
    </Box>
  );
}
