// HeatOverlay — a transparent SVG layer of "ghost" stones on the candidate cells, colored by
// the green→red RELATIVE heat (heatColor over heatDomain/heatT across the SHOWN set). It follows
// the board's Territory.js overlay pattern (an SVG sized to the grid, pointer-events:none) so it
// can sit over the board grid without intercepting clicks. Used both by BoardHeatOverlay (over
// the real board) and directly in unit tests.
//
// RELATIVE colour. The fill of each ghost is normalized across THIS cells set (min→red,
// max→green, midpoint→yellow), matching the mobile DB apps. Callers pass the same nextMoves set
// they hand to StatsRows, so the board and the list agree cell-for-cell.
//
// THE ROTATION SEAM. Candidate `move` cells arrive CANONICAL (the app's own model coordinate —
// the same space as the line sent to the position-stats query; the backend has ALREADY rotated
// each candidate to this local/caller orientation server-side, so no rotation-field bookkeeping
// is needed to get here — see api.js). The board, however, may be showing a rotated/reflected
// VIEW (a local display preference, `rotation` below, from the ui slice's selectRotation — a
// DIFFERENT rotation than the position-stats response's own top-level `rotation`, which is
// informational only and is never read by this component). So every ghost is mapped canonical
// → VIEW via symCell(move, rotation, n) BEFORE it is positioned — exactly as BoardPane maps its
// move list. `hoverCell` is compared in canonical space (it is the row's canonical move).
//
// HOVER = MUCH BRIGHTER. The hovered / selected candidate is deliberately loud: a FULL-opacity
// disc, a bright white outline, and a second white ring drawn INSIDE its edge so it clearly pops
// out of the ambient (dim, dark-edged) heat WITHOUT ever growing past a stone's footprint. Hovering
// a StatsRows row lights that exact cell up on the real board.
//
// Geometry (registration): the overlay SVG shares the board's viewBox, so its inner group
// reproduces the board's transform stack — translate(14.5,14.5) scale(0.95) — placing a circle
// drawn at (10·col,10·row) dead-centre on its grid intersection under any rotation (see
// ThreatBands / AiGhostOverlay for the same transform). Because that shared scale(0.95) is the
// ONLY scaling between this local 10-units-per-cell space and the rendered pixel size — same as
// the board's own stone stack (BoardSquare → Stone/SimpleStone, whose circle is r = size/2 = 5
// for a size-10 cell, under the board's own compounding scale(0.95) — see boardGeometry.js /
// Board.js's `#boardgroup` transform) — a disc radius of 5 here renders at the SAME on-screen
// size as a real stone.

import { symCell } from '../viewer/boardSymmetry';
import { candidateColor, candidateDomain, isLowSample } from './heatScale';

// Stroke width of the hover highlight ring. Its radius is derived as 5 - this/2 so the stroke's
// OUTER edge sits exactly at r=5 (the disc edge) — see the render comment below.
const HOVER_RING_STROKE_WIDTH = 1.5;

export default function HeatOverlay({
  cells = [],
  gridSize = 19,
  rotation = 0,
  hoverCell = null,
  size = '100%',
  onCellEnter = () => {},
  onCellLeave = () => {},
  onCellClick = () => {},
}) {
  const n = gridSize;
  const span = 10 * (n + 1);
  // Normalize the win% across the shown set so the worst move reads red, the best green.
  const domain = candidateDomain(cells);
  return (
    <svg
      data-testid="heat-overlay"
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0 }}
    >
      <g transform="translate(14.5,14.5) scale(0.95)">
        {cells.map((cell) => {
          const { move } = cell;
          const low = isLowSample(cell);
          const disp = symCell(move, rotation, n);
          const x = disp % n;
          const y = Math.floor(disp / n);
          const isHover = hoverCell != null && move === hoverCell;
          const fill = candidateColor(cell, domain);
          return (
            <g key={move}>
              <circle
                data-canonical={move}
                data-cell={disp}
                data-hover={isHover ? 'true' : 'false'}
                cx={10 * x}
                cy={10 * y}
                // Radius ALWAYS matches a real stone (Stone.js/SimpleStone.js draw r = size/2 = 5
                // in this same pre-group-scale local space) — hover NEVER enlarges the disc. The
                // hover highlight is an INSET white border (below) plus a full-opacity colour pop,
                // so a hovered candidate stays exactly stone-sized, matching the played stones.
                r={5}
                fill={fill}
                fillOpacity={isHover ? 1 : low ? 0.3 : 0.66}
                stroke={isHover ? '#ffffff' : 'rgba(15,12,10,0.5)'}
                strokeWidth={isHover ? 1.4 : 0.3}
                // Discs opt back INTO pointer events (the overlay container stays pass-through, so
                // the rest of the board still receives clicks) to drive the shared hover cell and
                // play on click. The loop's `move` is the LOCAL board move, so the click needs no
                // inverse-symmetry mapping — never the display cell (`disp`).
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onMouseEnter={() => onCellEnter(move)}
                onMouseLeave={() => onCellLeave(move)}
                onClick={() => onCellClick(move)}
              />
              {isHover && (
                // The bright white highlight is drawn INSIDE the disc's edge, not around it: an
                // SVG stroke straddles its path equally on both sides, so a stroke of width w at
                // radius (5 - w/2) has its OUTER edge land exactly at r=5 — the disc's own edge.
                // The result reads as an inner border, and the hovered footprint never exceeds a
                // stone's. It is itself click-through so it never intercepts the disc's own
                // hover/click.
                <circle
                  data-testid="heat-hover-ring"
                  cx={10 * x}
                  cy={10 * y}
                  r={5 - HOVER_RING_STROKE_WIDTH / 2}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.95}
                  strokeWidth={HOVER_RING_STROKE_WIDTH}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
