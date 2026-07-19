// Comment editor for the cursor node. Edits are local (responsive typing) and autosaved to
// docSlice after a 500ms idle debounce (applyComment). The field re-seeds from stored state
// only when the cursor moves to a DIFFERENT node — never on the store update our own save
// triggers — so an in-flight edit is never clobbered mid-keystroke.
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TextField from '@mui/material/TextField';

import { applyComment } from '../../model/docSlice';
import { nodeAt } from '../../model/gameTree';

const AUTOSAVE_MS = 500;

export default function CommentBox() {
  const dispatch = useDispatch();
  const activeTab = useSelector((s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null);

  const node = activeTab ? nodeAt(activeTab.tree, activeTab.cursorPath) : null;
  const stored = node ? node.c : '';
  // Identity of the node under the cursor — resync the field only when THIS changes.
  const nodeKey = activeTab ? `${activeTab.id}:${activeTab.cursorPath.join('.')}` : null;

  const [text, setText] = useState(stored);
  const lastKeyRef = useRef(nodeKey);

  // Cursor moved to a different node -> load that node's stored comment into the field.
  useEffect(() => {
    if (nodeKey !== lastKeyRef.current) {
      lastKeyRef.current = nodeKey;
      setText(stored);
    }
  }, [nodeKey, stored]);

  // Debounced autosave: flush the edited text to state once typing pauses for AUTOSAVE_MS.
  useEffect(() => {
    if (!activeTab || text === stored) return undefined;
    const id = setTimeout(() => dispatch(applyComment(text)), AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [text, stored, activeTab, dispatch]);

  if (!activeTab) return null;

  return (
    <TextField
      label="Comment"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Notes on this move…"
      multiline
      minRows={2}
      fullWidth
      size="small"
      sx={{ px: 1, py: 0.5 }}
    />
  );
}
