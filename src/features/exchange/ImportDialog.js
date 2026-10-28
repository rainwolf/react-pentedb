// Import UI (P3 Task 6). Logged-in users drop or pick .sgf/.pgn files; each parsed record
// becomes a preview row (players / variant / move count / ok|invalid+reason) with a per-row
// "as games" vs "as analysis" choice; Confirm then runs the import and shows a summary that
// maps the backend's imported/duplicate/error indices back onto the rows.
//
// SPLIT OF CONCERNS. Everything the controller needs is a pure, separately-tested function
// (parse → rows, validate, batch, resolve response indices, run the mutations); the component
// is just wiring + presentation. That keeps the tricky bits (batch boundaries, index→row
// mapping, the two output paths) unit-testable without a DOM.
//
// TWO OUTPUT PATHS (spec §12). "as games" → useImportGamesMutation in batches of ≤200 (the
// backend contract). "as analysis" → useSaveAnalysisMutation, one POST per tree. A game-kind
// record (PGN, or a linear SGF game) can still be saved as an analysis (its tree is the linear
// spine); an analysis-kind SGF saved "as games" contributes its mainline as the game's moves.
//
// CLIENT VALIDATION IS ADVISORY. We flag the two failures we can detect without replaying
// captures — an empty/out-of-range line and an off-centre opener (the backend's F2 rejection).
// The server stays authoritative: anything it rejects on replay comes back in the summary's
// per-row errors, so a row that previewed "ok" can still land in the error list.
import { useCallback, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import LinearProgress from '@mui/material/LinearProgress';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import { parseSgf, getGameId } from '../../export/sgf';
import { parsePgn } from '../../export/pgn';
import { createTree, addMove, mainline, fromWire, toWire } from '../../model/gameTree';
import { gridSizeForGame, variantKey, centerCell, firstMoveMustBeCenter } from '../../board/boardGeometry';
import { useImportGamesMutation, useSaveAnalysisMutation } from '../../app/api';

// ------------------------------------------------------------------------------------------
// Pure controller logic (unit-tested in import.test.js)
// ------------------------------------------------------------------------------------------

export const BATCH_SIZE = 200; // backend rejects import batches larger than this

// Split into contiguous batches of at most `size` (no empty trailing batch).
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// centerCell / firstMoveMustBeCenter live in the shared board/boardGeometry leaf (mirror of the
// backend's firstMoveCanBeOffCenter); re-exported for existing importers.
export { centerCell, firstMoveMustBeCenter };

// Advisory pre-validation of a linear move line: non-empty, in-range, centre opener when the
// variant requires it. Returns { ok, reason? }.
export function validateMoves(gameId, moves) {
  if (!Number.isInteger(gameId)) return { ok: false, reason: 'Unknown or unsupported variant' };
  if (!Array.isArray(moves) || moves.length === 0) return { ok: false, reason: 'No moves to import' };
  const n = gridSizeForGame(gameId);
  const cap = n * n;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!Number.isInteger(m) || m < 0 || m >= cap) return { ok: false, reason: `Move ${i + 1} is off the board` };
  }
  if (firstMoveMustBeCenter(gameId) && moves[0] !== centerCell(gameId)) {
    return { ok: false, reason: 'First move must be the board centre' };
  }
  return { ok: true };
}

// canonical result -> wire winner int (0 = draw / none).
export function resultToWinner(result) {
  if (result === 'player1') return 1;
  if (result === 'player2') return 2;
  return 0;
}

function nameOf(player) {
  return player && player.name != null ? player.name : null;
}

// A preview row -> the wire game object the import endpoint expects (players are plain name
// strings; unset header fields are explicit null, never omitted).
export function toGamePayload(row) {
  const h = row.header || {};
  return {
    game: row.gameId,
    player1: nameOf(h.player1),
    player2: nameOf(h.player2),
    winner: resultToWinner(h.result),
    site: h.site == null ? null : h.site,
    event: h.event == null ? null : h.event,
    round: h.round == null ? null : h.round,
    section: h.section == null ? null : h.section,
    playDate: h.date == null ? null : h.date,
    moves: row.moves,
  };
}

// Map one batch's response back onto the rows it was built from: duplicate/error indices are
// relative to the batch, so index into the batch's row-id list.
export function resolveBatchOutcome(batchRowIds, response) {
  const duplicates = (response.duplicates || []).map((i) => batchRowIds[i]).filter((x) => x != null);
  const errors = (response.errors || [])
    .map((e) => ({ id: batchRowIds[e.index], message: e.message }))
    .filter((e) => e.id != null);
  return { imported: response.imported || 0, duplicates, errors };
}

