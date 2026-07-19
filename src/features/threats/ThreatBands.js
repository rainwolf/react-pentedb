// ThreatBands — the threat-visualization overlay (P4 Task 4, spec §10.2). One translucent,
// player-tinted band per shown threat run (the stones of a tria / four, or the flanked pair
// of a potential capture); each threat's gain squares (where the owner advances, or the
// capturing square) are drawn as small dotted markers.
//
// Same overlay discipline as AiGhostOverlay: a pointer-events:none SVG sized to the grid with
// the shared 10-unit placeholder geometry, sitting absolutely over the board as a sibling of
// <Board>. Canonical engine cells are mapped to the DISPLAY orientation with symCell(rotation)
// — `rotation` is the SHARED board view value (ui slice), handed down by BoardPane exactly as
// it is to AiGhostOverlay, so bands, ghost and board always agree.
//
// Which threats appear is driven entirely by the per-player × category toggle grid (ui slice,
// set from ThreatsPanel). When the position is not capture-alternation-safe the analysis is
// null (the gate withholds it) and nothing paints — ThreatsPanel explains why.
import { useSelector } from 'react-redux';
import { selectActivePosition } from '../../model/docSlice';
import { selectThreatToggles } from '../../app/uiSlice';
import { symCell } from '../viewer/boardSymmetry';
import { useThreatAnalysis, shownThreats, categoryOf } from './threatModel';

// Player tints — distinct hues that read on the wood board in both themes and stay clear of
// the AI ghost's violet. Player 1 blue, player 2 orange.
const TINT = { 1: '#1e88e5', 2: '#fb8c00' };

// Per-category band weight/opacity: fours are the most urgent, captures the least.
const STYLE = {
  fours: { width: 7.5, opacity: 0.34 },
  trias: { width: 6, opacity: 0.27 },
  captures: { width: 5.5, opacity: 0.24 },
};

// Gain squares for a threat: the advancing squares, plus a capture's capturing square.
function gainCells(t) {
  const gs = Array.isArray(t.gainSquares) ? t.gainSquares.slice() : [];
  if (categoryOf(t.type) === 'captures' && t.captureMove && !gs.includes(t.captureMove)) {
    gs.push(t.captureMove);
  }
  return gs;
}

export default function ThreatBands({ rotation = 0 }) {
  const activePos = useSelector(selectActivePosition);
  const toggles = useSelector(selectThreatToggles);
  const { result, n } = useThreatAnalysis(activePos);

  const shown = shownThreats(result, toggles);
  if (!activePos || shown.length === 0) return null;

  const span = 10 * (n + 1);
  const center = (cell) => {
    const disp = symCell(cell, rotation, n);
    return { disp, cx: 10 * (disp % n), cy: 10 * Math.floor(disp / n) };
  };

  return (
    <svg
      data-testid="threat-bands"
      viewBox={`0 0 ${span} ${span}`}
      width="100%"
      height="100%"
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* Phase 4 registration: reproduce the board's transform stack so band endpoints and
          gain markers land dead-centre on their grid intersections (see HeatOverlay). */}
      <g transform="translate(14.5,14.5) scale(0.95)">
        {shown.map((t, i) => {
          const cat = categoryOf(t.type);
          const tint = TINT[t.player] || TINT[1];
          const style = STYLE[cat] || STYLE.trias;
          const canonical = t.cells || [];
          const display = canonical.map((c) => symCell(c, rotation, n));
          // The run is collinear and symmetry preserves lines, so the two extreme stones stay
          // the band's endpoints under any rotation: map the sorted-ascending first & last.
          const a = center(canonical[0]);
          const b = center(canonical[canonical.length - 1]);
          const gains = gainCells(t);
          return (
            <g
              key={`${t.player}-${cat}-${i}`}
              data-testid={`threat-band-${t.player}-${cat}-${i}`}
              data-player={t.player}
              data-category={cat}
              data-canonical={canonical.join(',')}
              data-cells={display.join(',')}
            >
              {/* the translucent player-tinted band over the stone run */}
              <line
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke={tint}
                strokeOpacity={style.opacity}
                strokeWidth={style.width}
                strokeLinecap="round"
              />
              {/* gain squares — dotted markers */}
              {gains.map((gc) => {
                const c = center(gc);
                return (
                  <circle
                    key={`g-${gc}`}
                    data-testid={`threat-gain-${gc}`}
                    cx={c.cx}
                    cy={c.cy}
                    r={3.2}
                    fill="none"
                    stroke={tint}
                    strokeOpacity={0.85}
                    strokeWidth={0.9}
                    strokeDasharray="1.4 1.2"
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
