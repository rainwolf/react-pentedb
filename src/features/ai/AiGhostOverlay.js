// AiGhostOverlay — the AI's suggested move(s) drawn as "ghost" stones over the board. It
// follows HeatOverlay's overlay pattern (a pointer-events:none SVG sized to the grid, the same
// 10-unit placeholder geometry, the same canonical -> display symCell(rotation) mapping) but is
// deliberately styled DIFFERENTLY from the heat layer so the two never read as the same thing:
//   - HeatOverlay = solid win%-coloured discs.
//   - AiGhostOverlay = a hollow, dashed, PULSING accent ring (with a centre dot for a Connect6
//     pair) — an "engine says here" marker, not a statistic.
//
// Connected (reads the suggestion from the store) so a Hint anywhere lights the board without
// prop-drilling. `rotation` is supplied by BoardPane (its local view rotation); standalone
// callers/tests default to the identity view. A suggestion for a *different* variant than the
// one on the board is ignored (a stale hint after a tab switch must not paint).
import { useSelector } from 'react-redux';
import { selectActivePosition } from '../../model/docSlice';
import { symCell } from '../viewer/boardSymmetry';
import { gridSizeForGame } from '../../board/boardGeometry';
import { selectAiSuggestion } from './aiSlice';

const ACCENT = '#7c4dff'; // deep violet — clear of the heat ramp's blue→red band

export default function AiGhostOverlay({ rotation = 0, size = '100%' }) {
  const suggestion = useSelector(selectAiSuggestion);
  const activePos = useSelector(selectActivePosition);

  if (!suggestion || !activePos) return null;
  if (suggestion.game !== activePos.game) return null; // stale hint from another variant
  const cells = suggestion.cells || [];
  if (cells.length === 0) return null;

  const n = gridSizeForGame(activePos.game);
  const span = 10 * (n + 1);

  return (
    <svg
      data-testid="ai-ghost-overlay"
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0 }}
    >
      <g transform="translate(10,10)">
        {cells.map((cell) => {
          const disp = symCell(cell, rotation, n);
          const x = disp % n;
          const y = Math.floor(disp / n);
          return (
            <g key={cell} data-testid={`ai-ghost-${cell}`} data-canonical={cell} data-cell={disp}>
              <circle
                cx={10 * x}
                cy={10 * y}
                r={4.2}
                fill={ACCENT}
                fillOpacity={0.18}
                stroke={ACCENT}
                strokeWidth={0.8}
                strokeDasharray="1.6 1.2"
              >
                {/* SMIL pulse — a browser animates it (frozen in a screenshot); jsdom just
                    renders the element, which is all the tests assert on. */}
                <animate
                  attributeName="r"
                  values="3.4;4.6;3.4"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="stroke-opacity"
                  values="1;0.35;1"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx={10 * x} cy={10 * y} r={0.9} fill={ACCENT} fillOpacity={0.9} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
