// UI slice: cross-panel view state that is not document/tab data and not server cache.
// `scope` is the Archive/Mine/Both selector (P3 Task 6): it feeds position-stats and
// games-search and is shared by the ScopeToggle, SearchPanel and ExplorerPanel so all three
// stay in lockstep. Persisted here (not local component state) precisely so the explorer's
// stats and the search list can never disagree about which corpus they are showing.
//
// `rotation` (P4 Task 4) is the board's view orientation — one of the 8 dihedral symmetries.
// It was BoardPane-local state, but the threat bands, the AI ghost, and (later) the heat
// ghost are all overlays on the SAME board and must transform through the SAME rotation. So
// it is lifted here as the single source: BoardPane's rotate control dispatches setRotation
// and every board overlay reads selectRotation. GLOBAL (not per-tab) by choice: a workbench
// board orientation is a viewing preference, not a property of a document — keeping one value
// avoids a per-tab map + tab-close cleanup, and switching tabs keeps your chosen orientation.
// The symmetry index is board-size-independent (symCell works for any n), so it stays valid
// across variants with different grid sizes.
//
// `threats` (P4 Task 4) is the per-player × {trias, fours, potential captures} visibility
// grid for the threat overlay, toggled from ThreatsPanel and read by ThreatBands.
//
// `treeExpanded` (fb15) is whether the analysis tray (TagBar + variation TreeView +
// CommentBox) is shown beneath the move strip. Lifted out of MoveStrip's local useState so it
// is remembered across tab switches, same as the other cross-panel toggles here. Defaults to
// TRUE — the tree is the primary analysis surface and should be visible without an extra click;
// the toggle button still lets the user collapse it.
//
// This lives in its own module (not store.js) so components and tests can import the actions
// and selector without pulling in the real api slice — tests that mock '../../app/api' would
// otherwise crash when store.js references `api.reducer`.
import { createSlice } from '@reduxjs/toolkit';

const SCOPES = ['archive', 'mine', 'both'];
const SYMMETRY_COUNT = 8;
const THREAT_KINDS = ['trias', 'fours', 'captures'];

// Default overlay state: trias + fours ON for both players (the desktop's headline threat
// visualization), potential captures OFF (the noisiest category — opt in per player).
function defaultThreats() {
  return {
    1: { trias: true, fours: true, captures: false },
    2: { trias: true, fours: true, captures: false },
  };
}

// Frozen module-level fallback for selectThreatToggles below. A fresh defaultThreats() object
// per call would give react-redux a new reference every render on stores without the ui slice,
// tripping its unstable-selector-result warning (seen via ThreatBands). One frozen instance,
// mirroring selectAiPlay's stable `initialState.play` fallback.
const EMPTY_THREATS = Object.freeze(defaultThreats());

// Explorer candidate-list sort key: 'games' = popularity (games desc), 'winrate' = win% desc.
// This ONLY reorders the list; the board heat colouring (by win%) is unaffected.
const SORT_MODES = ['games', 'winrate'];

