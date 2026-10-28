// ActiveFilters - compact chip summary of the shared applied filters, shown above the explorer
// stats so it is obvious the numbers (and the games list) are filtered. Renders nothing when no
// filter is applied. "Clear" resets the shared set (FilterForm's draft follows the store).
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

// Pure: applied Filters DTO (or null) -> chip labels, in form order.
export function filterChipLabels(filters) {
  if (!filters) return [];
  const eitherSeat = filters.player1Seat === 0 && filters.player2Seat === 0;
  const out = [
    filters.player1Name ? `Player 1: ${filters.player1Name}` : null,
    filters.player2Name ? `Player 2: ${filters.player2Name}` : null,
    eitherSeat && (filters.player1Name || filters.player2Name) ? 'Either seat' : null,
    filters.site ? `Site: ${filters.site}` : null,
    filters.event ? `Event: ${filters.event}` : null,
    filters.round ? `Round: ${filters.round}` : null,
    filters.section ? `Section: ${filters.section}` : null,
    filters.afterDate ? `After ${filters.afterDate}` : null,
    filters.beforeDate ? `Before ${filters.beforeDate}` : null,
    filters.winner ? `Winner: Player ${filters.winner}` : null,
  ];
  return out.filter(Boolean);
}

export default function ActiveFilters({ filters, scope, onClear }) {
  const labels = filterChipLabels(filters);
  const caveat = scope !== 'archive';
  if (labels.length === 0 && !caveat) return null;
  return (
    <Box data-testid="active-filters" sx={{ px: 1, pb: 0.5 }}>
      {labels.length > 0 && (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Filtered:
        </Typography>
        {labels.map((l) => (
          <Chip key={l} size="small" label={l} />
        ))}
        <Button size="small" onClick={onClear} data-testid="clear-all-filters" sx={{ minWidth: 0, py: 0, ml: 'auto' }}>
          Clear all
        </Button>
      </Box>
      )}
      {caveat && (
        <Typography variant="caption" color="text.disabled" data-testid="scope-caveat">
          Position and filters apply to the archive only, not your own games.
        </Typography>
      )}
    </Box>
  );
}