function analysisName(row) {
  return row.name || (row.players && row.players !== '(analysis)' ? row.players : null) || 'Imported analysis';
}

// The controller: send the valid "as games" rows in ≤200 batches, save the valid "as analysis"
// rows one at a time, and aggregate a summary keyed by preview-row id. `deps` are the two RTK
// Query mutation triggers (each returns an object with .unwrap()).
export async function runImport(rows, { importGames, saveAnalysis }) {
  const valid = rows.filter((r) => r.status && r.status.ok);
  const gameRows = valid.filter((r) => r.mode === 'games');
  const analysisRows = valid.filter((r) => r.mode === 'analysis');

  let imported = 0;
  const duplicates = [];
  const errors = [];
  for (const batch of chunk(gameRows, BATCH_SIZE)) {
    const res = await importGames(batch.map(toGamePayload)).unwrap();
    const out = resolveBatchOutcome(batch.map((r) => r.id), res);
    imported += out.imported;
    duplicates.push(...out.duplicates);
    errors.push(...out.errors);
  }

  let analysesSaved = 0;
  const analysisErrors = [];
  for (const r of analysisRows) {
    try {
      await saveAnalysis({ name: analysisName(r), game: r.gameId, tree: r.tree }).unwrap();
      analysesSaved += 1;
    } catch {
      analysisErrors.push({ id: r.id, message: 'Could not save analysis' });
    }
  }

  return { imported, duplicates, errors, analysesSaved, analysisErrors };
}

// ------------------------------------------------------------------------------------------
// Parsing files -> preview rows
// ------------------------------------------------------------------------------------------

function buildTree(moves) {
  let res = { tree: createTree(), path: [] };
  for (const m of moves) res = addMove(res.tree, res.path, m);
  return res.tree;
}

function playersLabel(header) {
  const p1 = header.player1 && header.player1.name;
  const p2 = header.player2 && header.player2.name;
  return `${p1 || '?'} vs ${p2 || '?'}`;
}

function rowFromRecord(fileName, rec, i) {
  const id = `${fileName}#${i}`;
  if (rec.kind === 'analysis') {
    const moves = mainline(fromWire(rec.tree));
    const gameId = rec.gameId;
    const status = validateMoves(gameId, moves);
    return {
      id,
      fileName,
      kind: 'analysis',
      name: rec.name,
      gameId,
      moves,
      tree: rec.tree,
      header: { game: gameId },
      players: rec.name || '(analysis)',
      variant: Number.isInteger(gameId) ? variantKey(gameId) : '?',
      moveCount: moves.length,
      status,
      mode: 'analysis',
      warnings: rec.warnings || [],
    };
  }
  const header = rec.header || {};
  const gameId = rec.gameId;
  const moves = rec.moves || [];
  const status = validateMoves(gameId, moves);
  return {
    id,
    fileName,
    kind: 'game',
    name: rec.name,
    gameId,
    moves,
    tree: Number.isInteger(gameId) ? toWire(buildTree(moves)) : { v: 1, root: { m: null } },
    header,
    players: playersLabel(header),
    variant: Number.isInteger(gameId) ? variantKey(gameId) : '?',
    moveCount: moves.length,
    status,
    mode: 'games',
    warnings: rec.warnings || [],
  };
}

// Parse one file's text into preview rows. Throws typed SgfError/PgnError (with a line) on a
// malformed file — callers wanting one-bad-file-does-not-kill-the-batch use safeParseImportText.
export function parseImportText(fileName, text) {
  const lower = fileName.toLowerCase();
  let records;
  if (lower.endsWith('.sgf')) {
    const r = parseSgf(text);
    records =
      r.kind === 'analysis'
        ? [{ kind: 'analysis', name: r.name, tree: r.tree, gameId: getGameId(r.game), warnings: r.warnings }]
        : [
            {
              kind: 'game',
              header: r.header,
              moves: r.moves,
              name: r.name,
              gameId: r.header ? r.header.game : getGameId(r.game),
              warnings: r.warnings,
            },
          ];
  } else {
    records = parsePgn(text).map((g) => ({
      kind: 'game',
      header: g.header,
      moves: g.moves,
      name: g.header && g.header.name,
      gameId: g.header && g.header.game,
      warnings: g.warnings,
    }));
  }
  return records.map((rec, i) => rowFromRecord(fileName, rec, i));
}

