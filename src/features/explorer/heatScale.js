// heatScale — a DETERMINISTIC sequential ramp mapping a win% (0..100) to a heat color.
//
// Placeholder ramp (final palette lands in the Phase 4 design pass): linear RGB
// interpolation between an "error" red (low win%) and a "success" green (high win%),
// mirroring the MUI theme's error.main → success.main tokens in their default (light)
// values. It is intentionally THEME-INDEPENDENT: the exact same input yields the exact
// same color in light and dark mode, so toggling the theme (or rotating the board) never
// shifts a cell's heat. The two anchors sit at ~4.7:1 contrast against both board felts,
// clearing the ≥3:1 target for the placeholder.
//
// null / undefined / NaN win% → a neutral grey ("no data"), distinct from both ramp ends.

const LOW = [211, 47, 47]; // MUI red[700] ≈ error.main (light) — low win%
const HIGH = [46, 125, 50]; // MUI green[800] ≈ success.main (light) — high win%
const NO_DATA = 'rgb(158, 158, 158)'; // MUI grey[500]

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export default function heatScale(winPct) {
  const n = Number(winPct);
  if (winPct == null || Number.isNaN(n)) return NO_DATA;
  const t = Math.max(0, Math.min(100, n)) / 100;
  const r = lerp(LOW[0], HIGH[0], t);
  const g = lerp(LOW[1], HIGH[1], t);
  const b = lerp(LOW[2], HIGH[2], t);
  return `rgb(${r}, ${g}, ${b})`;
}
