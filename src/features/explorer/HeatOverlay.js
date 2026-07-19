// HeatOverlay — a transparent SVG layer of "ghost" stones on the candidate cells, colored
// by heatScale(winPct). It follows the board's Territory.js overlay pattern (an SVG sized to
// the grid, pointer-events:none) so it can sit over the board grid without intercepting clicks.
//
// THE ROTATION SEAM. Candidate `move` cells arrive CANONICAL (the coordinate system of the
// stored move tree and of the position-stats query). The board, however, may be showing a
// rotated/reflected VIEW (Task 6). So every ghost is mapped canonical → display via
// symCell(move, rotation, n) BEFORE it is positioned — exactly as BoardPane maps its move
// list. Rendering canonical cells directly would misplace every ghost under any non-identity
// rotation. `hoverCell` is compared in canonical space (it is the row's canonical move).
//
// Geometry is a plain 10-unit grid (placeholder alignment; the Phase 4 pass tunes exact
// registration against the real board's transforms).

import { symCell } from '../viewer/boardSymmetry';
import heatScale from './heatScale';

export default function HeatOverlay({ cells = [], gridSize = 19, rotation = 0, hoverCell = null, size = '100%' }) {
  const n = gridSize;
  const span = 10 * (n + 1);
  return (
    <svg
      data-testid="heat-overlay"
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0 }}
    >
      <g transform="translate(10,10)">
        {cells.map(({ move, winPct }) => {
          const disp = symCell(move, rotation, n);
          const x = disp % n;
          const y = Math.floor(disp / n);
          const isHover = hoverCell != null && move === hoverCell;
          return (
            <circle
              key={move}
              data-canonical={move}
              data-cell={disp}
              data-hover={isHover ? 'true' : 'false'}
              cx={10 * x}
              cy={10 * y}
              r={isHover ? 4.6 : 3.6}
              fill={heatScale(winPct)}
              fillOpacity={isHover ? 0.95 : 0.68}
              stroke={isHover ? '#000000' : 'none'}
              strokeWidth={isHover ? 0.5 : 0}
            />
          );
        })}
      </g>
    </svg>
  );
}
