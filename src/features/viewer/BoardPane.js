// The board and its interaction surface. Reads the active position from docSlice, replays it
// into a GameClass, and renders the (frozen, copied) <Board>. Responsibilities:
//   - Place: analysis mode always allows placing at the cursor, so myTurn is passed true; the
//     copied Board only fires onMove for legal empty cells. A legal click dispatches applyMove
//     (Task 3 append-vs-variation); an occupied cell no-ops with a brief shake (defensive — the
//     Board already gates occupied cells, but the guard makes the intent explicit and testable).
//   - Navigate: mouse wheel over the board steps prev/next (desktop parity, spec §9).
//   - Rotate: a control cycles the 8 board symmetries as a PURE VIEW transform — the displayed
//     board is built from symmetry-mapped moves and a click is inverse-mapped back to the stored
//     (canonical) orientation, so the move tree is never rotated.
//   - Touch: on a coarse pointer, tap-confirm (spec §9) — a tap sets a pending ghost stone
//     (shown on the view board) and a Confirm button commits it; tapping elsewhere moves the
//     ghost. Prevents fat-finger misplays.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import Board from '../../board/Board';
import { gridSizeForGame } from '../../board/boardGeometry';
import { applyMove, navNext, navPrev, selectActivePosition } from '../../model/docSlice';
import { setRotation, selectRotation } from '../../app/uiSlice';
import { selectAiThinking } from '../ai/aiSlice';
import AiGhostOverlay from '../ai/AiGhostOverlay';
import ThreatBands from '../threats/ThreatBands';
import { buildBoardGame } from './boardGameFactory';
import { symCell, symMoves, invSymCell } from './boardSymmetry';
import '../../resources/board.css';

const SHAKE_MS = 300;

function detectCoarse(override) {
  if (override !== undefined) return override;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

export default function BoardPane({ pointerCoarse } = {}) {
  const dispatch = useDispatch();
  const activePos = useSelector(selectActivePosition);
  // While the AI is searching (a Hint or a play-vs-AI reply) the board is LOCKED: no placing,
  // no wheel navigation — so the user cannot race the engine or apply its reply into a position
  // it did not analyse. selectAiThinking is defensive about a store without the `ai` slice.
  const aiThinking = useSelector(selectAiThinking);
  // Board view orientation is SHARED state (ui slice), not component-local: the threat bands,
  // the AI ghost and (later) the heat ghost are all overlays on this same board and must
  // transform through the same rotation. BoardPane owns the control; every overlay reads the
  // same selectRotation value.
  const rotation = useSelector(selectRotation);

  const [pending, setPending] = useState(null); // canonical cell of a tap-confirm ghost, or null
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef(null);

  const coarse = detectCoarse(pointerCoarse);
  const gridSize = activePos ? gridSizeForGame(activePos.game) : 19;
  const posKey = activePos ? `${activePos.game}:${activePos.moves.join('-')}` : '';

  // The displayed move list: canonical moves mapped through the current symmetry, plus the
  // pending tap-confirm ghost (also mapped) appended as the next stone.
  const displayMoves = useMemo(() => {
    if (!activePos) return [];
    const base = symMoves(activePos.moves, rotation, gridSize);
    if (pending != null) base.push(symCell(pending, rotation, gridSize));
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, rotation, gridSize, pending]);

  const boardGame = useMemo(
    () => (activePos ? buildBoardGame(activePos.game, displayMoves) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePos ? activePos.game : null, displayMoves]
  );

  // A staged tap-confirm ghost belongs to the position it was placed on. When the active
  // position changes for ANY reason (nav buttons, keyboard, wheel, tab switch — all reflected
  // in posKey), discard it so Confirm can never commit it into the wrong position.
  useEffect(() => {
    setPending(null);
  }, [posKey]);

  useEffect(() => () => shakeTimer.current && clearTimeout(shakeTimer.current), []);

  const triggerShake = useCallback(() => {
    setShaking(true);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShaking(false), SHAKE_MS);
  }, []);

  // Board hands us a DISPLAY cell; map it back to the stored orientation before touching the tree.
  // The REAL <Board> passes `e.target.id` — a STRING flat-index (quotes stripped). Coerce to a
  // number FIRST: invSymCell compares candidates against numeric symCell() outputs with ===, so a
  // string silently matches nothing and the rotation transform no-ops (the Phase-2 live defect).
  const handleMove = useCallback(
    (rawDisplayCell) => {
      if (!activePos || aiThinking) return; // board locked while the engine searches
      const displayCell = Number(rawDisplayCell);
      if (Number.isNaN(displayCell)) return;
      const canonical = invSymCell(displayCell, rotation, gridSize);
      if (coarse) {
        setPending(canonical); // tap-confirm: stage, don't commit
        return;
      }
      if (boardGame && boardGame.getPosition(displayCell) !== 0) {
        triggerShake(); // occupied / illegal — no-op with feedback
        return;
      }
      dispatch(applyMove(canonical));
    },
    [activePos, aiThinking, rotation, gridSize, coarse, boardGame, dispatch, triggerShake]
  );

  const handleWheel = useCallback(
    (e) => {
      if (!activePos || aiThinking) return; // no stepping while the engine searches
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (e.deltaY > 0) dispatch(navNext());
      else if (e.deltaY < 0) dispatch(navPrev());
    },
    [activePos, aiThinking, dispatch]
  );

  const confirmPending = () => {
    if (pending != null) {
      dispatch(applyMove(pending));
      setPending(null);
    }
  };
  const cancelPending = () => setPending(null);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, p: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 32 }}>
        <IconButton
          size="small"
          title="Rotate board"
          aria-label="Rotate board"
          disabled={!activePos}
          onClick={() => dispatch(setRotation(rotation + 1))}
        >
          <RotateRightIcon fontSize="small" />
        </IconButton>
        {rotation !== 0 && (
          <IconButton
            size="small"
            title="Reset board orientation"
            aria-label="Reset board orientation"
            onClick={() => dispatch(setRotation(0))}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
        )}
        {pending != null && (
          <>
            <Button size="small" variant="contained" aria-label="Confirm move" onClick={confirmPending}>
              Confirm
            </Button>
            <Button size="small" aria-label="Cancel move" onClick={cancelPending}>
              Cancel
            </Button>
          </>
        )}
      </Box>

      <Box
        data-testid="board-pane"
        data-shake={shaking ? 'true' : 'false'}
        className={shaking ? 'board-shake' : undefined}
        onWheel={handleWheel}
        sx={{ position: 'relative', width: '100%', maxWidth: 640, aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {boardGame && activePos ? (
          <>
            {/* myTurn gates the real Board's onMove: false during an AI search locks placement. */}
            <Board game={boardGame} gameId={activePos.game} myTurn={!aiThinking} onMove={handleMove} />
            {/* The AI's suggested move(s), mapped through the SAME view rotation as the board. */}
            <AiGhostOverlay rotation={rotation} />
            {/* Threat bands — same shared rotation, so bands track the board on every rotate. */}
            <ThreatBands rotation={rotation} />
            {aiThinking && (
              <Box
                data-testid="board-thinking"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(0,0,0,0.04)',
                  cursor: 'progress',
                }}
              >
                <CircularProgress size={28} />
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ textAlign: 'center', px: 4, color: 'text.secondary' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>
              No position open
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Open a game or search a position to start analysing.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
