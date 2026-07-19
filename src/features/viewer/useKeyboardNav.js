// Global keyboard navigation for the workbench viewer (spec §9):
//   ← prev · → next · Home first · End last · ↑/↓ sibling variations.
// Installed once by the Workbench shell. Dispatches the same docSlice nav actions the on-screen
// NavControls buttons do, so keyboard and buttons flow through the identical activePos -> URL
// sync path. Keystrokes are ignored while the user is typing in a field.
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import {
  navPrev,
  navNext,
  navFirst,
  navLast,
  navSiblingUp,
  navSiblingDown,
} from '../../model/docSlice';

// key -> action creator. Exported so tests (and future rebind UIs) can assert the map.
export const KEY_ACTIONS = {
  ArrowLeft: navPrev,
  ArrowRight: navNext,
  Home: navFirst,
  End: navLast,
  ArrowUp: navSiblingUp,
  ArrowDown: navSiblingDown,
};

function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export default function useKeyboardNav(enabled = true) {
  const dispatch = useDispatch();
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      // Leave modified chords (Ctrl/Cmd/Alt) and already-handled events to the browser/app.
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const action = KEY_ACTIONS[e.key];
      if (!action) return;
      e.preventDefault();
      dispatch(action());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, enabled]);
}
