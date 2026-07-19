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
// Geometry (Phase 4 registration): the overlay SVG shares the board's viewBox, so its inner
// group reproduces the board's exact transform stack. A stone at (col,row) lands at
// (9.5·col+14.5, 9.5·row+14.5) in that viewBox — the board's #boardgroup scale(0.95)∘
// translate(5,5) composed with #whole's translate(5,5), applied to the BoardSquare's stone
// centre. So a circle drawn at (10·col,10·row) under `translate(14.5,14.5) scale(0.95)` sits
// dead-centre on its grid intersection, aligned with the rendered stones under any rotation.

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
      <g transform="translate(14.5,14.5) scale(0.95)">
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
              stroke={isHover ? '#000000' : 'rgba(15,12,10,0.5)'}
              strokeWidth={isHover ? 0.5 : 0.3}
            />
          );
        })}
      </g>
    </svg>
  );
}
