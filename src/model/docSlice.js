// Document-tabs slice (RTK). Each tab holds its own variation tree and cursor over the game
// board. All updates are immutable via createSlice/Immer; the tree edits delegate to the pure
// gameTree module (which returns fresh trees — assigning them into the Immer draft is fine).
//
// State: { tabs: [{ id, kind:'game'|'analysis'|'scratch', title, game, gid?, aid?, tree,
//                   cursorPath, dirty }],
//          activeTabId,
//          seq }   // seq is an internal id counter for tabs opened without an explicit id.
import { createSelector, createSlice } from '@reduxjs/toolkit';
import { createTree, addMove, nodeAt, lineTo, setTag, setComment } from './gameTree';

const initialState = { tabs: [], activeTabId: null, seq: 1 };

function activeTab(state) {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
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

const docSlice = createSlice({
  name: 'docs',
  initialState,
  reducers: {
    openTab: {
      reducer(state, action) {
        const p = action.payload;
        const id = p.id != null ? p.id : `tab${state.seq}`;
        if (p.id == null) state.seq += 1;
        state.tabs.push({
          id,
          kind: p.kind || 'scratch',
          title: p.title || '',
          game: p.game,
          gid: p.gid,
          aid: p.aid,
          tree: p.tree || createTree(),
          cursorPath: p.cursorPath || [],
          dirty: false,
        });
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

    activateTab(state, action) {
      if (state.tabs.some((t) => t.id === action.payload)) state.activeTabId = action.payload;
    },

    navTo(state, action) {
      const t = activeTab(state);
      if (t) t.cursorPath = action.payload;
    },

    navNext(state) {
      const t = activeTab(state);
      if (!t) return;
      const node = nodeAt(t.tree, t.cursorPath);
      if (node && node.kids.length) t.cursorPath = [...t.cursorPath, 0];
    },

    navPrev(state) {
      const t = activeTab(state);
      if (t && t.cursorPath.length) t.cursorPath = t.cursorPath.slice(0, -1);
    },

    navFirst(state) {
      const t = activeTab(state);
      if (t) t.cursorPath = [];
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

    markSaved(state) {
      const t = activeTab(state);
      if (t) t.dirty = false;
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
  markSaved,
} = docSlice.actions;

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
