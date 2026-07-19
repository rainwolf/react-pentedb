// Characterization net for the variant opening FSM (swap2 / d-pente) and the Go evaluate
// gate. These pin the EXACT current behaviour of the GameClass predicates before the
// opening-phase logic is consolidated behind a pure module — they must stay green across
// the refactor (behaviour is preserved; only the implementation moves).
import { describe, test, expect } from 'vitest';
import { Game, GameState } from '../GameClass';

const { State, Swap2State, DPenteState, GoState } = GameState;

// A game of variant `g` with `len` moves played and the given sub-state overrides.
// Only moves.length and gameState drive the opening FSM, so the move values are irrelevant.
function game(g, len, overrides = {}) {
  const gm = new Game();
  gm.setGame(g);
  gm.moves = new Array(len).fill(0);
  gm.gameState = {
    state: State.STARTED,
    dPenteState: DPenteState.NO_CHOICE,
    swap2State: Swap2State.NO_CHOICE,
    goState: GoState.PLAY,
    ...overrides,
  };
  return gm;
}

const SWAP2 = 27; // also 28, 29, 30
const DPENTE = 7; // also 8, 17, 18
const GO = 19; // 19..24
const PENTE = 1;

describe('swap2 currentPlayer (game 27)', () => {
  test('player 1 lays the three opening stones', () => {
    expect(game(SWAP2, 0).currentPlayer()).toBe(1);
    expect(game(SWAP2, 1).currentPlayer()).toBe(1);
    expect(game(SWAP2, 2).currentPlayer()).toBe(1);
  });
  test('after 3 stones with no choice yet, player 2 decides', () => {
    expect(game(SWAP2, 3, { swap2State: Swap2State.NO_CHOICE }).currentPlayer()).toBe(2);
  });
  test('after a pass, player 2 lays the two extra stones (len 3 and 4)', () => {
    expect(game(SWAP2, 3, { swap2State: Swap2State.SWAP2PASS }).currentPlayer()).toBe(2);
    expect(game(SWAP2, 4, { swap2State: Swap2State.SWAP2PASS }).currentPlayer()).toBe(2);
  });
  test('after the two extra stones (len 5, passed), player 1 decides', () => {
    expect(game(SWAP2, 5, { swap2State: Swap2State.SWAP2PASS }).currentPlayer()).toBe(1);
  });
  test('non-opening combinations fall through to plain alternation 1 + len%2', () => {
    expect(game(SWAP2, 3, { swap2State: Swap2State.SWAPPED }).currentPlayer()).toBe(2);
    expect(game(SWAP2, 4, { swap2State: Swap2State.NO_CHOICE }).currentPlayer()).toBe(1);
    expect(game(SWAP2, 5, { swap2State: Swap2State.NO_CHOICE }).currentPlayer()).toBe(2);
    expect(game(SWAP2, 6, { swap2State: Swap2State.NO_CHOICE }).currentPlayer()).toBe(1);
  });
  test('currentPlayer does NOT gate on game state (only the choice predicates do)', () => {
    expect(game(SWAP2, 3, { state: State.NOT_STARTED }).currentPlayer()).toBe(2);
  });
});

describe('swap2 choice predicates (game 27)', () => {
  test('swap2Choice is true only at the two decision points, when STARTED', () => {
    expect(game(SWAP2, 3, { swap2State: Swap2State.NO_CHOICE }).swap2Choice()).toBe(true);
    expect(game(SWAP2, 5, { swap2State: Swap2State.SWAP2PASS }).swap2Choice()).toBe(true);
    expect(game(SWAP2, 3, { swap2State: Swap2State.SWAP2PASS }).swap2Choice()).toBe(false);
    expect(game(SWAP2, 4, { swap2State: Swap2State.SWAP2PASS }).swap2Choice()).toBe(false);
    expect(game(SWAP2, 5, { swap2State: Swap2State.NO_CHOICE }).swap2Choice()).toBe(false);
  });
  test('swap2Choice requires STARTED', () => {
    expect(game(SWAP2, 3, { state: State.NOT_STARTED }).swap2Choice()).toBe(false);
  });
  test('swap2CanPass is true only at len 3 / NO_CHOICE / STARTED', () => {
    expect(game(SWAP2, 3, { swap2State: Swap2State.NO_CHOICE }).swap2CanPass()).toBe(true);
    expect(game(SWAP2, 3, { swap2State: Swap2State.SWAP2PASS }).swap2CanPass()).toBe(false);
    expect(game(SWAP2, 4, { swap2State: Swap2State.NO_CHOICE }).swap2CanPass()).toBe(false);
    expect(game(SWAP2, 3, { state: State.NOT_STARTED }).swap2CanPass()).toBe(false);
  });
});

