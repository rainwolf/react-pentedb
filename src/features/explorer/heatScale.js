// heatScale — the explorer's candidate-move heat, a green→red RELATIVE ramp that mirrors the
// pente.org mobile database apps EXACTLY (pentelive-android DatabaseActivity.java:723-735 and
// penteLive-iOS DatabaseViewController.m:899-916). Both apps min-max normalize each shown
// move's value across the CURRENTLY DISPLAYED candidate set, then lerp red→yellow→green:
//
//   t = (value - min) / (max - min)            over the displayed set
//   if max == min  →  t = value / 100          (domain treated as 0..100)
//   t <= 0.5  →  rgb(255, round(t*510), 0)      (red → yellow)
//   t >  0.5  →  rgb(round((1-t)*510), 255, 0)  (yellow → green)
//
// So within the shown moves the WORST reads pure red, the BEST pure green, and the midpoint
// yellow. That relative stretch is exactly what makes the heat distinctive — a set of moves
// all around 55–65% still spreads across the full ramp instead of collapsing into one hue.
//
// This DELIBERATELY REVERSES the Phase-4 CVD-safe blue↔umber↔vermillion ramp: it is a
// user-directed product choice to match their mobile DB (they know the red↔green colourblind
// tradeoff and accepted it). See docs/design-notes.md §1.
//
// Split into pure pieces so callers (StatsRows, HeatOverlay, BoardHeatOverlay) all normalize
// the SAME way over the SAME displayed set, keeping the list and the board in agreement:
//   - heatDomain(values) → {min, max} over the numeric values
//   - heatT(value, domain) → t in [0,1] (or null for missing data)
//   - heatColor(t) → the rgb() string (or a neutral no-data colour for null/NaN)

// Neutral "no data" — a move with no win% (never happens for real stats, but keep it safe and
// visually distinct from both ramp ends rather than defaulting to red or green).
const NO_DATA = 'rgb(96, 100, 106)';

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

// The pure colour ramp. t in [0,1]: 0 → pure red, 0.5 → yellow, 1 → pure green. Out-of-range t
// clamps to the endpoints; null / undefined / NaN → the neutral no-data colour.
export function heatColor(t) {
  if (t == null || Number.isNaN(Number(t))) return NO_DATA;
  const c = clamp01(Number(t));
  if (c <= 0.5) return `rgb(255, ${Math.round(c * 510)}, 0)`;
  return `rgb(${Math.round((1 - c) * 510)}, 255, 0)`;
}

// Min/max of the displayed win% values (non-numeric entries ignored). Empty set → {0,0}, which
// heatT treats as the max==min fallback.
export function heatDomain(values = []) {
  const nums = values.map(Number).filter((x) => Number.isFinite(x));
  if (nums.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

// Normalize a single value to t in [0,1] over the displayed domain. Missing/non-numeric value
// → null (rendered as no-data). When the domain is degenerate (max == min, e.g. a single shown
// move) the ramp falls back to an absolute 0..100 scale so a lone 50% still reads as yellow.
export function heatT(value, domain = { min: 0, max: 0 }) {
  const n = Number(value);
  if (value == null || Number.isNaN(n)) return null;
  const { min, max } = domain || { min: 0, max: 0 };
  const t = max === min ? n / 100 : (n - min) / (max - min);
  return clamp01(t);
}

export default heatColor;
