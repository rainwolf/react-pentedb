// Save orchestration for the active document (P3 Task 3). Encapsulates the whole flow so
// the Workbench shell stays thin: it wires the Ctrl/Cmd+S shortcut and a Save button to
// `requestSave`, and renders <SaveDialog {...saveDialog}/> / <LoginPromptDialog {...loginPrompt}/>.
//
//   requestSave():
//     - no savable active tab       -> no-op
//     - anonymous                   -> snapshot the tab to recovery + open the login prompt
//     - logged in                   -> open the name dialog
//   confirmSave(name):
//     - POST (new) or PUT (has aid) via useSaveAnalysisMutation, then markSaved({aid,name}).
//       On a first (POST) save markSaved re-keys the tab to `a:<aid>` so further saves PUT
//       and the URL becomes /a/<aid>. The tab's recovery snapshot is cleared on success.
//
// Auth is read via usePingQuery (UserMenu's precedent) so it shares the single ping cache.
import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { usePingQuery, useSaveAnalysisMutation } from '../../app/api';
import { markSaved } from '../../model/docSlice';
import { toWire } from '../../model/gameTree';
import { variantKey } from '../../board/boardGeometry';
import { writeRecovery, clearRecovery } from './recovery';

const SAVABLE = new Set(['analysis', 'scratch']);

export default function useAnalysisSave() {
  const dispatch = useDispatch();
  const { data: ping } = usePingQuery();
  const authName = ping?.auth ?? null;
  const activeTab = useSelector(
    (s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null
  );
  const [saveAnalysis, { isLoading: saving }] = useSaveAnalysisMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState(null);

  const canSave = !!activeTab && SAVABLE.has(activeTab.kind);

  const requestSave = useCallback(() => {
    if (!activeTab || !SAVABLE.has(activeTab.kind)) return;
    if (!authName) {
      writeRecovery(activeTab); // keep the work across the login bounce
      setLoginOpen(true);
      return;
    }
    setError(null);
    setDialogOpen(true);
  }, [activeTab, authName]);

  const confirmSave = useCallback(
    async (name) => {
      if (!activeTab) return;
      const oldId = activeTab.id;
      try {
        const res = await saveAnalysis({
          aid: activeTab.aid,
          name,
          game: activeTab.game,
          tree: toWire(activeTab.tree),
        }).unwrap();
        const newAid = res && res.aid != null ? res.aid : activeTab.aid;
        dispatch(markSaved({ aid: newAid, name }));
        clearRecovery(oldId);
        if (newAid != null) clearRecovery(`a:${newAid}`);
        setDialogOpen(false);
      } catch (e) {
        setError(e);
      }
    },
    [activeTab, saveAnalysis, dispatch]
  );

  return {
    canSave,
    requestSave,
    saveDialog: {
      open: dialogOpen,
      name: activeTab ? activeTab.title : '',
      variant: activeTab ? variantKey(activeTab.game) : '',
      saving,
      error,
      onCancel: () => setDialogOpen(false),
      onSave: confirmSave,
    },
    loginPrompt: {
      open: loginOpen,
      onCancel: () => setLoginOpen(false),
    },
  };
}
