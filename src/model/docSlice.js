// Document-tabs slice (RTK). Each tab holds its own variation tree and cursor over the game
// board. All updates are immutable via createSlice/Immer; the tree edits delegate to the pure
// gameTree module (which returns fresh trees — assigning them into the Immer draft is fine).
//
// State: { tabs: [{ id, kind:'game'|'analysis'|'scratch', title, game, gid?, aid?, tree,
//                   cursorPath, dirty }],
//          activeTabId,
//          seq }   // seq is an internal id counter for tabs opened without an explicit id.
import { createSelector, createSlice } from '@reduxjs/toolkit';
import {
  createTree,
  addMove,
  nodeAt,
  lineTo,
  setTag,
  setComment,
  toggleTag as gtToggleTag,
  promoteVariation as gtPromoteVariation,
  deleteBranch as gtDeleteBranch,
} from './gameTree';
import { firstMoveMustBeCenter, centerCell, forcedOpening } from '../board/boardGeometry';

const initialState = { tabs: [], activeTabId: null, seq: 1 };

function activeTab(state) {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}

// True when `path` starts with every index of `prefix` (i.e. path is prefix or a descendant).
function pathHasPrefix(path, prefix) {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (path[i] !== prefix[i]) return false;
  return true;
}

// Cycle the cursor among the current node's siblings by `dir` (+1 next, -1 prev), wrapping.
function cycleSibling(state, dir) {
  const t = activeTab(state);
  if (!t || t.cursorPath.length === 0) return; // root has no siblings
  const parentPath = t.cursorPath.slice(0, -1);
  const parent = nodeAt(t.tree, parentPath);
  if (!parent || parent.kids.length < 2) return;
  const count = parent.kids.length;
  const idx = t.cursorPath[t.cursorPath.length - 1];
  const nextIdx = (idx + dir + count) % count;
  t.cursorPath = [...parentPath, nextIdx];
}

// Forced centre opener. For variants whose first move is fixed (see boardGeometry), a tab's
// tree always carries the centre stone as its first move: it is seeded when the tree is empty and
// the cursor never rests on the empty root while that stone exists, so first/back stop at move 1
// and the stone can't be navigated past or deleted (see deleteBranch).
function enforceOpening(t) {
  if (!t || t.game == null || !firstMoveMustBeCenter(t.game)) return;
  if (t.tree.root.kids.length === 0) t.tree = addMove(t.tree, [], centerCell(t.game)).tree;
  if (t.cursorPath.length === 0) t.cursorPath = [0];
}

// True when `path` addresses the protected forced-centre opening stone of `tab` (not deletable):
// a root child whose move is the centre of a forced-centre variant, wherever it sits among siblings.
export function isProtectedOpening(tab, path) {
  if (!tab || !path || path.length !== 1 || tab.game == null || !firstMoveMustBeCenter(tab.game)) return false;
  const node = tab.tree.root.kids[path[0]];
  return !!node && node.m === centerCell(tab.game);
}

// True when promoting root child `path` would put a non-centre move ahead of the centre stone.
function promoteBreaksOpening(t, path) {
  if (path.length !== 1 || t.game == null || !firstMoveMustBeCenter(t.game)) return false;
  const c = centerCell(t.game);
  const kids = t.tree.root.kids;
  return kids.some((k) => k.m === c) && kids[path[0]] && kids[path[0]].m !== c;
}

// True when `t` is a scratch tab nobody has touched: not dirty, no gid/aid, and its tree holds
// nothing beyond the game's forced opening (or nothing at all for free-first-move variants).
export function isUntouchedScratch(t) {
  if (!t || t.kind !== 'scratch' || t.dirty || t.gid != null || t.aid != null) return false;
  let node = t.tree.root;
  for (const cell of forcedOpening(t.game)) {
    if (node.kids.length !== 1 || node.kids[0].m !== cell) return false;
    node = node.kids[0];
  }
  return node.kids.length === 0;
}

