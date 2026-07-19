// heatScale — a DETERMINISTIC ramp mapping a win% (0..100) to a heat color for the
// candidate-move overlay. Cold → hot: a losing continuation reads cold (deep blue), an
// even one reads neutral (dark umber), a winning one reads hot (deep vermillion).
//
// PALETTE (Phase 4 design pass — replaces the Phase-2 red↔green placeholder, which used the
// classic colorblind-unsafe red/green pair). Chosen with the dataviz skill's method:
//   - win% is diverging around 50% (even), so the ramp has two poles + a neutral midpoint.
//   - The poles are the ColorBrewer / Okabe–Ito cool→warm CVD-safe pair (blue ↔ vermillion),
//     so protanopes, deuteranopes and tritanopes all keep the low/high distinction.
//   - Every step is kept DARK (low luminance) so the whole ramp clears ≥3:1 WCAG contrast
//     against ALL thirteen board felts — worst case is the renju rose felt (#D98880) at
//     3.68:1, comfortably over the ≥3:1 target (the placeholder failed that felt).
//   - It is THEME-INDEPENDENT: identical input yields identical color in light and dark app
//     mode, so toggling the theme or rotating the board never shifts a cell's heat.
//   - Distinct from the other board overlays by BOTH hue and form: the heat layer is solid
//     discs, the AI ghost is a bright dashed violet ring, threat bands are thin translucent
//     blue/orange lines. (See docs/design-notes.md for the full rationale + contrast table.)
//
// null / undefined / NaN win% → a neutral cool grey ("no data"), distinct from both poles.

// Anchors: [position 0..1, [r,g,b]]. Piecewise-linear interpolation between them.
const ANCHORS = [
  [0.0, [6, 51, 102]], // #063366 deep blue — losing
  [0.5, [74, 63, 48]], // #4A3F30 dark umber — even
  [1.0, [126, 34, 0]], // #7E2200 deep vermillion — winning
];

const NO_DATA = 'rgb(96, 100, 106)'; // #60646A cool slate — "no data", distinct from both poles

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export default function heatScale(winPct) {
  const n = Number(winPct);
  if (winPct == null || Number.isNaN(n)) return NO_DATA;
  const t = Math.max(0, Math.min(100, n)) / 100;
  // Locate the anchor segment containing t, then interpolate within it.
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [t0, c0] = ANCHORS[i];
    const [t1, c1] = ANCHORS[i + 1];
    if (t <= t1) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return `rgb(${lerp(c0[0], c1[0], f)}, ${lerp(c0[1], c1[1], f)}, ${lerp(c0[2], c1[2], f)})`;
    }
  }
  const last = ANCHORS[ANCHORS.length - 1][1];
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}
