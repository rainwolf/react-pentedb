// ThreatsPanel — the right-rail control for the threat overlay (P4 Task 4). A per-player ×
// { trias, fours, potential captures } toggle grid (persisted in the ui slice, read by
// ThreatBands) plus a live count of each category on the board. When the position is not
// capture-alternation-safe the grid is replaced by a short explanation of why — see
// threatModel's gate rationale (the engine assumes strict move alternation).
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Chip from '@mui/material/Chip';

import { selectActivePosition } from '../../model/docSlice';
import { selectThreatToggles, setThreatToggle } from '../../app/uiSlice';
import { useThreatAnalysis, categoryOf } from './threatModel';

const KINDS = [
  { key: 'trias', label: 'Trias' },
  { key: 'fours', label: 'Fours' },
  { key: 'captures', label: 'Potential captures' },
];

const UNAVAILABLE = {
  variant: 'Threat overlays are only available for the AI-supported variants.',
  connect6:
    'Threat overlays aren’t available for Connect6 — it places two stones per turn, so the analyzer’s alternation assumption doesn’t hold.',
  opening: 'Threat overlays are paused during this variant’s non-alternating opening.',
};

// Count on-board threats of a given player+category from the memoized analysis.
function countFor(result, player, kind) {
  if (!result || !result.threats) return 0;
  return result.threats.filter((t) => t.player === player && categoryOf(t.type) === kind).length;
}

function PlayerRow({ player, toggles, result, onToggle }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        Player {player}
      </Typography>
      {KINDS.map(({ key, label }) => {
        const count = countFor(result, player, key);
        return (
          <FormControlLabel
            key={key}
            sx={{ ml: 0 }}
            control={
              <Checkbox
                size="small"
                checked={!!(toggles[player] && toggles[player][key])}
                onChange={(e) => onToggle(player, key, e.target.checked)}
                inputProps={{ 'data-testid': `threat-toggle-${player}-${key}` }}
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="body2">{label}</Typography>
                {count > 0 && (
                  <Chip size="small" label={count} sx={{ height: 18, '& .MuiChip-label': { px: 0.75 } }} />
                )}
              </Box>
            }
          />
        );
      })}
    </Box>
  );
}

export default function ThreatsPanel() {
  const dispatch = useDispatch();
  const activePos = useSelector(selectActivePosition);
  const toggles = useSelector(selectThreatToggles);
  const { gate, result } = useThreatAnalysis(activePos);

  const onToggle = (player, kind, value) => dispatch(setThreatToggle({ player, kind, value }));

  if (!activePos) {
    return (
      <Box sx={{ p: 2 }} data-testid="threats-empty">
        <Typography variant="subtitle2" gutterBottom>
          Threats
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Open a game to visualize trias, fours and potential captures on the board.
        </Typography>
      </Box>
    );
  }

  if (!gate.safe) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2">Threats</Typography>
        <Alert severity="info" data-testid="threats-unavailable">
          {UNAVAILABLE[gate.reason] || 'Threat overlays are not available for this position.'}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          You can still use the Explorer and AI panels for this position.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2">Threats</Typography>
      <Typography variant="caption" color="text.secondary">
        Toggle the translucent bands drawn on the board. Counts reflect the current position.
      </Typography>
      <PlayerRow player={1} toggles={toggles} result={result} onToggle={onToggle} />
      <PlayerRow player={2} toggles={toggles} result={result} onToggle={onToggle} />
    </Box>
  );
}