// parseImportText, but a parse failure becomes a single invalid "error" row instead of throwing.
export function safeParseImportText(fileName, text) {
  try {
    return parseImportText(fileName, text);
  } catch (e) {
    const where = e && e.line ? ` (line ${e.line})` : '';
    return [
      {
        id: `${fileName}#err`,
        fileName,
        kind: 'error',
        name: fileName,
        gameId: null,
        moves: [],
        tree: null,
        header: {},
        players: fileName,
        variant: '?',
        moveCount: 0,
        status: { ok: false, reason: `Parse error: ${(e && e.message) || 'unreadable file'}${where}` },
        mode: 'games',
        warnings: [],
      },
    ];
  }
}

// ------------------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------------------

function StatusCell({ status }) {
  if (status.ok) {
    return <CheckCircleOutlineIcon color="success" fontSize="small" aria-label="valid" />;
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'error.main' }}>
      <ErrorOutlineIcon fontSize="small" aria-label="invalid" />
      <Typography variant="caption" color="error">
        {status.reason}
      </Typography>
    </Box>
  );
}

export default function ImportDialog({ open, onClose }) {
  const [rows, setRows] = useState([]);
  const [phase, setPhase] = useState('select'); // 'select' | 'summary'
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const [importGames] = useImportGamesMutation();
  const [saveAnalysis] = useSaveAnalysisMutation();

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    const parsed = [];
    for (const f of files) {
      let text = '';
      try {
        text = await f.text();
      } catch {
        text = '';
      }
      parsed.push(...safeParseImportText(f.name, text));
    }
    // Reassign ids at merge time so they are unique across files (and stable summary keys).
    setRows((prev) => [...prev, ...parsed.map((r, i) => ({ ...r, id: `row-${prev.length + i}` }))]);
  }, []);

  const setMode = (id, mode) => {
    if (!mode) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, mode } : r)));
  };

  const reset = () => {
    setRows([]);
    setPhase('select');
    setSummary(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    if (onClose) onClose();
  };

  const validCount = useMemo(() => rows.filter((r) => r.status.ok).length, [rows]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const s = await runImport(rows, { importGames, saveAnalysis });
      setSummary(s);
      setPhase('summary');
    } finally {
      setBusy(false);
    }
  };

  const rowsById = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);
  const labelFor = (id) => {
    const r = rowsById.get(id);
    return r ? r.players : id;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth aria-labelledby="import-title">
      <DialogTitle id="import-title">Import games</DialogTitle>
      <DialogContent dividers>
        {busy && <LinearProgress sx={{ mb: 1 }} />}

        {phase === 'select' && (
          <>
            <Box
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              sx={{
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                mb: 1,
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Drag SGF or PGN files here, or
              </Typography>
              <Button variant="outlined" size="small" onClick={() => inputRef.current && inputRef.current.click()}>
                Choose files
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".sgf,.pgn"
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
            </Box>

            {rows.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                No files selected yet.
              </Typography>
            ) : (
              <Box role="table" aria-label="Import preview">
                {rows.map((r) => (
                  <Box
                    key={r.id}
                    role="row"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      py: 0.5,
                      borderBottom: 1,
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{ width: 150, flexShrink: 0 }}>
                      <StatusCell status={r.status} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {r.players}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {r.variant} · {r.moveCount} moves · {r.fileName}
                      </Typography>
                    </Box>
                    {r.kind !== 'error' && (
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={r.mode}
                        onChange={(e, v) => setMode(r.id, v)}
                        aria-label={`Import ${r.players} as`}
                      >
                        <ToggleButton value="games" aria-label="As games">
                          Games
                        </ToggleButton>
                        <ToggleButton value="analysis" aria-label="As analysis">
                          Analysis
                        </ToggleButton>
                      </ToggleButtonGroup>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}

        {phase === 'summary' && summary && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {summary.imported} imported
              {summary.analysesSaved ? `, ${summary.analysesSaved} saved as analyses` : ''}
            </Typography>
            {summary.duplicates.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                {summary.duplicates.length} duplicate(s) skipped: {summary.duplicates.map(labelFor).join(', ')}
              </Typography>
            )}
            {summary.errors.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="error">
                  {summary.errors.length} rejected:
                </Typography>
                {summary.errors.map((e) => (
                  <Typography key={e.id} variant="caption" color="error" display="block">
                    {labelFor(e.id)} — {e.message}
                  </Typography>
                ))}
              </Box>
            )}
            {summary.analysisErrors.length > 0 && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                {summary.analysisErrors.length} analysis save(s) failed.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {phase === 'select' ? (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button variant="contained" onClick={handleConfirm} disabled={busy || validCount === 0}>
              Import{validCount ? ` (${validCount})` : ''}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