const uiSlice = createSlice({
  name: 'ui',
  // `heatOnBoard` (explorer feedback rework): the green→red candidate heat is overlaid on the
  // REAL board by default; the ExplorerPanel switch turns it OFF. `heatHoverCell` is the shared
  // canonical hover cell — StatsRows onHover writes it, BoardHeatOverlay reads it — so hovering a
  // stats row lights that exact cell up brightly on the board.
  initialState: {
    scope: 'archive',
    rotation: 0,
    threats: defaultThreats(),
    heatOnBoard: true,
    heatHoverCell: null,
    explorerSort: 'winrate',
    treeExpanded: true,
  },
  reducers: {
    setScope(state, action) {
      if (SCOPES.includes(action.payload)) state.scope = action.payload;
    },
    // Show / hide the analysis tray (tag bar + variation tree + comment box) beneath the move
    // strip. Defaults to true (see initialState comment) — this only handles explicit toggles.
    setTreeExpanded(state, action) {
      state.treeExpanded = !!action.payload;
    },
    // Show / hide the candidate heat overlay on the real board.
    setHeatOnBoard(state, action) {
      state.heatOnBoard = !!action.payload;
    },
    // Shared hover cell (canonical) coupling the stats list to the board heat. null clears it.
    setHeatHoverCell(state, action) {
      const v = action.payload;
      state.heatHoverCell = v == null ? null : Number(v);
    },
    // Explorer candidate-list sort key. Unknown payloads are ignored so a stray value can't
    // wedge the list into an empty/undefined ordering.
    setExplorerSort(state, action) {
      if (SORT_MODES.includes(action.payload)) state.explorerSort = action.payload;
    },
    // Set the board view orientation. Normalized into 0..7 so callers can pass a raw
    // "current + 1" without worrying about wraparound or a stray non-integer.
    setRotation(state, action) {
      const r = Number(action.payload);
      if (Number.isInteger(r)) state.rotation = ((r % SYMMETRY_COUNT) + SYMMETRY_COUNT) % SYMMETRY_COUNT;
    },
    // Toggle one {player, kind} cell of the threat-visibility grid.
    setThreatToggle(state, action) {
      const { player, kind, value } = action.payload || {};
      if ((player === 1 || player === 2) && THREAT_KINDS.includes(kind)) {
        if (!state.threats) state.threats = defaultThreats();
        state.threats[player][kind] = !!value;
      }
    },
  },
});

export const {
  setScope,
  setRotation,
  setThreatToggle,
  setHeatOnBoard,
  setHeatHoverCell,
  setExplorerSort,
  setTreeExpanded,
} = uiSlice.actions;

// Defensive read: some tests build stores without the ui slice (docs-only reducers), so fall
// back to 'archive' rather than crash when `state.ui` is absent.
export function selectScope(state) {
  return (state.ui && state.ui.scope) || 'archive';
}

// Defensive: absent ui slice → identity orientation. Board overlays render on any store
// (including the docs-only stores older viewer tests build) without special wiring.
export function selectRotation(state) {
  return (state.ui && state.ui.rotation) || 0;
}

// Defensive: absent ui slice → the default grid, so ThreatBands has a sensible on-state even
// on a store that never wired the ui reducer. Returns the frozen EMPTY_THREATS singleton (not
// a fresh object) so the fallback is referentially stable across renders.
export function selectThreatToggles(state) {
  return (state.ui && state.ui.threats) || EMPTY_THREATS;
}

// Defensive: absent ui slice OR a store predating this flag → true. The heat is overlaid by
// default (the user wants it on the board); only an explicit `false` from the toggle hides it.
export function selectHeatOnBoard(state) {
  const ui = state && state.ui;
  return ui && ui.heatOnBoard === false ? false : true;
}

// Defensive: absent ui slice → null. Cell 0 is a valid board cell, so test against null (not
// falsiness) to avoid dropping a legitimate top-left hover.
export function selectHeatHoverCell(state) {
  const ui = state && state.ui;
  return ui && ui.heatHoverCell != null ? ui.heatHoverCell : null;
}

// Defensive: an absent ui slice OR a value predating this flag → 'winrate', the current
// default ordering, so older stores and single-arg callers see the same default as a fresh store.
export function selectExplorerSort(state) {
  const ui = state && state.ui;
  return ui && SORT_MODES.includes(ui.explorerSort) ? ui.explorerSort : 'winrate';
}

// Defensive: absent ui slice OR a store predating this flag → true. The analysis tray is
// shown by default (fb15); only an explicit `false` from the toggle hides it. Mirrors
// selectHeatOnBoard's fallback-to-true shape.
export function selectTreeExpanded(state) {
  const ui = state && state.ui;
  return ui && ui.treeExpanded === false ? false : true;
}

// The EFFECTIVE scope every consumer must query with. mine/both require auth, so a lapsed
// session (within-session logout OR expiry) must fall back to 'archive' — otherwise the stored
// scope keeps firing authed position-stats / games-search that 401 and leave the panels stuck
// on "Sign in to view this" until reload. Kept as a pure (auth, scope) function rather than a
// store selector so uiSlice stays free of any api/auth import; callers already hold both.
export function selectEffectiveScope(authName, scope) {
  return authName ? scope : 'archive';
}

export default uiSlice.reducer;
