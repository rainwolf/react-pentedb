// Horizontal move strip under the board: chips for the current line (root -> cursor, then the
// mainline continuation to the leaf), the cursor highlighted, each branched node badged `+n`
// with its alternative-continuation count. Clicking a chip jumps the cursor there (navTo).
import { useDispatch, useSelector } from 'react-redux';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import { navTo } from '../../model/docSlice';

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
  const activeTab = useSelector((s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null);
  if (!activeTab) return null;
  const items = buildStripItems(activeTab.tree, activeTab.cursorPath);
  if (items.length === 0) return null;

  return (
    <Stack direction="row" spacing={0.5} sx={{ px: 1, py: 0.5, overflowX: 'auto', flexWrap: 'nowrap' }}>
      {items.map((it, i) => (
        <Chip
          key={it.path.join('-')}
          size="small"
          color={it.isCursor ? 'primary' : 'default'}
          variant={it.isCursor ? 'filled' : 'outlined'}
          onClick={() => dispatch(navTo(it.path))}
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.25 }}>
              <span>{it.m}</span>
              {it.branches > 0 && (
                <Box component="span" sx={{ fontSize: '0.7em', opacity: 0.75 }}>{`+${it.branches}`}</Box>
              )}
            </Box>
          }
        />
      ))}
    </Stack>
  );
}
