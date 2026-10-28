// Winner marker for result rows (search + collection). Draws a stone with FIXED colours that
// match the board, so it never changes with the light/dark theme (a text glyph inherited the
// theme text colour and flipped). Leaf module: imports only the board geometry helper.
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { isGoBoard } from '../../board/boardGeometry';

// Board colours: white stone / black stone. Mid-grey border keeps both visible on light and dark rows.
export const STONE_WHITE = '#ffffff';
export const STONE_BLACK = '#000000';
export const STONE_BORDER = '#777';

// Which fixed fill the winner's stone gets. Non-Go: player 1 = white, player 2 = black.
// Go (game ids 19-24, same rule as the board's game.isGo()): player 1 = black, player 2 = white.
// Returns null when there is no winner.
export function winnerStoneFill(gameId, winner) {
  if (winner !== 1 && winner !== 2) return null;
  const p1IsBlack = isGoBoard(gameId);
  const winnerIsBlack = winner === 1 ? p1IsBlack : !p1IsBlack;
  return winnerIsBlack ? STONE_BLACK : STONE_WHITE;
}

function winnerLabel(header) {
  const who = header.winner === 1 ? header.player1 : header.player2;
  const name = who && who.name;
  return `Player ${header.winner} won${name ? ` (${name})` : ''}`;
}

// header: GameHeader ({ game, winner, player1, player2, ... }).
export default function WinnerStone({ header }) {
  const fill = winnerStoneFill(header.game, header.winner);
  return (
    <Box component="span" sx={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      {fill ? (
        <Box
          component="span"
          role="img"
          aria-label={winnerLabel(header)}
          title={winnerLabel(header)}
          data-testid="winner-stone"
          data-fill={fill}
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: fill,
            border: `1px solid ${STONE_BORDER}`,
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <Typography component="span" variant="body2" color="text.secondary" aria-label="No winner" title="No winner">
          —
        </Typography>
      )}
    </Box>
  );
}
