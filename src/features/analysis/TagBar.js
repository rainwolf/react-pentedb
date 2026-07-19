// Annotation glyph toggles for the cursor node. Clicking a glyph toggles it on/off (docSlice
// toggleTag). The name->glyph mapping is BINDING (sgf-pgn-formats.md) and is asserted in tests
// so a drift here fails loudly rather than silently corrupting exported SGF/PGN annotations.
import { useDispatch, useSelector } from 'react-redux';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';

import { toggleTag } from '../../model/docSlice';
import { nodeAt } from '../../model/gameTree';

export const TAG_GLYPHS = [
  { name: 'GOOD', glyph: '!', label: 'Good' },
  { name: 'VERY_GOOD', glyph: '!!', label: 'Very good' },
  { name: 'BAD', glyph: '?', label: 'Bad' },
  { name: 'VERY_BAD', glyph: '??', label: 'Very bad' },
  { name: 'INTERESTING', glyph: '!?', label: 'Interesting' },
];

export default function TagBar() {
  const dispatch = useDispatch();
  const activeTab = useSelector((s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null);
  if (!activeTab) return null;

  const node = nodeAt(activeTab.tree, activeTab.cursorPath);
  // The root (no move played) cannot carry a move annotation.
  const disabled = !node || activeTab.cursorPath.length === 0;
  const tags = node ? node.tags : [];

  return (
    <Stack direction="row" spacing={0.5} sx={{ px: 1, py: 0.5, flexWrap: 'wrap' }}>
      {TAG_GLYPHS.map((t) => (
        <ToggleButton
          key={t.name}
          value={t.glyph}
          size="small"
          aria-label={t.label}
          title={t.label}
          disabled={disabled}
          selected={tags.includes(t.glyph)}
          onClick={() => dispatch(toggleTag(t.glyph))}
        >
          {t.glyph}
        </ToggleButton>
      ))}
    </Stack>
  );
}
