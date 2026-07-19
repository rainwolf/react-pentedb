// Ctrl/Cmd+S -> save the active document (P3 Task 3). A sibling to useKeyboardNav (which
// deliberately ignores modified chords), installed once by the Workbench shell.
//
// preventDefault ALWAYS fires so the browser's "Save page" dialog never appears. The save
// itself respects the same input-focus guard as useKeyboardNav: while the caret is in a
// text field (e.g. a comment box) the keystroke is swallowed but no save is triggered.
import { useEffect } from 'react';

function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export default function useSaveShortcut(onSave, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key !== 's' && e.key !== 'S') return;
      e.preventDefault(); // suppress the browser save-page dialog in every case
      if (isTypingTarget(e.target)) return; // don't hijack save while editing text
      onSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave, enabled]);
}
