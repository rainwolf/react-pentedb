// Import UI tests (P3 Task 6, brief Step 1). Two layers:
//   1. Pure controller logic (no DOM): batch splitting at 200, duplicate/error indices from
//      the import response mapped back to preview-row ids, the games-array payload shape,
//      client-side move validation (center-first + range), and the "as analysis" path routing
//      to saveAnalysis instead of importGames.
//   2. The ImportDialog component: a dropped PGN becomes a preview table (players / variant /
//      moves / status), an illegal game is flagged invalid, and Confirm drives the mutations
//      and renders the imported/duplicate/error summary mapped back onto the rows.
//
// PGN fixtures are generated from the real codec (exportGamePgn) so the parse round-trip is
// guaranteed; the "illegal" game just opens off-centre, which is exactly what the backend
// rejects (F2) and what the client preview can detect without replaying captures.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { exportGamePgn } from '../../export/pgn';

const apiMock = vi.hoisted(() => ({
  useImportGamesMutation: vi.fn(),
  useSaveAnalysisMutation: vi.fn(),
}));
vi.mock('../../app/api', () => ({
  useImportGamesMutation: apiMock.useImportGamesMutation,
  useSaveAnalysisMutation: apiMock.useSaveAnalysisMutation,
}));

// eslint-disable-next-line import/first
import ImportDialog, {
  BATCH_SIZE,
  chunk,
  centerCell,
  firstMoveMustBeCenter,
  validateMoves,
  resultToWinner,
  toGamePayload,
  resolveBatchOutcome,
  runImport,
  parseImportText,
} from './ImportDialog';

const theme = createTheme();
const CENTER = 180; // K10 on the 19x19 board

function renderPlain(node) {
  return render(<ThemeProvider theme={theme}>{node}</ThemeProvider>);
}

// A trigger that behaves like an RTK Query mutation: callable, returns {unwrap()}.
function mutation(resolver) {
  return vi.fn((arg) => ({ unwrap: () => Promise.resolve(resolver(arg)) }));
}

const validPgn = () =>
  exportGamePgn(
    { game: 1, player1: { name: 'Alice', rating: 1800 }, player2: { name: 'Bob' }, result: 'player1' },
    [CENTER, 199, 200]
  );
const illegalPgn = () =>
  exportGamePgn({ game: 1, player1: { name: 'Zed' }, player2: { name: 'Yan' } }, [199, CENTER]); // off-centre opener

beforeEach(() => {
  apiMock.useImportGamesMutation.mockReset();
  apiMock.useSaveAnalysisMutation.mockReset();
  apiMock.useImportGamesMutation.mockReturnValue([
    mutation((payload) => ({ imported: payload.length, duplicates: [], errors: [] })),
    { isLoading: false },
  ]);
  apiMock.useSaveAnalysisMutation.mockReturnValue([mutation(() => ({ aid: 7 })), { isLoading: false }]);
});

afterEach(() => cleanup());

// ===================================================================================
// chunk / batch splitting
// ===================================================================================
describe('chunk — batches split at BATCH_SIZE', () => {
  test('BATCH_SIZE is 200', () => {
    expect(BATCH_SIZE).toBe(200);
  });

  test('250 rows split into [200, 50]', () => {
    const rows = Array.from({ length: 250 }, (_, i) => i);
    const batches = chunk(rows, BATCH_SIZE);
    expect(batches.map((b) => b.length)).toEqual([200, 50]);
  });

  test('an exact multiple splits evenly with no empty trailing batch', () => {
    expect(chunk(Array.from({ length: 400 }, (_, i) => i), 200).map((b) => b.length)).toEqual([200, 200]);
  });
});

// ===================================================================================
// resolveBatchOutcome — response indices mapped back onto preview-row ids
// ===================================================================================
describe('resolveBatchOutcome maps duplicate/error indices back to rows', () => {
  test('duplicates and errors resolve to the batch row ids', () => {
    const ids = ['r0', 'r1', 'r2', 'r3'];
    const res = { imported: 2, duplicates: [1], errors: [{ index: 3, message: 'illegal move at 12' }] };
    expect(resolveBatchOutcome(ids, res)).toEqual({
      imported: 2,
      duplicates: ['r1'],
      errors: [{ id: 'r3', message: 'illegal move at 12' }],
    });
  });

  test('missing optional fields default to empty (imported only)', () => {
    expect(resolveBatchOutcome(['a'], { imported: 1 })).toEqual({ imported: 1, duplicates: [], errors: [] });
  });
});

// ===================================================================================
// move validation (client-side preview pre-check)
// ===================================================================================
describe('validateMoves — center-first + range', () => {
  test('centerCell is the board centre (180 on 19x19)', () => {
    expect(centerCell(1)).toBe(CENTER);
  });

  test('a legal pente line starting at the centre is ok', () => {
    expect(validateMoves(1, [CENTER, 199, 200])).toEqual({ ok: true });
  });

  test('an off-centre first move is invalid for pente', () => {
    const v = validateMoves(1, [199, CENTER]);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/cent/i);
  });

  test('an empty move list is invalid', () => {
    expect(validateMoves(1, []).ok).toBe(false);
  });

  test('an out-of-range cell is invalid', () => {
    expect(validateMoves(1, [CENTER, 99999]).ok).toBe(false);
  });

  test('go/swap variants do not force a centre opener', () => {
    expect(firstMoveMustBeCenter(1)).toBe(true);
    expect(firstMoveMustBeCenter(19)).toBe(false); // go
    expect(firstMoveMustBeCenter(27)).toBe(false); // swap2-pente
  });
});

