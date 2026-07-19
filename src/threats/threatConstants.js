// Threat-analysis engine — shared constants.
//
// Ported verbatim from the desktop Java (org.pente.tree.Threat / PositionAnalysis).
// Port authority: docs/superpowers/plans/research/pentedb/threat-engine-port.md.
// These integer values are a SHARED contract (UI overlays + ranking tables depend on
// them) — do NOT renumber. Types are ordered by severity; several branches test
// `type > TYPE_TRIA` to mean "is a four".

// §2.3 Threat type enum (VERBATIM from Threat.java lines 26-35).
export const TYPE_BLOCKED = 0; // records a blocked/hidden threat; not directly playable
export const TYPE_POTENTIAL_CAPTURE = 1; // p can capture a flanked opponent pair
export const TYPE_POTENTIAL_THREE_SPLIT = 2; // gapped 2 that can become a split three (X_X)
export const TYPE_POTENTIAL_THREE_PAIR = 3; // open adjacent pair that can become a three (or be captured)
export const TYPE_POTENTIAL_FOUR = 4; // a three (gapped or blocked) that can become a four
export const TYPE_TRIA = 5; // an open three (guaranteed four next move) — Pente "tria"
export const TYPE_CLOSED_FOUR = 6; // four blocked on one end (single winning square)
export const TYPE_OPEN_FOUR = 7; // four open both ends (two winning squares → unstoppable)

// Sentinel written into a Line buffer slot for an off-board cell (markEnd/markExtendedEnd).
// Treated distinctly from an opponent stone. (PenteAnalyzer.WALL = 4)
export const WALL = 4;

// §8.3 Ranking tables (VERBATIM from PositionAnalysis.java lines 160-175).
// Indexed by threat type 0..7. GROUPS_OFFENSE/GROUPS_DEFENSE are dead (commented-out in
// Java) and intentionally NOT ported (quirk #5).
export const RANKS_OFFENSE = [1, 2, 10, 10, 1000, 1000, 100000, 100000];
export const RANKS_DEFENSE = [1, 2, 5, 5, 5, 100, 10000, 10000];
// Remaps type → a "prior" type used for a baseline offense bonus in the experimental
// ranking passes.
export const TYPE_PRIOR = [0, 0, 0, 0, 0, 3, 5, 5];

// Human-readable labels (for UI / debugging; not part of the ported algorithm).
export const TYPE_NAMES = [
  'blocked',
  'potential-capture',
  'potential-three-split',
  'potential-three-pair',
  'potential-four',
  'tria',
  'closed-four',
  'open-four',
];
