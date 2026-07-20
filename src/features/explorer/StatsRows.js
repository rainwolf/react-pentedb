// StatsRows — the candidate-move table of the position explorer. One row per master
// continuation: move label, games count, an inline win-rate bar, and win%; plus a totals
// row aggregating the listed continuations.
//
// Coordinates: rows carry the backend's CANONICAL move cell verbatim. onSelect(cell) and
// onHover(cell) both hand back that canonical cell — the caller applies it as a move
// (canonical) and/or maps it to a display cell for the ghost/heat overlay (see HeatOverlay).
// Row labels are the canonical board coordinate (A1-style), so they name the true move
// regardless of any view rotation the board is currently showing.
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { heatColor, heatDomain, heatT } from './heatScale';
import { formatMove } from '../../export/coords';

// Flat cell (cell = y*n + x) → board coordinate, e.g. centre of 19x19 → "K10". Delegates to
// the shared formatMove (src/export/coords.js), which is size-aware (n), null-safe, and renders
// the pass sentinel (n*n, shared by Go and Renju passes) as "PASS" instead of throwing.
export function moveLabel(cell, n = 19) {
  return formatMove(cell, n);
}

// Candidate rows, ordered by popularity (games) descending. Copy first (never mutate props).
export function sortedRows(nextMoves = []) {
  return [...nextMoves].sort((a, b) => (b.games || 0) - (a.games || 0));
}

// Aggregate of the listed continuations: total games, total wins, and the pooled win% (one
// decimal). Empty set → all zeros, never a divide-by-zero.
export function totalsRow(nextMoves = []) {
  const games = nextMoves.reduce((s, r) => s + (r.games || 0), 0);
  const wins = nextMoves.reduce((s, r) => s + (r.wins || 0), 0);
  const winPct = games > 0 ? Math.round((wins / games) * 1000) / 10 : 0;
  return { games, wins, winPct };
}

// The bar WIDTH shows the absolute win rate; the bar COLOR is the green→red RELATIVE heat,
// normalized across the shown rows (via `domain`) so the list agrees with the board overlay.
function WinBar({ winPct, domain }) {
  const pct = Math.max(0, Math.min(100, Number(winPct) || 0));
  return (
    <Box sx={{ position: 'relative', height: 8, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, width: `${pct}%`, bgcolor: heatColor(heatT(winPct, domain)) }} />
    </Box>
  );
}

export default function StatsRows({ rows = [], gridSize = 19, onSelect = () => {}, onHover = () => {} }) {
  const totals = totalsRow(rows);
  // Same normalization as HeatOverlay / BoardHeatOverlay: min→red, max→green over this set.
  const domain = heatDomain(rows.map((r) => r.winPct));

  return (
    <Box role="table" aria-label="Candidate moves" sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.25, color: 'text.secondary' }}>
        <Typography variant="caption" sx={{ width: 44 }}>
          Move
        </Typography>
        <Typography variant="caption" sx={{ width: 48, textAlign: 'right' }}>
          Games
        </Typography>
        <Typography variant="caption" sx={{ flex: 1 }}>
          Win rate
        </Typography>
        <Typography variant="caption" sx={{ width: 44, textAlign: 'right' }}>
          Win%
        </Typography>
      </Box>

      {rows.map((r) => (
        <Box
          key={r.move}
          role="button"
          tabIndex={0}
          data-testid={`stats-row-${r.move}`}
          onClick={() => onSelect(r.move)}
          onMouseEnter={() => onHover(r.move)}
          onMouseLeave={() => onHover(null)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 0.5,
            cursor: 'pointer',
            borderTop: 1,
            borderColor: 'divider',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Typography variant="body2" sx={{ width: 44, fontFamily: 'monospace' }}>
            {moveLabel(r.move, gridSize)}
          </Typography>
          <Typography variant="body2" sx={{ width: 48, textAlign: 'right' }}>
            {r.games ?? 0}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <WinBar winPct={r.winPct} domain={domain} />
          </Box>
          <Typography variant="body2" sx={{ width: 44, textAlign: 'right' }}>
            {r.winPct != null ? `${r.winPct}%` : '—'}
          </Typography>
        </Box>
      ))}

      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>
          No master games from here.
        </Typography>
      )}

      <Box
        data-testid="stats-totals"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          borderTop: 2,
          borderColor: 'divider',
          fontWeight: 600,
        }}
      >
        <Typography variant="body2" sx={{ width: 44, fontWeight: 600 }}>
          Listed moves
        </Typography>
        <Typography variant="body2" sx={{ width: 48, textAlign: 'right', fontWeight: 600 }}>
          {totals.games}
        </Typography>
        <Box sx={{ flex: 1 }}>
          <WinBar winPct={totals.winPct} domain={domain} />
        </Box>
        <Typography variant="body2" sx={{ width: 44, textAlign: 'right', fontWeight: 600 }}>
          {totals.winPct}%
        </Typography>
      </Box>
    </Box>
  );
}
