// Variation tree under the move strip, drawn as a real SGF-style node-and-edge diagram (fb14):
// the mainline runs left→right as a row of pill nodes joined by a straight rail; each variation
// branches DOWNWARD onto its own lane, connected by an elbow. Geometry comes from the pure,
// tested layoutTree (treeLayout.js) — this file is only the SVG view + interactions.
//
// Each node shows its board coordinate (formatMove, src/export/coords.js — null-safe, renders
// the pass sentinel as "PASS") plus any annotation glyphs. Clicking a node moves the cursor
// (navTo); the current cursor node is highlighted with the filled accent (matching the move
// strip). Right-click or a touch long-press opens a node menu to promote the variation or delete
// the branch (the latter behind a confirm dialog); the cursor-to-parent move on delete lives in
// the docSlice reducer, so the menu just dispatches the intent.
//
// A toolbar "Delete branch" button (fb15) sits in the header next to the export menu, so branch
// deletion is discoverable without needing to know about right-click/long-press. It targets the
// CURRENT CURSOR node and shares the exact same confirm-dialog state as the context menu (both
// funnel through requestDelete) — one dialog, two entry points. Disabled at the root (cursorPath
// []), where deleteBranch is a no-op. The long-press timer is also cleared on unmount so it can't
// fire setState after the component is gone.
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { alpha, useTheme } from '@mui/material/styles';

import { navTo, promoteVariation, deleteBranch, isProtectedOpening } from '../../model/docSlice';
import ExportMenu from '../exchange/ExportMenu';
import { formatMove } from '../../export/coords';
import { gridSizeForGame } from '../../board/boardGeometry';
import { layoutTree, startPoint, GEO } from './treeLayout';

const LONG_PRESS_MS = 500;

const pathKey = (p) => p.join('.');

