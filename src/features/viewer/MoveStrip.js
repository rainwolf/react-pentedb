// Horizontal move strip under the board: chips for the current line (root -> cursor, then the
// mainline continuation to the leaf), the cursor highlighted, each branched node badged `+n`
// with its alternative-continuation count. Clicking a chip jumps the cursor there (navTo).
// A leading toggle expands the analysis tray beneath the strip — tag bar, variation TreeView,
// and comment editor — all of which read/write the active tab's cursor node via docSlice.
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { navTo } from '../../model/docSlice';
import TreeView from '../analysis/TreeView';
import TagBar from '../analysis/TagBar';
import CommentBox from '../analysis/CommentBox';
import { cellToAlpha } from '../../export/coords';
import { gridSizeForGame } from '../../board/boardGeometry';

// m -> human-readable board coordinate (e.g. 180 -> "K10"). buildStripItems only ever pushes
// items for nodes reached by walking past the root, so `m` should never be null here — but
// cellToAlpha throws RangeError on anything but an in-range integer, so guard defensively
// rather than rely on that upstream invariant. `size` must match the active game's board
// (gridSizeForGame) — small Go variants (9x9/13x13) are narrower than 19. Exported for
// unit testing.
export function moveLabel(m, size = 19) {
  return m == null ? '' : cellToAlpha(m, size);
}

// Pure: the chip descriptors for `cursorPath` in `tree`. Walks the cursor path, then follows
// kids[0] to the leaf so the strip shows the whole current line. `branches = kids.length - 1`
// (>0 => the node has alternative continuations => `+n` badge). Exported for unit testing.
export function buildStripItems(tree, cursorPath) {
  if (!tree || !tree.root) return [];
  const items = [];
  let node = tree.root;
  let path = [];
  for (const idx of cursorPath) {
    const next = node.kids[idx];
    if (!next) break;
    node = next;
    path = [...path, idx];
    items.push({
      m: node.m,
      path,
      branches: Math.max(0, node.kids.length - 1),
      isCursor: path.length === cursorPath.length,
    });
  }
  while (node && node.kids.length) {
    node = node.kids[0];
    path = [...path, 0];
    items.push({ m: node.m, path, branches: Math.max(0, node.kids.length - 1), isCursor: false });
  }
  return items;
}

export default function MoveStrip() {
  const dispatch = useDispatch();
  const [expanded, setExpanded] = useState(false);
  const activeTab = useSelector((s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null);
  if (!activeTab) return null;
  const items = buildStripItems(activeTab.tree, activeTab.cursorPath);
  if (items.length === 0) return null;
  const size = gridSizeForGame(activeTab.game);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ px: 1, py: 0.5, overflowX: 'auto', flexWrap: 'nowrap', alignItems: 'center' }}
      >
        <IconButton
          size="small"
          aria-label={expanded ? 'Hide variation tree' : 'Show variation tree'}
          aria-pressed={expanded}
          color={expanded ? 'primary' : 'default'}
          onClick={() => setExpanded((v) => !v)}
        >
          <AccountTreeIcon fontSize="small" />
        </IconButton>
        {items.map((it) => (
          <Chip
            key={it.path.join('-')}
            size="small"
            color={it.isCursor ? 'primary' : 'default'}
            variant={it.isCursor ? 'filled' : 'outlined'}
            onClick={() => dispatch(navTo(it.path))}
            label={
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.25 }}>
                <span>{moveLabel(it.m, size)}</span>
                {it.branches > 0 && (
                  <Box component="span" sx={{ fontSize: '0.7em', opacity: 0.75 }}>{`+${it.branches}`}</Box>
                )}
              </Box>
            }
          />
        ))}
      </Stack>
      {expanded && (
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          <TagBar />
          <TreeView />
          <CommentBox />
        </Box>
      )}
    </Box>
  );
}