describe('d-pente currentPlayer + choice (game 7)', () => {
  test('player 1 lays the four opening stones', () => {
    expect(game(DPENTE, 0).currentPlayer()).toBe(1);
    expect(game(DPENTE, 3).currentPlayer()).toBe(1);
  });
  test('after 4 stones with no choice yet, player 2 decides', () => {
    expect(game(DPENTE, 4, { dPenteState: DPenteState.NO_CHOICE }).currentPlayer()).toBe(2);
  });
  test('non-opening combinations fall through to alternation', () => {
    expect(game(DPENTE, 4, { dPenteState: DPenteState.SWAPPED }).currentPlayer()).toBe(1);
    expect(game(DPENTE, 5, { dPenteState: DPenteState.NO_CHOICE }).currentPlayer()).toBe(2);
  });
  test('dPenteChoice is true only at len 4 / NO_CHOICE / STARTED', () => {
    expect(game(DPENTE, 4, { dPenteState: DPenteState.NO_CHOICE }).dPenteChoice()).toBe(true);
    expect(game(DPENTE, 4, { dPenteState: DPenteState.SWAPPED }).dPenteChoice()).toBe(false);
    expect(game(DPENTE, 3, { dPenteState: DPenteState.NO_CHOICE }).dPenteChoice()).toBe(false);
    expect(game(DPENTE, 4, { state: State.NOT_STARTED }).dPenteChoice()).toBe(false);
  });
});

describe('variant detection covers the whole game-number ranges', () => {
  test('swap2 detection includes 30', () => {
    expect(game(30, 3, { swap2State: Swap2State.NO_CHOICE }).swap2Choice()).toBe(true);
  });
  test('d-pente detection includes 17', () => {
    expect(game(17, 4, { dPenteState: DPenteState.NO_CHOICE }).dPenteChoice()).toBe(true);
  });
});

describe('Go evaluate gate (game 19)', () => {
  test('evaluateScore is true only when STARTED and goState is EVALUATE_STONES', () => {
    expect(game(GO, 0, { goState: GoState.EVALUATE_STONES }).evaluateScore()).toBe(true);
    expect(game(GO, 0, { goState: GoState.PLAY }).evaluateScore()).toBe(false);
    expect(game(GO, 0, { state: State.NOT_STARTED, goState: GoState.EVALUATE_STONES }).evaluateScore()).toBe(false);
  });
});

describe('gap closures — state gating, variant range, connect6', () => {
  test('currentPlayer does NOT gate on game state for d-pente either', () => {
    expect(game(DPENTE, 4, { state: State.NOT_STARTED }).currentPlayer()).toBe(2);
  });
  test('choice predicates are false in PAUSED and HALFSET, not only NOT_STARTED', () => {
    expect(game(SWAP2, 3, { state: State.PAUSED }).swap2Choice()).toBe(false);
    expect(game(SWAP2, 3, { state: State.HALFSET }).swap2CanPass()).toBe(false);
    expect(game(DPENTE, 4, { state: State.PAUSED }).dPenteChoice()).toBe(false);
  });
  test('opening logic is identical across every game id in each variant range', () => {
    expect(game(28, 3, { swap2State: Swap2State.NO_CHOICE }).currentPlayer()).toBe(2);
    expect(game(29, 5, { swap2State: Swap2State.SWAP2PASS }).currentPlayer()).toBe(1);
    expect(game(8, 4, { dPenteState: DPenteState.NO_CHOICE }).currentPlayer()).toBe(2);
    expect(game(18, 4, { dPenteState: DPenteState.NO_CHOICE }).dPenteChoice()).toBe(true);
  });
  test('connect6 currentPlayer arm is unchanged (1,2,2,1,1 over the first moves)', () => {
    expect(game(13, 0).currentPlayer()).toBe(1);
    expect(game(13, 1).currentPlayer()).toBe(2);
    expect(game(13, 2).currentPlayer()).toBe(2);
    expect(game(13, 3).currentPlayer()).toBe(1);
    expect(game(13, 4).currentPlayer()).toBe(1);
  });
});

describe('plain pente has no opening choices (game 1)', () => {
  test('the variant predicates are all false', () => {
    expect(game(PENTE, 3, { swap2State: Swap2State.NO_CHOICE }).swap2Choice()).toBe(false);
    expect(game(PENTE, 3, { swap2State: Swap2State.NO_CHOICE }).swap2CanPass()).toBe(false);
    expect(game(PENTE, 4, { dPenteState: DPenteState.NO_CHOICE }).dPenteChoice()).toBe(false);
  });
  test('currentPlayer is plain alternation', () => {
    expect(game(PENTE, 0).currentPlayer()).toBe(1);
    expect(game(PENTE, 1).currentPlayer()).toBe(2);
    expect(game(PENTE, 2).currentPlayer()).toBe(1);
    expect(game(PENTE, 3).currentPlayer()).toBe(2);
  });
});

