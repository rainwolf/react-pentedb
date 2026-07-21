// StatsRows — the candidate-move table of the position explorer. One row per master
// continuation: move label, games count, an inline win-rate bar, and win%; plus a totals
// row aggregating the listed continuations.
//
// Coordinates: rows carry the move cell verbatim as the backend returns it — ALREADY in the
// board's local/canonical orientation (the server pre-rotates each nextMoves cell to match the
// caller's line; see api.js). The response's top-level `rotation` is informational only and is
// never applied to it. onSelect(cell) and onHover(cell) hand back that same local cell — the
// caller applies it as a move and/or forwards it to the ghost/heat overlay (see HeatOverlay),
// which separately maps it onto the CURRENT VIEW rotation — a local display preference, a
// different concept from the backend's informational `rotation` field. Row labels are that
// same local board coordinate (A1-style), so they name the true move regardless of any view
// rotation the board is currently showing.
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

// Candidate rows in the chosen order. Copy first (never mutate props).
//   'games'   → popularity: games desc, win% as the tiebreak (the original default).
//   'winrate' → win% desc PRIMARILY (a 1-game 100% does sit above a 500-game 65%), games as
//               the tiebreak so equal win% falls back to the more-played line.
// This ONLY reorders the list; the board heat colouring (by win%) is unchanged.
export function sortedRows(nextMoves = [], mode = 'games') {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const byGames = (a, b) => num(b.games) - num(a.games) || num(b.winPct) - num(a.winPct);
  const byWinrate = (a, b) => num(b.winPct) - num(a.winPct) || num(b.games) - num(a.games);
  return [...nextMoves].sort(mode === 'winrate' ? byWinrate : byGames);
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

export default function StatsRows({
  rows = [],
  gridSize = 19,
  onSelect = () => {},
  onHover = () => {},
  hoverCell = null,
}) {
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
          data-active-hover={hoverCell != null && r.move === hoverCell ? 'true' : 'false'}
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
            // Board-driven highlight (pointer on the disc, not the row): same look as :hover, so
            // board-driven and mouse-driven highlights are indistinguishable.
            ...(hoverCell != null && r.move === hoverCell && { bgcolor: 'action.hover' }),
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
