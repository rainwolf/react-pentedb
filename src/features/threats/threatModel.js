// Threat-overlay model — the pure glue between the Task-3 engine and the Task-4 UI.
//
//   - categoryOf(type)      which of the three shown categories a raw threat type belongs to
//                           (trias / fours / potential-captures), or null for types the
//                           overlay deliberately never draws (blocked, potential-three/four).
//   - threatGate(activePos) whether threats are trustworthy for this position, and if not, why
//                           (so ThreatsPanel can explain it). See the gate rationale below.
//   - shownThreats(...)     the engine threats that pass BOTH the shown-category filter and the
//                           per-player toggle grid — the exact set ThreatBands paints.
//   - useThreatAnalysis()   memoized per-position analysis (one engine run, one board build),
//                           keyed on posKey; the panel and the bands each call it independently
//                           and recompute is <1ms, so there's no need to share a single result.
//
// GATE RATIONALE (capture-alternation safety): the engine assumes strict P1,P2,P1,P2… move
// alternation — analyzeMove() filters the move history with `getPosition(m) === (i % 2) + 1`,
// so any stone whose colour doesn't match its move parity is silently dropped. That holds for
// the plain-alternation variants but NOT for (a) Connect6, which plays two stones per turn,
// and (b) any opening that re-assigns colours (swap2 / d-pente / renju). We therefore enable
// the overlay only for the AI-supported set (the same gate the AI panel uses), MINUS Connect6,
// MINUS any position whose side-to-move diverges from strict parity (currentColor() != 1+n%2)
// — a direct, position-level test that a non-alternating opening occurred.
import { useMemo } from 'react';
import {
  TYPE_POTENTIAL_CAPTURE,
  TYPE_TRIA,
  TYPE_CLOSED_FOUR,
  TYPE_OPEN_FOUR,
} from '../../threats/threatConstants';
import { analyzePosition } from '../../threats/threatEngine';
import { buildBoardGame } from '../viewer/boardGameFactory';
import { gridSizeForGame } from '../../board/boardGeometry';
import { getAiCapability } from '../ai/aiClient';

// Raw threat type → the visible category, or null if the overlay never draws this type.
// (Only trias, fours, and potential captures are shown — spec §10.2 / the desktop `threats`
// toggle. Potential three/four and blocked records stay hidden to keep the board readable.)
export function categoryOf(type) {
  if (type === TYPE_TRIA) return 'trias';
  if (type === TYPE_CLOSED_FOUR || type === TYPE_OPEN_FOUR) return 'fours';
  if (type === TYPE_POTENTIAL_CAPTURE) return 'captures';
  return null;
}

// Is the threat overlay trustworthy for this position? Returns { safe, reason }, reason ∈
// { 'no-position', 'variant', 'connect6', 'opening' } when unsafe.
export function threatGate(activePos) {
  if (!activePos) return { safe: false, reason: 'no-position' };
  const { game, moves } = activePos;
  if (!getAiCapability(game).supported) return { safe: false, reason: 'variant' };
  if (game === 13 || game === 14) return { safe: false, reason: 'connect6' };
  // Non-alternating opening probe: build the rules engine and compare its true colour-to-move
  // against strict parity. They agree for every plain-alternation variant and diverge for a
  // swap/opening re-assignment — future-proofing the gate if the AI set ever gains one.
  const g = buildBoardGame(game, moves);
  const n = (moves || []).length;
  if (typeof g.currentColor === 'function' && g.currentColor() !== 1 + (n % 2)) {
    return { safe: false, reason: 'opening' };
  }
  return { safe: true };
}

// The threats that both belong to a shown category AND are enabled for their player in the
// toggle grid — the precise set ThreatBands renders.
export function shownThreats(result, toggles) {
  if (!result || !result.threats) return [];
  return result.threats.filter((t) => {
    const cat = categoryOf(t.type);
    if (!cat) return false;
    const perPlayer = toggles && toggles[t.player];
    return !!(perPlayer && perPlayer[cat]);
  });
}

// Memoized per-position analysis: one board build + one engine run, keyed on the position, so
// the panel (counts) and the bands (geometry) never analyse twice. Returns { gate, result, n }
// where result is null when the gate is unsafe (nothing to analyse).
export function useThreatAnalysis(activePos) {
  const posKey = activePos ? `${activePos.game}:${activePos.moves.join('-')}` : '';
  return useMemo(() => {
    const gate = threatGate(activePos);
    const n = activePos ? gridSizeForGame(activePos.game) : 19;
    if (!activePos || !gate.safe) return { gate, result: null, n };
    const game = buildBoardGame(activePos.game, activePos.moves);
    const result = analyzePosition({ game, moves: activePos.moves, boardW: n, boardH: n });
    return { gate, result, n };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey]);
}
