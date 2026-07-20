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
// THE ROTATION SEAM. Candidate `move` cells arrive CANONICAL (the coordinate system of the
// stored move tree and of the position-stats query). The board, however, may be showing a
// rotated/reflected VIEW. So every ghost is mapped canonical → display via symCell(move,
// rotation, n) BEFORE it is positioned — exactly as BoardPane maps its move list. `hoverCell`
// is compared in canonical space (it is the row's canonical move).
//
// HOVER = MUCH BRIGHTER. The hovered / selected candidate is deliberately loud: a bigger,
// FULL-opacity disc, a bright white outline, and a second white ring drawn around it so it
// clearly pops out of the ambient (dim, dark-edged) heat. Hovering a StatsRows row lights that
// exact cell up on the real board.
//
// Geometry (registration): the overlay SVG shares the board's viewBox, so its inner group
// reproduces the board's transform stack — translate(14.5,14.5) scale(0.95) — placing a circle
// drawn at (10·col,10·row) dead-centre on its grid intersection under any rotation (see
// ThreatBands / AiGhostOverlay for the same transform).

import { symCell } from '../viewer/boardSymmetry';
import { heatColor, heatDomain, heatT } from './heatScale';

export default function HeatOverlay({ cells = [], gridSize = 19, rotation = 0, hoverCell = null, size = '100%' }) {
  const n = gridSize;
  const span = 10 * (n + 1);
  // Normalize the win% across the shown set so the worst move reads red, the best green.
  const domain = heatDomain(cells.map((c) => c.winPct));
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
        {cells.map(({ move, winPct }) => {
          const disp = symCell(move, rotation, n);
          const x = disp % n;
          const y = Math.floor(disp / n);
          const isHover = hoverCell != null && move === hoverCell;
          const fill = heatColor(heatT(winPct, domain));
          return (
            <g key={move}>
              <circle
                data-canonical={move}
                data-cell={disp}
                data-hover={isHover ? 'true' : 'false'}
                cx={10 * x}
                cy={10 * y}
                r={isHover ? 5.6 : 3.6}
                fill={fill}
                fillOpacity={isHover ? 1 : 0.66}
                stroke={isHover ? '#ffffff' : 'rgba(15,12,10,0.5)'}
                strokeWidth={isHover ? 1.4 : 0.3}
              />
              {isHover && (
                // A bright white ring around the hovered disc — the "much brighter" pop.
                <circle
                  data-testid="heat-hover-ring"
                  cx={10 * x}
                  cy={10 * y}
                  r={7.4}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.95}
                  strokeWidth={1.1}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
