// Header above the board: document title, per-player capture score, and side-to-move — all
// derived from the active tab and its replayed GameClass (Task 2/3 sources of truth).
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { selectActivePosition } from '../../model/docSlice';
import { buildBoardGame, capturesByColor } from './boardGameFactory';
import ExportMenu from '../exchange/ExportMenu';

// colour 1 renders as the white stone, colour 2 as black (Board's player_colors order).
function StoneDot({ color }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        bgcolor: color === 1 ? '#fafafa' : '#111',
        border: '1px solid #888',
        flexShrink: 0,
      }}
    />
  );
}

export default function GameHeaderBar() {
  const docs = useSelector((s) => s.docs);
  const activeTab = docs.tabs.find((t) => t.id === docs.activeTabId) || null;
  const activePos = useSelector(selectActivePosition);
  const key = activePos ? `${activePos.game}:${activePos.moves.join('-')}` : '';
  const game = useMemo(
    () => (activePos ? buildBoardGame(activePos.game, activePos.moves) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  if (!activeTab) return null;
  const caps = capturesByColor(game);
  const toMove = game ? game.currentColor() : 1;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 1,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="subtitle2" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {activeTab.title || 'Untitled'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} title="Player 1 captures">
        <StoneDot color={1} />
        <Typography variant="body2" data-testid="captures-1">
          {caps[1]}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} title="Player 2 captures">
        <StoneDot color={2} />
        <Typography variant="body2" data-testid="captures-2">
          {caps[2]}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" data-testid="to-move" noWrap>
        {toMove === 1 ? 'White to move' : 'Black to move'}
      </Typography>
      <ExportMenu />
    </Box>
  );
}
