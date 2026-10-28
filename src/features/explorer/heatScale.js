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

// Min/max of the displayed win% values. Null/undefined/non-finite entries are SKIPPED (not
// coerced): Number(null) === 0 would otherwise phantom-anchor the min at 0 and drag the whole
// ramp — the same corruption as leaving an occupied 0% cell in the set. This mirrors
// heatT(null) → null. Empty (or empty-after-filter) → {0,0}, the max==min fallback.
export function heatDomain(values = []) {
  const nums = values
    .filter((v) => v != null)
    .map(Number)
    .filter((x) => Number.isFinite(x));
  if (nums.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

// usableCandidates — the candidate set the heat should actually consider: the backend's
// nextMoves MINUS any cell already on the board (cell ∈ the active position's played `moves`).
// The position-stats nextMoves occasionally echoes an already-played cell (e.g. K10 at 0% / a
// few games for position [180]); left in, that 0% cell anchors the domain min and compresses
// every real candidate toward green, and paints a stray disc over the played stone. Excluding
// it HERE — BEFORE heatDomain and before any render — is what both the list (StatsRows via
// ExplorerPanel) and the board (HeatOverlay via BoardHeatOverlay) call, so they stay on the
// SAME filtered set and their green→red ramps agree cell-for-cell.
export function usableCandidates(nextMoves = [], moves = []) {
  const played = new Set(moves);
  return nextMoves.filter((c) => c && !played.has(c.move));
}

// Wilson score interval LOWER bound (95% by default, z = 1.96) for wins out of games. A
// confidence-adjusted win rate: 1/1 ≈ 0.207, 28/32 ≈ 0.719, so a lone 100% fluke ranks below a
// well-sampled strong move. Returns a fraction in [0,1]; 0 when games = 0.
export function wilsonLowerBound(wins, games, z = 1.96) {
  const n = Number(games);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const p = Math.max(0, Math.min(1, Number(wins) / n));
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / (1 + z2 / n));
}

// Candidates with fewer games than this are statistically noise: still listed, but greyed in the
// list, drawn neutral on the board, and excluded from the heat domain.
export const LOW_SAMPLE_GAMES = 5;

export function isLowSample(c) {
  return !(Number(c && c.games) >= LOW_SAMPLE_GAMES);
}

// Wins for a candidate: the backend's `wins`, else derived from winPct × games.
function winsOf(c) {
  if (Number.isFinite(Number(c.wins)) && c.wins != null) return Number(c.wins);
  return (Number(c.winPct) / 100) * Number(c.games);
}

// Heat/sort value on the 0..100 scale: Wilson lower bound ×100. Used instead of the raw win%.
export function heatValue(c) {
  return wilsonLowerBound(winsOf(c), c.games) * 100;
}

// Heat domain over a candidate set: low-sample candidates are excluded so a fluke can't pin
// either end of the scale.
export function candidateDomain(cands = []) {
  return heatDomain(cands.filter((c) => !isLowSample(c)).map(heatValue));
}

// Colour for one candidate: Wilson-based green→red, or neutral grey for low-sample candidates.
export const LOW_SAMPLE_COLOR = 'rgb(128, 128, 128)';
export function candidateColor(c, domain) {
  return isLowSample(c) ? LOW_SAMPLE_COLOR : heatColor(heatT(heatValue(c), domain));
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