function samePath(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Node label: the board coordinate plus any annotation glyphs (e.g. "G14 !"). formatMove is
// null-safe (root -> '') and renders the pass sentinel (gridSize*gridSize, shared by Go and
// Renju) as "PASS" instead of throwing. `size` must match the active game's board
// (gridSizeForGame) — small Go/Renju variants (9x9/13x13/15x15) are narrower than 19.
export function chipLabel(item, size = 19) {
  const label = formatMove(item.m, size);
  return item.tags && item.tags.length ? `${label} ${item.tags.join('')}` : label;
}

export default function TreeView() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const activeTab = useSelector((s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null);
  const [menu, setMenu] = useState(null); // { anchorEl, path }
  const [confirm, setConfirm] = useState(null); // { path }
  const longPressRef = useRef(null);
  const cursorRef = useRef(null); // the <g> of the current cursor node, for scroll-into-view

  const tabId = activeTab ? activeTab.id : null;
  const cursorKey = activeTab ? pathKey(activeTab.cursorPath) : '';

  // Keep the current node visible when the cursor moves (nice-to-have). Guarded for jsdom, which
  // doesn't implement scrollIntoView.
  useEffect(() => {
    const el = cursorRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* not implemented in the test environment */
      }
    }
  }, [tabId, cursorKey]);

  // Unmount cleanup (fb14 nit): a pending long-press timer must not fire setMenu after this
  // component is gone (tab closed / switched away mid-press).
  useEffect(() => () => clearTimeout(longPressRef.current), []);

  if (!activeTab) return null;
  const { tree, cursorPath, game } = activeTab;
  const size = gridSizeForGame(game);
  const { nodes, edges, width, height } = layoutTree(tree);
  const nodeByPath = new Map(nodes.map((n) => [pathKey(n.path), n]));

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

  // Shared by both delete entry points (toolbar button + context-menu item) so there is exactly
  // one confirm dialog regardless of how the delete was requested.
  const requestDelete = (path) => setConfirm({ path });

  const handlePromote = () => {
    dispatch(promoteVariation(menu.path));
    closeMenu();
  };
  const handleDeleteRequest = () => {
    const path = menu.path;
    closeMenu();
    requestDelete(path);
  };
  const handleConfirmDelete = () => {
    dispatch(deleteBranch(confirm.path));
    setConfirm(null);
  };

  // Theme-aware ink. The mainline is the confident teal "rail"; variations are quieter elbows in
  // secondary ink — emphasis without a second bold colour. The cursor node is the one filled,
  // accented element (matching the move strip's cursor chip).
  const mainStroke = alpha(theme.palette.primary.main, 0.55);
  const varStroke = alpha(theme.palette.text.secondary, 0.4);
  const start = startPoint();

  const edgePath = (e) => {
    const c = nodeByPath.get(pathKey(e.toPath));
    if (!c) return null;
    const toX = c.x; // child's left edge
    const toY = c.y + GEO.NODE_H / 2; // child's vertical centre
    let fromX;
    let fromY;
    if (e.fromPath.length === 0) {
      // Springs from the start marker (the first move, or a variation off the root).
      fromX = start.x;
      fromY = start.y;
    } else {
      const p = nodeByPath.get(pathKey(e.fromPath));
      if (!p) return null;
      if (e.kind === 'main') {
        fromX = p.x + GEO.NODE_W; // parent's right edge
        fromY = p.y + GEO.NODE_H / 2;
      } else {
        fromX = p.x + GEO.NODE_W / 2; // parent's bottom-centre
        fromY = p.y + GEO.NODE_H;
      }
    }
    // main: a straight line on the shared row. variation: down then right — the elbow.
    return e.kind === 'main'
      ? `M ${fromX} ${fromY} L ${toX} ${toY}`
      : `M ${fromX} ${fromY} V ${toY} H ${toX}`;
  };

  return (
    <Box data-testid="tree-view" sx={{ px: 1, py: 0.5, overflow: 'auto', maxHeight: 220 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Tooltip title="Delete branch">
          <span>
            <IconButton
              size="small"
              aria-label="Delete branch"
              disabled={cursorPath.length === 0 || isProtectedOpening(activeTab, cursorPath)}
              onClick={() => requestDelete(cursorPath)}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <ExportMenu label="Export tree" size="small" />
      </Box>

      <Box
        sx={{
          '& .tv-node': { cursor: 'pointer' },
          '& .tv-node:hover .tv-node-box': { stroke: theme.palette.primary.main },
        }}
      >
        <svg width={width} height={height} role="img" aria-label="Variation tree" style={{ display: 'block' }}>
          {/* Connectors first, so nodes paint on top of the lines. */}
          {edges.map((e) => {
            const d = edgePath(e);
            if (!d) return null;
            return (
              <path
                key={`${pathKey(e.fromPath)}>${pathKey(e.toPath)}`}
                data-testid="tree-edge"
                data-kind={e.kind}
                d={d}
                fill="none"
                stroke={e.kind === 'main' ? mainStroke : varStroke}
                strokeWidth={e.kind === 'main' ? 2 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* The empty-board origin. */}
          <circle cx={start.x} cy={start.y} r={3} fill={varStroke} />

          {nodes.map((n) => {
            const isCursor = samePath(n.path, cursorPath);
            const label = chipLabel(n, size);
            return (
              <g
                key={pathKey(n.path)}
                ref={isCursor ? cursorRef : undefined}
                className="tv-node"
                data-testid={`tree-node-${n.path.join('-')}`}
                data-cursor={isCursor ? 'true' : 'false'}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-current={isCursor ? 'true' : undefined}
                onClick={() => dispatch(navTo(n.path))}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    dispatch(navTo(n.path));
                  }
                }}
                onContextMenu={(ev) => handleContextMenu(ev, n.path)}
                onTouchStart={(ev) => startLongPress(ev.currentTarget, n.path)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
              >
                <rect
                  className="tv-node-box"
                  x={n.x}
                  y={n.y}
                  width={GEO.NODE_W}
                  height={GEO.NODE_H}
                  rx={GEO.NODE_H / 2}
                  ry={GEO.NODE_H / 2}
                  fill={isCursor ? theme.palette.primary.main : theme.palette.background.paper}
                  stroke={isCursor ? theme.palette.primary.main : theme.palette.divider}
                  strokeWidth={isCursor ? 0 : 1}
                  style={{ transition: 'fill 120ms, stroke 120ms' }}
                />
                <text
                  x={n.x + GEO.NODE_W / 2}
                  y={n.y + GEO.NODE_H / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="11"
                  fontWeight={isCursor ? 600 : 500}
                  fill={isCursor ? theme.palette.primary.contrastText : theme.palette.text.primary}
                  style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none', userSelect: 'none' }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </Box>

      <Menu open={Boolean(menu)} anchorEl={menu ? menu.anchorEl : null} onClose={closeMenu}>
        <MenuItem onClick={handlePromote}>Promote variation</MenuItem>
        <MenuItem onClick={handleDeleteRequest} disabled={!!menu && isProtectedOpening(activeTab, menu.path)}>
          Delete branch
        </MenuItem>
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
