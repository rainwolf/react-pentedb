// WinnerStone: fixed board-coloured winner marker shared by search results and the collection.
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import WinnerStone, { winnerStoneFill, STONE_WHITE, STONE_BLACK } from './WinnerStone';

const P1 = { name: 'Alice', rating: 1500 };
const P2 = { name: 'Bob', rating: 1400 };
const header = (game, winner) => ({ gid: 1, game, winner, player1: P1, player2: P2 });

function fillOf(el) {
  return window.getComputedStyle(el).backgroundColor;
}

afterEach(cleanup);

describe('winnerStoneFill', () => {
  test('non-Go game 1: player 1 wins = white stone, player 2 wins = black stone', () => {
    expect(winnerStoneFill(1, 1)).toBe(STONE_WHITE);
    expect(winnerStoneFill(1, 2)).toBe(STONE_BLACK);
  });

  test('Go game 19: colours reversed (player 1 = black, player 2 = white)', () => {
    expect(winnerStoneFill(19, 1)).toBe(STONE_BLACK);
    expect(winnerStoneFill(19, 2)).toBe(STONE_WHITE);
  });

  test('no winner (0, null, undefined) gives no fill', () => {
    expect(winnerStoneFill(1, 0)).toBeNull();
    expect(winnerStoneFill(19, undefined)).toBeNull();
  });
});

describe('WinnerStone rendering', () => {
  test('game 1 player 1 won renders a white circle with an accessible name', () => {
    render(<WinnerStone header={header(1, 1)} />);
    const stone = screen.getByRole('img', { name: 'Player 1 won (Alice)' });
    expect(stone.getAttribute('data-fill')).toBe(STONE_WHITE);
    expect(fillOf(stone)).toBe('rgb(255, 255, 255)');
  });

  test('game 1 player 2 won renders a black circle', () => {
    render(<WinnerStone header={header(1, 2)} />);
    const stone = screen.getByRole('img', { name: 'Player 2 won (Bob)' });
    expect(fillOf(stone)).toBe('rgb(0, 0, 0)');
  });

  test('Go game 19 player 1 won renders black', () => {
    render(<WinnerStone header={header(19, 1)} />);
    const stone = screen.getByRole('img', { name: 'Player 1 won (Alice)' });
    expect(fillOf(stone)).toBe('rgb(0, 0, 0)');
  });

  test('no winner renders the dash, not a stone', () => {
    render(<WinnerStone header={header(1, 0)} />);
    expect(screen.queryByTestId('winner-stone')).toBeNull();
    expect(screen.getByLabelText('No winner').textContent).toBe('—');
  });

  test('a winner with no player name still gets a label', () => {
    render(<WinnerStone header={{ gid: 2, game: 1, winner: 2, player1: null, player2: null }} />);
    expect(screen.getByRole('img', { name: 'Player 2 won' })).toBeTruthy();
  });

  test('fill is identical under light and dark MUI themes', () => {
    const light = render(
      <ThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>
        <WinnerStone header={header(1, 1)} />
      </ThemeProvider>
    );
    const lightFill = fillOf(screen.getByTestId('winner-stone'));
    light.unmount();

    render(
      <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
        <WinnerStone header={header(1, 1)} />
      </ThemeProvider>
    );
    const darkFill = fillOf(screen.getByTestId('winner-stone'));

    expect(lightFill).toBe('rgb(255, 255, 255)');
    expect(darkFill).toBe(lightFill);
  });
});
