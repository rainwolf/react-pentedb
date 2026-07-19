// AiPanel — the AI advisor (P4 Task 2). Two features over the single engine seam (aiClient):
//   1. Hint — ask the engine for a move at the current position and paint it as a ghost on the
//      board (AiGhostOverlay) plus a coordinate chip you can click to play.
//   2. Play vs AI — a toggle + colour choice; after each of the human's moves the engine answers
//      automatically, appending its reply into the move TREE (analysis semantics — a variation
//      off any node is fine, we always append at the cursor).
//
// Discipline (brief): ONE request in flight at a time — Hint is disabled while pending and the
// board is locked (BoardPane reads `thinking`); every rejection is caught — a `cancelled` one is
// silent (navigation/tab switch), a crash is a visible, retryable error. Leaving the panel while
// a request is pending cancels it (cleanup effect).
//
// NOTE (wasm-ai-contract.md §6): the engine returns only a move — there is no evaluation score
// or live "thinking" feed to show. Copy says "suggestion", never "eval". Do not fabricate one.
import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';

import { selectActivePosition, applyMove } from '../../model/docSlice';
import { variantKey, gridSizeForGame } from '../../board/boardGeometry';
import { moveLabel } from '../explorer/StatsRows';
import { buildBoardGame } from '../viewer/boardGameFactory';
import { getAiCapability, requestMove, cancel } from './aiClient';
import {
  positionSig,
  selectAi,
  selectAiSuggestion,
  selectAiPlay,
  setLevel,
  setOpeningBook,
  setPlayOn,
  setAiPlayer,
  thinkingStarted,
  suggestionReceived,
  requestSettled,
  requestFailed,
  requestCancelled,
  clearSuggestion,
  clearError,
} from './aiSlice';

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// variantKey -> a human label, e.g. 'd-pente' -> 'D-Pente', 'go' -> 'Go'.
function prettyVariant(game) {
  return variantKey(game)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

export default function AiPanel() {
  const dispatch = useDispatch();
  const activePos = useSelector(selectActivePosition);
  const ai = useSelector(selectAi);
  const suggestion = useSelector(selectAiSuggestion);
  const play = useSelector(selectAiPlay);
  const { level, openingBook, status, error } = ai;
  const thinking = status === 'thinking';

  const game = activePos ? activePos.game : null;
  const cap = game != null ? getAiCapability(game) : { supported: false };
  const supported = !!(activePos && cap.supported);
  const gridSize = game != null ? gridSizeForGame(game) : 19;

  // A suggestion is shown/playable only while the board still holds the position it was computed
  // for; any navigation changes activeSig and retires the ghost + chip.
  const activeSig = positionSig(activePos);
  const suggestionActive = !!(suggestion && suggestion.sig === activeSig);

  // Mirror `thinking` into a ref so the unmount cleanup (a stable [] effect) can read the LIVE
  // busy state without re-subscribing on every status change.
  const thinkingRef = useRef(false);
  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  // Dedup guard for the play-vs-AI effect: the exact position we last fired a reply for. Stops
  // React re-renders / StrictMode double-invokes from launching a second request for one turn.
  const answeredSigRef = useRef(null);

  // Tab switch / navigation away while a search is running: abort it so a stale reply can never
  // land in a document the user has left. (aiClient.cancel rejects the in-flight promise with
  // err.cancelled, which our .catch treats silently.)
  useEffect(
    () => () => {
      if (thinkingRef.current) cancel();
    },
    []
  );

  const onError = useCallback(
    (err) => {
      if (err && err.cancelled) {
        dispatch(requestCancelled()); // intentional — stay silent
        return;
      }
      const msg =
        err && err.workerCrashed
          ? 'The AI engine crashed. Try again.'
          : (err && err.message) || 'The AI request failed.';
      dispatch(requestFailed(msg));
    },
    [dispatch]
  );

  const onHint = useCallback(() => {
    if (!supported || thinking || !activePos) return;
    const pos = activePos;
    const sig = positionSig(pos); // bind the reply to THIS position
    dispatch(thinkingStarted());
    // Forward the RAW variant id (the engine owns id->rules mapping — aiClient contract).
    requestMove({ game: pos.game, level, openingBook: openingBook ? 1 : 0, moves: pos.moves })
      .then(({ moves: cells }) => dispatch(suggestionReceived({ game: pos.game, cells, sig })))
      .catch(onError);
  }, [supported, thinking, activePos, level, openingBook, dispatch, onError]);

  const onPlaySuggestion = useCallback(() => {
    // Guard against a stale suggestion (the position moved since it was computed) — never append
    // an old cell onto a different position.
    if (!suggestion || suggestion.sig !== activeSig) return;
    suggestion.cells.forEach((c) => dispatch(applyMove(c))); // Connect6 pair = two appends
    dispatch(clearSuggestion());
  }, [suggestion, activeSig, dispatch]);

  const onTogglePlay = useCallback(
    (on) => {
      if (!on && thinkingRef.current) {
        cancel();
        dispatch(requestCancelled());
      }
      answeredSigRef.current = null; // re-arm so the current position can be answered at once
      dispatch(setPlayOn(on));
    },
    [dispatch]
  );

  const onChooseColor = useCallback(
    (value) => {
      if (value == null) return;
      answeredSigRef.current = null; // colour change may hand the current turn to the AI
      dispatch(setAiPlayer(value));
    },
    [dispatch]
  );

  // Play-vs-AI auto-answer. Watches the settled position; when it is the AI's turn (per the
  // engine's own currentPlayer(), which handles Connect6's two-stone turns and the opening
  // phases) it requests a reply and appends the whole turn into the tree.
  useEffect(() => {
    if (!play.on || !supported || !activePos) return;
    if (thinking) return; // single in-flight
    const g = buildBoardGame(activePos.game, activePos.moves);
    if (g.currentPlayer() !== play.aiPlayer) return; // human's turn — wait
    const sig = `${activePos.game}:${activePos.moves.join('-')}`;
    if (answeredSigRef.current === sig) return; // already answered this exact position
    answeredSigRef.current = sig;
    dispatch(thinkingStarted());
    requestMove({
      game: activePos.game,
      level,
      openingBook: openingBook ? 1 : 0,
      moves: activePos.moves,
    })
      .then(({ moves: cells }) => {
        // Apply the ENTIRE reply (two stones for Connect6) while status is still 'thinking',
        // THEN clear busy — so the mid-pair position (still the AI's turn) can't re-enter this
        // effect and fire a second request for the same turn.
        cells.forEach((c) => dispatch(applyMove(c)));
        dispatch(requestSettled());
      })
      .catch(onError);
  }, [
    play.on,
    play.aiPlayer,
    supported,
    thinking,
    activePos,
    level,
    openingBook,
    dispatch,
    onError,
  ]);

  // ---- render -------------------------------------------------------------------------------
  if (!activePos) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          AI
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Open a game to use the AI assistant.
        </Typography>
      </Box>
    );
  }

  if (!supported) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2">AI</Typography>
        <Alert severity="info" data-testid="ai-unavailable">
          AI is not available for {prettyVariant(game)}.
        </Alert>
        <Typography variant="body2" color="text.secondary">
          You can still use the Explorer for master-game statistics on this position.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2">AI</Typography>

      <FormControl size="small" fullWidth>
        <InputLabel id="ai-level-label">Level</InputLabel>
        <Select
          labelId="ai-level-label"
          label="Level"
          value={level}
          onChange={(e) => dispatch(setLevel(Number(e.target.value)))}
          inputProps={{ 'data-testid': 'ai-level' }}
        >
          {LEVELS.map((n) => (
            <MenuItem key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControlLabel
        control={
          <Switch
            checked={openingBook}
            onChange={(e) => dispatch(setOpeningBook(e.target.checked))}
            inputProps={{ 'data-testid': 'ai-opening-book' }}
          />
        }
        label="Opening book"
      />

      <Button
        variant="contained"
        size="small"
        startIcon={<LightbulbOutlinedIcon fontSize="small" />}
        onClick={onHint}
        disabled={thinking}
        data-testid="ai-hint"
      >
        Hint
      </Button>

      {thinking && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} data-testid="ai-thinking">
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            Thinking…
          </Typography>
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          data-testid="ai-error"
          onClose={() => {
            // Dismissing the error re-arms the play-vs-AI auto-answer for the current position so
            // a one-off engine hiccup can be retried without toggling the mode off/on. The dedup
            // guard still blocks a tight loop: a repeat crash just re-raises this same error.
            answeredSigRef.current = null;
            dispatch(clearError());
          }}
        >
          {error}
        </Alert>
      )}

      {suggestionActive && (
        <Chip
          color="secondary"
          variant="outlined"
          data-testid="ai-suggestion-chip"
          onClick={onPlaySuggestion}
          label={`AI suggests ${suggestion.cells.map((c) => moveLabel(c, gridSize)).join(', ')}`}
        />
      )}

      <Divider />

      <FormControlLabel
        control={
          <Switch
            checked={play.on}
            onChange={(e) => onTogglePlay(e.target.checked)}
            inputProps={{ 'data-testid': 'ai-play-toggle' }}
          />
        }
        label="Play vs AI"
      />

      {play.on && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            AI plays
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={play.aiPlayer}
            onChange={(e, v) => onChooseColor(v)}
            data-testid="ai-color"
          >
            <ToggleButton value={1} data-testid="ai-color-first">
              First (Black)
            </ToggleButton>
            <ToggleButton value={2} data-testid="ai-color-second">
              Second (White)
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary">
        Suggestions only — the engine returns a move, not a position evaluation.
      </Typography>
    </Box>
  );
}