function renjuGameAfter(moves) {
  const g = new Game();
  g.setGame(31);
  g.gameState.state = GameState.State.STARTED;
  // replay drives color + abstractBoard; addMove appends + recolors
  moves.forEach((m) => g.addMove(m));
  return g;
}

describe('renju is black-first (board value 2 = black)', () => {
  test('currentColor before any move is black (2)', () => {
    const g = new Game(); g.setGame(31);
    expect(g.currentColor()).toBe(2); // move 1 (center) is black
  });
  test('replayRenjuGame colors stones black, white, black… on the 15x15 grid', () => {
    const g = renjuGameAfter([112, 113, 97]); // center, +1col, -1row (all in-board on 15x15)
    g.replayGame();
    // abstractBoard is indexed [x][y] with x = move % gridSize (col), y = floor(move / gridSize) (row).
    // move 1 -> value 2 (black) at center 112 = (col 7, row 7)
    expect(g.abstractBoard[7][7]).toBe(2);
    // move 2 -> value 1 (white) at 113 = (col 8, row 7)
    expect(g.abstractBoard[8][7]).toBe(1);
    // move 3 -> value 2 (black) at 97 = (col 7, row 6)
    expect(g.abstractBoard[7][6]).toBe(2);
  });
});

describe('renju opening player drives isMyTurn', () => {
  test('currentPlayer uses renjuOpeningPlayer while opening incomplete', () => {
    const g = new Game(); g.setGame(31);
    g.gameState.state = GameState.State.STARTED;
    g.addMove(112); // move 1 placed; reducer normally sets awaitingSwap — set it for the unit test
    g.gameState.renjuState.awaitingSwap = true;
    // n=1 awaiting swap: lastColor=1 -> player 2 to move
    expect(g.currentPlayer()).toBe(2);
  });
});

describe('renju newInstance deep-copies renjuState (reducers mutate the copy)', () => {
  test("mutating the copy's renjuState.offered does not affect the original", () => {
    const g = new Game(); g.setGame(31);
    g.gameState.renjuState.offered = [40, 41, 42];
    const copy = g.newInstance();
    copy.gameState.renjuState.offered.push(99);
    copy.gameState.renjuState.tenOffer = true;
    expect(g.gameState.renjuState.offered).toEqual([40, 41, 42]);
    expect(g.gameState.renjuState.tenOffer).toBe(false);
  });
});

// Regression for the live-play crash: a renju PASS (GameInfoPanel.pass() sends
// move = gridSize*gridSize, the same sentinel Go uses) went through last_move()'s
// generic branch — which has no pass guard — and came back out as move 225 on a
// 15x15 board. Board.js:200 then does `board[225].last_move = true` against a
// 225-length array (valid indices 0..224) and throws, blanking the app on both
// clients. The Go arm of last_move() already special-cases this sentinel; renju
// needs the same guard.
describe('last_move guards a renju pass the same way it already guards a Go pass', () => {
  test('a renju pass never comes back as an out-of-board index', () => {
    const g = renjuGameAfter([112, 113, 97, 128, 142]); // 5 in-board opening moves
    const passMove = g.gridSize * g.gridSize; // 225 on the 15x15 renju board
    g.addMove(passMove);

    const lastMoves = g.last_move();

    lastMoves.forEach((move) => {
      expect(move).toBeGreaterThanOrEqual(0);
      expect(move).toBeLessThan(g.gridSize * g.gridSize);
    });

    // Reproduce Board.js:200's exact consumption against a real gridSize*gridSize board.
    const board = new Array(g.gridSize * g.gridSize).fill(null).map(() => ({}));
    expect(() => {
      lastMoves.forEach((move) => {
        if (move !== undefined) {
          board[move].last_move = true;
        }
      });
    }).not.toThrow();
  });

  test('a normal renju move (not a pass) is still reported as the last move', () => {
    const g = renjuGameAfter([112, 113, 97, 128, 142]);
    expect(g.last_move()).toEqual([142]);
  });

  // Same sentinel, sibling consumer: MovesListPanel renders moves_strings(), whose
  // pass special-case also lived only in the Go arm — a renju pass fell through to
  // getMoveCoord(225) and showed up as a bogus coordinate instead of 'PASS'.
  test('moves_strings renders a renju pass as PASS, like Go', () => {
    const g = renjuGameAfter([112, 113, 97, 128, 142]);
    g.addMove(g.gridSize * g.gridSize); // pass
    const strs = g.moves_strings();
    expect(strs[strs.length - 1]).toBe('PASS');
    expect(strs).toHaveLength(6);
    expect(strs[4]).toBe(g.getMoveCoord(142)); // normal moves untouched
  });
});