// ===================================================================================
// toGamePayload / resultToWinner — the wire games-array shape
// ===================================================================================
describe('toGamePayload builds the import wire shape', () => {
  test('winner is derived from the canonical result', () => {
    expect(resultToWinner('player1')).toBe(1);
    expect(resultToWinner('player2')).toBe(2);
    expect(resultToWinner('draw')).toBe(0);
    expect(resultToWinner(undefined)).toBe(0);
  });

  test('players are plain name strings; unset header fields are null', () => {
    const row = {
      gameId: 1,
      moves: [CENTER, 199],
      header: { player1: { name: 'Alice', rating: 1800 }, player2: null, result: 'player2', site: 'Pente.org' },
    };
    expect(toGamePayload(row)).toEqual({
      game: 1,
      player1: 'Alice',
      player2: null,
      winner: 2,
      site: 'Pente.org',
      event: null,
      round: null,
      section: null,
      playDate: null,
      moves: [CENTER, 199],
    });
  });
});

// ===================================================================================
// runImport — the controller: batch, map duplicates, route analyses to saveAnalysis
// ===================================================================================
describe('runImport — controller', () => {
  const okRow = (id, extra = {}) => ({
    id,
    kind: 'game',
    mode: 'games',
    gameId: 1,
    moves: [CENTER, 199],
    header: {},
    status: { ok: true },
    ...extra,
  });

  test('a >200-game import is split into multiple importGames calls', async () => {
    const importGames = apiMock.useImportGamesMutation()[0];
    const saveAnalysis = apiMock.useSaveAnalysisMutation()[0];
    const rows = Array.from({ length: 250 }, (_, i) => okRow(`r${i}`));
    const out = await runImport(rows, { importGames, saveAnalysis });
    expect(importGames).toHaveBeenCalledTimes(2);
    expect(importGames.mock.calls[0][0]).toHaveLength(200);
    expect(importGames.mock.calls[1][0]).toHaveLength(50);
    expect(out.imported).toBe(250);
  });

  test('duplicate + error indices land on the right preview rows', async () => {
    const importGames = mutation(() => ({
      imported: 1,
      duplicates: [1],
      errors: [{ index: 2, message: 'illegal move at 5' }],
    }));
    const saveAnalysis = apiMock.useSaveAnalysisMutation()[0];
    const rows = [okRow('A'), okRow('B'), okRow('C')];
    const out = await runImport(rows, { importGames, saveAnalysis });
    expect(out.duplicates).toEqual(['B']);
    expect(out.errors).toEqual([{ id: 'C', message: 'illegal move at 5' }]);
  });

  test('"as analysis" rows route to saveAnalysis and skip the games import', async () => {
    const importGames = apiMock.useImportGamesMutation()[0];
    const saveAnalysis = apiMock.useSaveAnalysisMutation()[0];
    const rows = [
      okRow('g1'),
      { id: 'a1', kind: 'analysis', mode: 'analysis', gameId: 1, name: 'Study', tree: { v: 1, root: { m: null } }, moves: [CENTER], status: { ok: true } },
    ];
    const out = await runImport(rows, { importGames, saveAnalysis });
    expect(importGames).toHaveBeenCalledTimes(1);
    expect(importGames.mock.calls[0][0]).toHaveLength(1); // only the game row
    expect(saveAnalysis).toHaveBeenCalledTimes(1);
    expect(saveAnalysis.mock.calls[0][0]).toMatchObject({ name: 'Study', game: 1, tree: { v: 1 } });
    expect(out.analysesSaved).toBe(1);
  });

  test('invalid rows are never sent', async () => {
    const importGames = apiMock.useImportGamesMutation()[0];
    const saveAnalysis = apiMock.useSaveAnalysisMutation()[0];
    const rows = [okRow('good'), okRow('bad', { status: { ok: false, reason: 'nope' } })];
    await runImport(rows, { importGames, saveAnalysis });
    expect(importGames.mock.calls[0][0]).toHaveLength(1);
  });
});

// ===================================================================================
// parseImportText — a parsed PGN becomes preview rows with validity status
// ===================================================================================
describe('parseImportText — preview rows', () => {
  test('a legal PGN game yields an ok row with player labels', () => {
    const rows = parseImportText('games.pgn', validPgn());
    expect(rows).toHaveLength(1);
    expect(rows[0].status.ok).toBe(true);
    expect(rows[0].players).toMatch(/Alice/);
    expect(rows[0].gameId).toBe(1);
    expect(rows[0].moves[0]).toBe(CENTER);
  });

  test('an illegal (off-centre) PGN game is flagged invalid with a reason', () => {
    const rows = parseImportText('bad.pgn', illegalPgn());
    expect(rows[0].status.ok).toBe(false);
    expect(rows[0].status.reason).toBeTruthy();
  });
});

// ===================================================================================
// ImportDialog component — drop → preview → confirm → summary
// ===================================================================================
describe('ImportDialog component', () => {
  test('renders the dialog heading when open', () => {
    renderPlain(<ImportDialog open onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /Import/i })).toBeTruthy();
  });

  test('a selected PGN file becomes a preview row, then Confirm imports and summarises', async () => {
    const importGames = mutation((payload) => ({ imported: payload.length, duplicates: [], errors: [] }));
    apiMock.useImportGamesMutation.mockReturnValue([importGames, { isLoading: false }]);
    renderPlain(<ImportDialog open onClose={() => {}} />);

    const input = document.querySelector('input[type="file"]');
    const file = new File([validPgn()], 'games.pgn', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    // preview row appears (async file read)
    await screen.findByText(/Alice/);

    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(importGames).toHaveBeenCalled());
    await screen.findByText(/1 imported/i);
  });
});
