// Crash/anonymous-bounce recovery for unsaved analysis work (P3 Task 3).
//
// Each dirty (or anonymously-saved) tab is snapshotted to localStorage under
// `pentedb.recovery.<tabId>`, carrying the tree in WIRE form so it round-trips by
// structure (see gameTree toWire/fromWire). Written on two triggers:
//   - an anonymous Save (the user must log in first, so we keep their work), and
//   - `beforeunload` for every dirty tab, logged in or not.
// Restored on the next visit (Workbench offers a restore dialog on mount), and cleared
// once the tab is persisted to the server or the user discards the restore offer.
import { toWire } from '../../model/gameTree';

export const RECOVERY_PREFIX = 'pentedb.recovery.';

// localStorage may be absent (SSR) or throw (privacy mode / disabled) — recovery is a
// best-effort convenience, never a hard dependency, so every access is guarded.
function ls() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Snapshot one tab. `tab` is a docSlice tab ({ id, title, game, aid?, tree }); the tree
// is serialized to wire form here so the stored value is plain JSON.
export function writeRecovery(tab) {
  const store = ls();
  if (!store || !tab || !tab.tree) return;
  try {
    store.setItem(
      RECOVERY_PREFIX + tab.id,
      JSON.stringify({
        id: tab.id,
        name: tab.title || '',
        game: tab.game,
        aid: tab.aid != null ? tab.aid : null,
        tree: toWire(tab.tree),
        ts: Date.now(),
      })
    );
  } catch {
    /* quota exceeded or disabled — drop the snapshot silently */
  }
}

export function clearRecovery(tabId) {
  const store = ls();
  if (!store) return;
  try {
    store.removeItem(RECOVERY_PREFIX + tabId);
  } catch {
    /* ignore */
  }
}

// All recovery snapshots, newest first. Malformed entries are skipped rather than thrown.
export function readAllRecovery() {
  const store = ls();
  if (!store) return [];
  const out = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !key.startsWith(RECOVERY_PREFIX)) continue;
    try {
      const entry = JSON.parse(store.getItem(key));
      if (entry && entry.tree) out.push(entry);
    } catch {
      /* skip corrupt entry */
    }
  }
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