const docSlice = createSlice({
  name: 'docs',
  initialState,
  reducers: {
    openTab: {
      reducer(state, action) {
        const p = action.payload;
        const id = p.id != null ? p.id : `tab${state.seq}`;
        if (p.id == null) state.seq += 1;
        const tab = {
          id,
          kind: p.kind || 'scratch',
          title: p.title || '',
          game: p.game,
          gid: p.gid,
          aid: p.aid,
          tree: p.tree || createTree(),
          cursorPath: p.cursorPath || [],
          dirty: false,
        };
        enforceOpening(tab);
        state.tabs.push(tab);
        state.activeTabId = id;
      },
      prepare(payload = {}) {
        return { payload };
      },
    },

    closeTab(state, action) {
      const idx = state.tabs.findIndex((t) => t.id === action.payload);
      if (idx === -1) return;
      state.tabs.splice(idx, 1);
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.tabs.length ? state.tabs[state.tabs.length - 1].id : null;
      }
    },

    // Re-point an untouched scratch tab at another game: fresh tree (+ forced opening), fresh id
    // (its old `p:<game>:<cells>` id would otherwise alias a later route to the wrong game).
    retargetScratch(state, action) {
      const { id, game } = action.payload;
      const t = state.tabs.find((x) => x.id === id);
      if (!t || !isUntouchedScratch(t)) return;
      const newId = `tab${state.seq}`;
      state.seq += 1;
      t.id = newId;
      t.game = game;
      t.title = 'New position';
      t.tree = createTree();
      t.cursorPath = [];
      t.dirty = false;
      enforceOpening(t);
      if (state.activeTabId === id) state.activeTabId = newId;
    },

    activateTab(state, action) {
      if (state.tabs.some((t) => t.id === action.payload)) state.activeTabId = action.payload;
    },

    navTo(state, action) {
      const t = activeTab(state);
      if (!t) return;
      t.cursorPath = action.payload;
      enforceOpening(t);
    },

    navNext(state) {
      const t = activeTab(state);
      if (!t) return;
      const node = nodeAt(t.tree, t.cursorPath);
      if (node && node.kids.length) t.cursorPath = [...t.cursorPath, 0];
    },

    navPrev(state) {
      const t = activeTab(state);
      if (!t || !t.cursorPath.length) return;
      t.cursorPath = t.cursorPath.slice(0, -1);
      enforceOpening(t);
    },

    navFirst(state) {
      const t = activeTab(state);
      if (!t) return;
      t.cursorPath = [];
      enforceOpening(t);
    },

    navLast(state) {
      const t = activeTab(state);
      if (!t) return;
      const path = [...t.cursorPath];
      let node = nodeAt(t.tree, path);
      while (node && node.kids.length) {
        path.push(0);
        node = node.kids[0];
      }
      t.cursorPath = path;
    },

    navSiblingUp(state) {
      cycleSibling(state, -1);
    },

    navSiblingDown(state) {
      cycleSibling(state, +1);
    },

    applyMove(state, action) {
      const t = activeTab(state);
      if (!t) return;
      enforceOpening(t); // a forced variant's centre stone always precedes any other move
      const before = t.tree.nextId;
      const res = addMove(t.tree, t.cursorPath, action.payload);
      t.tree = res.tree;
      t.cursorPath = res.path;
      if (res.tree.nextId > before) t.dirty = true; // a new move was appended (not a dedup)
    },

    applyTag(state, action) {
      const t = activeTab(state);
      if (!t) return;
      t.tree = setTag(t.tree, t.cursorPath, action.payload);
      t.dirty = true;
    },

    applyComment(state, action) {
      const t = activeTab(state);
      if (!t) return;
      t.tree = setComment(t.tree, t.cursorPath, action.payload);
      t.dirty = true;
    },

    // Toggle an annotation glyph on the cursor node (add if absent, remove if present).
    toggleTag(state, action) {
      const t = activeTab(state);
      if (!t) return;
      t.tree = gtToggleTag(t.tree, t.cursorPath, action.payload);
      t.dirty = true;
    },

    // Make the node at `payload` (a path) the first child of its parent (new mainline), then
    // remap the cursor so it stays on the SAME logical node through the sibling reshuffle.
    promoteVariation(state, action) {
      const t = activeTab(state);
      if (!t) return;
      const path = action.payload;
      if (!path || path.length === 0) return;
      if (promoteBreaksOpening(t, path)) return; // centre stone must stay first
      t.tree = gtPromoteVariation(t.tree, path);
      const d = path.length - 1;
      const parentPath = path.slice(0, d);
      const fromIdx = path[d];
      const cur = t.cursorPath;
      if (cur.length > d && pathHasPrefix(cur.slice(0, d), parentPath)) {
        const idx = cur[d];
        let newIdx = idx;
        if (idx === fromIdx) newIdx = 0; // the promoted node -> slot 0
        else if (idx < fromIdx) newIdx = idx + 1; // earlier siblings shift down one
        if (newIdx !== idx) t.cursorPath = [...cur.slice(0, d), newIdx, ...cur.slice(d + 1)];
      }
      t.dirty = true;
    },

    // Remove the subtree at `payload` (a path). If the cursor sat on/under the deleted branch it
    // moves to the deleted node's parent; a cursor in a later sibling is reindexed by the shift.
    deleteBranch(state, action) {
      const t = activeTab(state);
      if (!t) return;
      const path = action.payload;
      if (!path || path.length === 0) return;
      if (isProtectedOpening(t, path)) return; // protected opening stone
      t.tree = gtDeleteBranch(t.tree, path);
      const d = path.length - 1;
      const parentPath = path.slice(0, d);
      const removedIdx = path[d];
      const cur = t.cursorPath;
      if (pathHasPrefix(cur, path)) {
        t.cursorPath = parentPath; // cursor was inside the deleted subtree
      } else if (cur.length > d && pathHasPrefix(cur.slice(0, d), parentPath) && cur[d] > removedIdx) {
        t.cursorPath = [...cur.slice(0, d), cur[d] - 1, ...cur.slice(d + 1)]; // later sibling shifted
      }
      enforceOpening(t); // cursor may have fallen back to the empty root
      t.dirty = true;
    },

    // Mark the active tab persisted. Optional payload { aid, name } lets a first server
    // save adopt the server id: a scratch/analysis tab with no aid yet is re-keyed to the
    // canonical `a:<aid>` id and promoted to kind 'analysis', so the /a/:aid route loader
    // recognizes it (activates instead of opening a duplicate) and canonicalUrl addresses
    // it as /a/<aid>. Later saves (aid already present) just clear dirty / update the title.
    markSaved: {
      reducer(state, action) {
        const t = activeTab(state);
        if (!t) return;
        t.dirty = false;
        const { aid, name } = action.payload || {};
        if (name != null) t.title = name;
        if (aid != null && t.aid == null) {
          t.aid = aid;
          t.kind = 'analysis';
          const newId = `a:${aid}`;
          if (state.activeTabId === t.id) state.activeTabId = newId;
          t.id = newId;
        }
      },
      prepare(payload = {}) {
        return { payload };
      },
    },

    // Restore a recovery snapshot into a tab. Idempotent on tab id (unlike openTab, which
    // always pushes): if a tab with this id already exists — e.g. the '/' default scratch
    // tab (auto-id 'tab1') or the /a/:aid tab a dirty-reload just re-opened — REPLACE its
    // tree/cursor/metadata with the recovered (unsaved) copy and activate it, instead of
    // pushing a duplicate id. Recovered work is unsaved, so the tab is left dirty.
    restoreTab: {
      reducer(state, action) {
        const p = action.payload;
        const existing = state.tabs.find((t) => t.id === p.id);
        const target = existing || { id: p.id, gid: p.gid };
        target.kind = p.kind || 'scratch';
        target.title = p.title || '';
        target.game = p.game;
        target.aid = p.aid;
        target.tree = p.tree || createTree();
        target.cursorPath = [];
        target.dirty = true;
        enforceOpening(target);
        if (!existing) state.tabs.push(target);
        state.activeTabId = target.id;
      },
      prepare(payload = {}) {
        return { payload };
      },
    },
  },
});

