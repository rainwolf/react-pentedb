// BoardHeatOverlay — the explorer's candidate heat, overlaid on the REAL board (not the old
// standalone mini-preview). A pointer-events:none sibling of <Board> in BoardPane, right after
// ThreatBands, so it tracks the SAME shared board rotation.
//
// It reads the active position (the same debounced canonical line the ExplorerPanel uses) and
// the same position-stats query — RTK Query dedups the identical request, so mounting this adds
// NO extra network call. The `heatOnBoard` toggle (ui slice, default ON) shows/hides it, and the
// shared `heatHoverCell` (written by StatsRows onHover) drives the bright hover highlight so
// hovering a stats row lights that exact cell up on the board.
//
// DEFENSIVE MOUNT. BoardPane is rendered by tests that build a bare docs+ui store with NO
// RTK-Query `api` slice (viewer.test.js, threats.test.js, BoardPane.integration.test.js). With
// no api slice there is nothing to query, so we detect its absence and render nothing WITHOUT
// ever invoking the query hook (which would otherwise require the api middleware/reducer). The
// query hook lives in the inner BoardHeatData, mounted only once the api slice is present.
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { usePingQuery } from '../../app/api';
import usePositionStats from './usePositionStats';
import { applyMove } from '../../model/docSlice';
import {
  selectScope,
  selectEffectiveScope,
  selectRotation,
  selectHeatOnBoard,
  selectHeatHoverCell,
  selectExplorerSort,
  selectExplorerLimit,
  selectFilters,
  setHeatHoverCell,
} from '../../app/uiSlice';
import { gridSizeForGame } from '../../board/boardGeometry';
import useDebouncedPosition from './useDebouncedPosition';
import HeatOverlay from './HeatOverlay';
import { displayedCandidates } from './displayedCandidates';

// Inner: runs the position-stats query. Only mounted when the api slice exists (see below).
function BoardHeatData() {
  const dispatch = useDispatch();
  const on = useSelector(selectHeatOnBoard);
  const rotation = useSelector(selectRotation);
  const hoverCell = useSelector(selectHeatHoverCell);
  const pos = useDebouncedPosition(150);

  // Board → list hover (symmetric with the list → board direction StatsRows already drives) and
  // click-to-play, both keyed by the disc's LOCAL move (data-canonical). Enabling pointer events
  // on a disc would otherwise swallow the board's own click on that empty candidate cell, so the
  // disc's onClick restores click-to-play: applyMove(localMove) directly — the disc already knows
  // its local move, so NO inverse-symmetry mapping and the display cell is never used.
  const handleEnter = useCallback((cell) => dispatch(setHeatHoverCell(cell)), [dispatch]);
  const handleLeave = useCallback(() => dispatch(setHeatHoverCell(null)), [dispatch]);
  const handleClick = useCallback(
    (cell) => {
      dispatch(applyMove(cell));
      dispatch(setHeatHoverCell(null));
    },
    [dispatch]
  );

  // Same effective-scope coercion the ExplorerPanel uses, so the position-stats arg is identical
  // and RTK Query serves both from one cached request instead of firing a second one.
  const { data: ping } = usePingQuery();
  const scope = selectEffectiveScope(ping?.auth ?? null, useSelector(selectScope));

  const filters = useSelector(selectFilters); // the shared applied set: board heat == list numbers
  const sortMode = useSelector(selectExplorerSort);
  const limit = useSelector(selectExplorerLimit);
  const hasPos = !!pos;
  const game = pos ? pos.game : 1;
  const moves = pos ? pos.moves : [];
  const gridSize = gridSizeForGame(game);

  const { data } = usePositionStats(
    { game, moves, scope, filters },
    { skip: !on || !hasPos } // toggle OFF or no position → no request fires
  );

  // nextMoves[].move arrives ALREADY in the caller's local/canonical board orientation — the
  // server pre-rotates each candidate (see api.js). The response's own top-level `rotation` is
  // informational only and is intentionally never read here. `rotation` below (from
  // selectRotation) is a DIFFERENT thing: the ui slice's local VIEW-rotation preference, which
  // HeatOverlay uses to map each already-local cell onto the currently-rotated board display.
  const nextMoves = (data && data.nextMoves) || [];
  // Same exclusion as the list (ExplorerPanel): drop candidates already on the board so an echoed
  // played cell neither anchors the domain nor paints a disc over its own stone — one filtered set.
  // Same helper as the list (sort, then first N) so board discs == listed rows.
  const cells = displayedCandidates(nextMoves, moves, sortMode, limit);
  if (!on || !hasPos || cells.length === 0) return null;

  return (
    <HeatOverlay
      cells={cells}
      gridSize={gridSize}
      rotation={rotation}
      hoverCell={hoverCell}
      onCellEnter={handleEnter}
      onCellLeave={handleLeave}
      onCellClick={handleClick}
    />
  );
}

export default function BoardHeatOverlay() {
  // Presence of the RTK-Query api slice (reducerPath 'api'). Absent on the bare docs+ui stores
  // the viewer/threats tests build → render nothing and never touch the query hook.
  const hasApi = useSelector((s) => !!(s && s.api));
  if (!hasApi) return null;
  return <BoardHeatData />;
}
