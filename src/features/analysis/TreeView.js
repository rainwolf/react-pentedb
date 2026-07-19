// Variation tree under the move strip: the mainline laid out horizontally, each variation
// indented on its own row (a recursive flatten of the gameTree kids). Chips show the move
// (reusing MoveStrip's raw-cell labeling — the canonical coordinate module lands in Task 4)
// plus any annotation glyphs. Clicking a chip moves the cursor (navTo); right-click or a
// touch long-press opens a node menu to promote the variation or delete the branch (the
// latter behind a confirm dialog). The cursor-to-parent move on delete lives in the docSlice
// reducer, so the menu just dispatches the intent.
import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

import { navTo, promoteVariation, deleteBranch } from '../../model/docSlice';
import ExportMenu from '../exchange/ExportMenu';

const LONG_PRESS_MS = 500;

// Pure: flatten `tree` into display rows. Each row is one line of play — { indent, items } —
// where items are { m, path, tags } in left-to-right order. The mainline (following kids[0]
// from the root) is row 0 at indent 0; every alternative kid (index >= 1) starts a new, more
// deeply indented row, emitted depth-first after the line that branches to it. The root node
// (m === null) carries no chip but still seeds the first line and its root-level variations.
export function buildTreeRows(tree) {
  const rows = [];
  if (!tree || !tree.root) return rows;

  const emitLine = (startNode, startPath, indent) => {
    const items = [];
    const pending = [];
    let node = startNode;
    let path = startPath;
    while (node) {
      if (node.m !== null) items.push({ m: node.m, path, tags: node.tags });
      for (let i = 1; i < node.kids.length; i++) {
        pending.push({ node: node.kids[i], path: [...path, i], indent: indent + 1 });
      }
      if (node.kids.length === 0) break;
      node = node.kids[0];
      path = [...path, 0];
    }
    rows.push({ indent, items });
    for (const p of pending) emitLine(p.node, p.path, p.indent);
  };

  emitLine(tree.root, [], 0);
  return rows;
}

function samePath(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function chipLabel(item) {
  return item.tags && item.tags.length ? `${item.m} ${item.tags.join('')}` : `${item.m}`;
}

export default function TreeView() {
  const dispatch = useDispatch();
  const activeTab = useSelector((s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null);
  const [menu, setMenu] = useState(null); // { anchorEl, path }
  const [confirm, setConfirm] = useState(null); // { path }
  const longPressRef = useRef(null);

  if (!activeTab) return null;
  const { tree, cursorPath } = activeTab;
  const rows = buildTreeRows(tree);

  const openMenu = (anchorEl, path) => setMenu({ anchorEl, path });
  const closeMenu = () => setMenu(null);

  const handleContextMenu = (e, path) => {
    e.preventDefault();
    openMenu(e.currentTarget, path);
  };
  const startLongPress = (el, path) => {
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => openMenu(el, path), LONG_PRESS_MS);
  };
  const cancelLongPress = () => clearTimeout(longPressRef.current);

  const handlePromote = () => {
    dispatch(promoteVariation(menu.path));
    closeMenu();
  };
  const handleDeleteRequest = () => {
    const path = menu.path;
    closeMenu();
    setConfirm({ path });
  };
  const handleConfirmDelete = () => {
    dispatch(deleteBranch(confirm.path));
    setConfirm(null);
  };

  return (
    <Box data-testid="tree-view" sx={{ px: 1, py: 0.5, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
        <ExportMenu label="Export tree" size="small" />
      </Box>
      {rows.map((row, ri) => (
        <Box
          key={`row-${ri}-${row.items.map((it) => it.path.join('.')).join('_')}`}
          sx={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: 0.5,
            pl: row.indent * 2,
            py: 0.25,
          }}
        >
          {row.items.map((it) => {
            const isCursor = samePath(it.path, cursorPath);
            return (
              <Chip
                key={it.path.join('-')}
                size="small"
                color={isCursor ? 'primary' : 'default'}
                variant={isCursor ? 'filled' : 'outlined'}
                label={chipLabel(it)}
                onClick={() => dispatch(navTo(it.path))}
                onContextMenu={(e) => handleContextMenu(e, it.path)}
                onTouchStart={(e) => startLongPress(e.currentTarget, it.path)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
              />
            );
          })}
        </Box>
      ))}

      <Menu
        open={Boolean(menu)}
        anchorEl={menu ? menu.anchorEl : null}
        onClose={closeMenu}
      >
        <MenuItem onClick={handlePromote}>Promote variation</MenuItem>
        <MenuItem onClick={handleDeleteRequest}>Delete branch</MenuItem>
      </Menu>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>Delete branch?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This removes the selected move and every variation below it. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="error" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