export const {
  openTab,
  closeTab,
  activateTab,
  navTo,
  navNext,
  navPrev,
  navFirst,
  navLast,
  navSiblingUp,
  navSiblingDown,
  applyMove,
  applyTag,
  applyComment,
  toggleTag,
  promoteVariation,
  deleteBranch,
  markSaved,
  restoreTab,
  retargetScratch,
} = docSlice.actions;

// Search Variant picked -> put the workbench on a scratch "New position" tab for that game:
// reuse an untouched scratch tab of that game; else retarget the ACTIVE tab if it is an untouched
// scratch; else open a new one. Tabs with moves, loaded games or analyses are never mutated.
export const switchToVariant = (game) => (dispatch, getState) => {
  const { tabs, activeTabId } = getState().docs;
  const reuse = tabs.find((t) => t.game === game && isUntouchedScratch(t));
  if (reuse) {
    if (reuse.id !== activeTabId) dispatch(activateTab(reuse.id));
    return;
  }
  const cur = tabs.find((t) => t.id === activeTabId);
  if (cur && isUntouchedScratch(cur)) dispatch(retargetScratch({ id: cur.id, game }));
  else dispatch(openTab({ kind: 'scratch', title: 'New position', game }));
};

const selectDocsTabs = (state) => state.docs.tabs;
const selectActiveTabId = (state) => state.docs.activeTabId;

// Memoized: only recomputes when the tabs array reference or the active tab id changes.
const selectActiveTab = createSelector(
  [selectDocsTabs, selectActiveTabId],
  (tabs, activeTabId) => tabs.find((tb) => tb.id === activeTabId) || null
);

const selectActiveTabTree = (state) => {
  const t = selectActiveTab(state);
  return t ? t.tree : null;
};

const selectActiveTabCursorPath = (state) => {
  const t = selectActiveTab(state);
  return t ? t.cursorPath : null;
};

// Derived active position for the board/selectors layer. Memoized on the active tab's
// identity, tree, and cursorPath so repeated calls against an unchanged position return the
// SAME object reference — avoids react-redux's "selector returned a different result" dev
// warning and unnecessary downstream re-renders.
export const selectActivePosition = createSelector(
  [selectActiveTab, selectActiveTabTree, selectActiveTabCursorPath],
  (t, tree, cursorPath) => {
    if (!t) return null;
    return { game: t.game, moves: lineTo(tree, cursorPath), cursorPath };
  }
);

export default docSlice.reducer;
