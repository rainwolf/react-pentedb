// The single routed component: layout shell + a URL<->document loader/sync effect.
// All four routes (/, /g/:gid, /p/:game/:moves, /a/:aid) render this component
// (see app/router.js); it reads whichever params matched and opens/activates the
// corresponding docSlice tab.
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import SaveIcon from '@mui/icons-material/Save';

import { useGameQuery, useAnalysisQuery } from '../app/api';
import {
  openTab,
  activateTab,
  closeTab,
  restoreTab,
  selectActivePosition,
} from '../model/docSlice';
import { fromWire } from '../model/gameTree';
import '../resources/board.css';

// Shared tab/URL/title helpers now live in a dependency-free leaf module so the feature
// panels can import them without pulling this shell module back into a cycle. See
// gameTab.js for why (blank-first-render fix). DEFAULT_GAME stays internal to the shell.
import {
  DEFAULT_GAME,
  gameTitle,
  parsePositionParams,
  canonicalUrl,
  buildTreeFromMoves,
  gameTabId,
} from './gameTab';

import { useBreakpoint } from './responsive';
import { useThemeModeContext } from './theme';
import TopBar from './TopBar';
import PanelTabs from './PanelTabs';
import PanelSkeleton from './PanelSkeleton';
import PanelError from './PanelError';
import GameHeaderBar from '../features/viewer/GameHeaderBar';
import NavControls from '../features/viewer/NavControls';
import BoardPane from '../features/viewer/BoardPane';
import MoveStrip from '../features/viewer/MoveStrip';
import useKeyboardNav from '../features/viewer/useKeyboardNav';
import useSaveShortcut from '../features/analysis/useSaveShortcut';
import useAnalysisSave from '../features/analysis/useAnalysisSave';
import SaveDialog, { LoginPromptDialog, RecoveryDialog } from '../features/analysis/SaveDialog';
import { writeRecovery, clearRecovery, readAllRecovery } from '../features/analysis/recovery';

const ExplorerPanel = React.lazy(() => import('../features/explorer/ExplorerPanel'));
const SearchPanel = React.lazy(() => import('../features/search/SearchPanel'));
const AnalysesList = React.lazy(() => import('../features/analysis/AnalysesList'));
const AnalysisPanel = React.lazy(() => import('../features/analysis/AnalysisPanel'));
const AiPanel = React.lazy(() => import('../features/ai/AiPanel'));
const ThreatsPanel = React.lazy(() => import('../features/threats/ThreatsPanel'));

// gameTitle, parsePositionParams, canonicalUrl, buildTreeFromMoves, gameTabId and
// DEFAULT_GAME now live in the dependency-free ./gameTab leaf (imported above for this
// shell's own use). Re-exported here so any existing importer of them via
// '../shell/Workbench' keeps resolving — pure move + re-export, behavior unchanged.
export {
  gameTitle,
  parsePositionParams,
  canonicalUrl,
  buildTreeFromMoves,
  gameTabId,
} from './gameTab';

export default function Workbench() {
  const { gid, game: gameParam, moves: movesParam, aid } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const bp = useBreakpoint();
  const [mode, toggleTheme] = useThemeModeContext();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rightTab, setRightTab] = useState('explorer');
  const [mobileTab, setMobileTab] = useState('explorer');
  const [leftTab, setLeftTab] = useState('search');

  // ←/→/Home/End/↑/↓ step the active tab's cursor (spec §9); dispatches flow through the same
  // activePos -> URL-sync path as the NavControls buttons.
  useKeyboardNav();

  const docs = useSelector((s) => s.docs);
  const activeTab = docs.tabs.find((t) => t.id === docs.activeTabId) || null;

  // --- Save / recovery (P3 Task 3) ----------------------------------------------
  // useAnalysisSave owns the whole save flow (name dialog vs anonymous login prompt, POST
  // vs PUT, tab re-key); we just wire Ctrl/Cmd+S and the toolbar button to requestSave and
  // render the dialogs it drives.
  const { canSave, requestSave, saveDialog, loginPrompt } = useAnalysisSave();
  useSaveShortcut(requestSave);

  // Snapshot every dirty analysis/scratch tab on unload so a reload (or a bounce through
  // login) never loses in-progress work; offered back via the restore dialog next visit.
  // Reads the store directly at unload time (not a render-synced ref) so a dispatch that
  // lands between the last render and the unload is still captured.
  const reduxStore = useStore();
  useEffect(() => {
    const onBeforeUnload = () => {
      for (const t of reduxStore.getState().docs.tabs) {
        if (t.dirty && (t.kind === 'analysis' || t.kind === 'scratch')) writeRecovery(t);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [reduxStore]);

  // Read once on mount: any snapshots left by a previous visit are offered for restore.
  const [recoveries, setRecoveries] = useState(() => readAllRecovery());
  const dismissRecovery = () => {
    recoveries.forEach((r) => clearRecovery(r.id));
    setRecoveries([]);
  };
  const restoreRecovery = () => {
    recoveries.forEach((r) => {
      // restoreTab is idempotent on id: it replaces an existing tab (the '/' default
      // scratch tab or a dirty-reloaded /a/:aid tab share the recovery's id) instead of
      // pushing a duplicate. See docSlice.restoreTab.
      dispatch(
        restoreTab({
          id: r.id,
          kind: r.aid != null ? 'analysis' : 'scratch',
          title: r.name,
          game: r.game,
          aid: r.aid != null ? r.aid : undefined,
          tree: fromWire(r.tree),
        })
      );
      clearRecovery(r.id);
    });
    setRecoveries([]);
  };

  const rawActivePos = useSelector(selectActivePosition);
  // selectActivePosition builds fresh array/object literals every call; memoize on
  // content so effects keyed on it don't re-fire on unrelated store updates.
  const activePos = useMemo(
    () => rawActivePos,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      rawActivePos && rawActivePos.game,
      rawActivePos && rawActivePos.moves.join(','),
      rawActivePos && rawActivePos.cursorPath.join(','),
    ]
  );

  const gidNum = gid !== undefined ? Number(gid) : undefined;
  const gidValid = gidNum !== undefined && Number.isInteger(gidNum) && gidNum > 0;
  const gameQuery = useGameQuery(gidNum, { skip: !gidValid });

  const aidNum = aid !== undefined ? Number(aid) : undefined;
  const aidValid = aidNum !== undefined && Number.isInteger(aidNum) && aidNum > 0;
  const analysisQuery = useAnalysisQuery(aidNum, { skip: !aidValid });

  // --- Route -> document loader -------------------------------------------------
  // loadedRouteKeyRef guards the "existing tab found -> make it active" reconciliation
  // below so it only fires when the route's *target key* actually changes (a new URL,
  // e.g. browser back/forward or a direct navigation) rather than on every render where
  // docs.activeTabId happens to differ from it. Without this guard, an in-app tab
  // switch (docSlice activateTab dispatched straight from a tab-strip click, before the
  // URL has caught up) gets misread here as "activeTabId drifted from the route" and is
  // force-reverted back to the route's old tab — fighting the URL-sync effect below,
  // which is simultaneously trying to push the new tab's URL. Each effect kept undoing
  // the other's redux/router state every render instead of converging, hanging the
  // "switching the active tab" test indefinitely.
  const loadedRouteKeyRef = useRef(null);
  // Guards the '/' branch's one-time default-tab dispatch below against the same
  // closure-staleness hazard: React 18 StrictMode (see src/index.js) double-invokes
  // effects in dev using the *same* pre-dispatch render closure for both calls, so a
  // `docs.tabs.length === 0` check alone sees zero both times and opens two tabs on a
  // fresh '/' load. A ref (persists across both StrictMode invocations, unlike closure
  // state) closes that hole the same way loadedRouteKeyRef does for the other branches.
  const defaultTabOpenedRef = useRef(false);
  // Guards the route-loader effect against reconciling against URL changes that OUR OWN
  // "active document -> URL sync" effect just wrote (see below) — e.g. cursor stepping
  // issues a replaceState to a shorter /p/:game/:moves URL (activePos.moves is the line
  // to the CURSOR, not the tab's full line — see selectActivePosition in docSlice.js).
  // Without this, the loader re-derives a route key from that self-inflicted URL change,
  // finds no tab with that (now cursor-truncated) key, and opens a SECOND scratch tab
  // with a truncated tree instead of recognizing "this is the same tab, cursor moved."
  // A ref (not a closure var) survives across the effect's own re-fires triggered by the
  // very navigate() call it's meant to ignore.
  const lastSyncedUrlRef = useRef(null);
  useEffect(() => {
    // If the URL already matches what the sync effect below last wrote, this render's
    // param change is self-inflicted (cursor-step replaceState), not an external
    // navigation — skip reconciliation entirely. See lastSyncedUrlRef above.
    if (location.pathname === lastSyncedUrlRef.current) return;
    if (gid !== undefined) {
      if (!gidValid) {
        navigate('/', { replace: true });
        return;
      }
      const key = gameTabId(gidNum);
      if (loadedRouteKeyRef.current === key) return;
      const existing = docs.tabs.find((t) => t.id === key);
      if (existing) {
        loadedRouteKeyRef.current = key;
        if (docs.activeTabId !== key) dispatch(activateTab(key));
        return;
      }
      if (!gameQuery.data) return; // wait for the query to resolve, keep retrying
      loadedRouteKeyRef.current = key;
      const { tree, path } = buildTreeFromMoves(gameQuery.data.moves || []);
      dispatch(
        openTab({
          id: key,
          kind: 'game',
          title: gameTitle(gameQuery.data.header),
          game: gameQuery.data.header ? gameQuery.data.header.game : DEFAULT_GAME,
          gid: gidNum,
          tree,
          cursorPath: path,
        })
      );
      return;
    }

    if (aid !== undefined) {
      if (!aidValid) {
        navigate('/', { replace: true });
        return;
      }
      const key = `a:${aidNum}`;
      if (loadedRouteKeyRef.current === key) return;
      const existing = docs.tabs.find((t) => t.id === key);
      if (existing) {
        loadedRouteKeyRef.current = key;
        if (docs.activeTabId !== key) dispatch(activateTab(key));
        return;
      }
      if (!analysisQuery.data) return;
      loadedRouteKeyRef.current = key;
      const tree = fromWire(analysisQuery.data.tree);
      dispatch(
        openTab({
          id: key,
          kind: 'analysis',
          title: analysisQuery.data.name || `Analysis ${aidNum}`,
          game: analysisQuery.data.game,
          aid: aidNum,
          tree,
          cursorPath: [],
        })
      );
      return;
    }

    if (gameParam !== undefined || movesParam !== undefined) {
      const parsed = parsePositionParams(gameParam, movesParam);
      if (!parsed) {
        navigate('/', { replace: true });
        return;
      }
      const key = `p:${parsed.game}:${parsed.cells.join('-')}`;
      if (loadedRouteKeyRef.current === key) return;
      const existing = docs.tabs.find((t) => t.id === key);
      if (existing) {
        loadedRouteKeyRef.current = key;
        if (docs.activeTabId !== key) dispatch(activateTab(key));
        return;
      }
      loadedRouteKeyRef.current = key;
      const { tree, path } = buildTreeFromMoves(parsed.cells);
      dispatch(
        openTab({
          id: key,
          kind: 'scratch',
          title: `Position ${parsed.game}`,
          game: parsed.game,
          tree,
          cursorPath: path,
        })
      );
      return;
    }

    // '/' — root workbench. Open a default empty scratch tab if nothing is open yet.
    loadedRouteKeyRef.current = null;
    if (docs.tabs.length === 0 && !defaultTabOpenedRef.current) {
      defaultTabOpenedRef.current = true;
      dispatch(openTab({ kind: 'scratch', title: 'New position', game: DEFAULT_GAME }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gid,
    gidValid,
    gidNum,
    aid,
    aidValid,
    aidNum,
    gameParam,
    movesParam,
    gameQuery.data,
    analysisQuery.data,
    docs.tabs,
    docs.activeTabId,
    dispatch,
    navigate,
  ]);

  // --- Active document -> URL sync -----------------------------------------------
  // replaceState while stepping the cursor within the SAME tab (keeps history length
  // stable); pushState when the active tab itself changes (a "load action" — spec §8).
  const prevActiveIdRef = useRef(activeTab ? activeTab.id : null);
  useEffect(() => {
    if (!activeTab || !activePos) return;
    const url = canonicalUrl(activeTab, activePos);
    if (url === location.pathname) {
      prevActiveIdRef.current = activeTab.id;
      lastSyncedUrlRef.current = url;
      return;
    }
    const isTabSwitch = prevActiveIdRef.current !== activeTab.id;
    navigate(url, { replace: !isTabSwitch });
    prevActiveIdRef.current = activeTab.id;
    lastSyncedUrlRef.current = url;
  }, [activeTab, activePos, location.pathname, navigate]);

  const handleActivate = (id) => dispatch(activateTab(id));
  const handleClose = (id) => dispatch(closeTab(id));

  // Route-loader error surface (render-time only — no new effect/ref, just the same
  // gameQuery/analysisQuery state the loader effect above already reads). A routed
  // /g/:gid or /a/:aid whose query errors (404/401/etc.) never resolves a tab, so the
  // loader effect's `if (!query.data) return;` guard leaves docs.tabs untouched — without
  // this, that renders a permanently blank workbench with no feedback. Only surfaced when
  // no tab already covers the routed key, so an error on a route that's already loaded
  // (e.g. a stale refetch) doesn't blow away a working view.
  const gameRouteError =
    gid !== undefined && gidValid && gameQuery.isError && !docs.tabs.find((t) => t.id === gameTabId(gidNum))
      ? gameQuery.error
      : null;
  const analysisRouteError =
    aid !== undefined && aidValid && analysisQuery.isError && !docs.tabs.find((t) => t.id === `a:${aidNum}`)
      ? analysisQuery.error
      : null;
  const routeLoadError = gameRouteError || analysisRouteError;

  // Center pane: tab strip, game header (captures/to-move), transport controls, the interactive
  // board, and the move strip. Each viewer piece reads the active position from docSlice itself.
  const centerColumn = (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable' }}>
      <PanelTabs tabs={docs.tabs} activeTabId={docs.activeTabId} onActivate={handleActivate} onClose={handleClose} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          size="small"
          startIcon={<SaveIcon fontSize="small" />}
          onClick={requestSave}
          disabled={!canSave}
          aria-label="Save analysis"
        >
          Save
        </Button>
        {activeTab && activeTab.dirty && (
          <Typography variant="caption" color="warning.main">
            Unsaved changes
          </Typography>
        )}
      </Box>
      {routeLoadError && <PanelError error={routeLoadError} />}
      <GameHeaderBar />
      <NavControls />
      <BoardPane />
      <MoveStrip />
    </Box>
  );

  // Left-panel body: Search or the signed-in user's saved analyses (P3 Task 3). Shared by
  // the wide left rail and the medium drawer so both offer the same two tabs.
  const leftPanelBody = (
    <>
      <Tabs value={leftTab} onChange={(e, v) => setLeftTab(v)} variant="fullWidth">
        <Tab value="search" label="Search" />
        <Tab value="mine" label="My analyses" />
      </Tabs>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<PanelSkeleton />}>
          {leftTab === 'search' && <SearchPanel />}
          {leftTab === 'mine' && <AnalysesList />}
        </Suspense>
      </Box>
    </>
  );

  const leftPanel = (
    <Box sx={{ width: 280, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
      {leftPanelBody}
    </Box>
  );

  const rightPanel = (
    <Box sx={{ width: 320, flexShrink: 0, borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={rightTab} onChange={(e, v) => setRightTab(v)} variant="fullWidth">
        <Tab value="explorer" label="Explorer" />
        <Tab value="ai" label="AI" />
        <Tab value="threats" label="Threats" />
      </Tabs>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<PanelSkeleton />}>
          {rightTab === 'explorer' && <ExplorerPanel />}
          {rightTab === 'ai' && <AiPanel />}
          {rightTab === 'threats' && <ThreatsPanel />}
        </Suspense>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        mode={mode}
        onToggleTheme={toggleTheme}
        showMenuButton={bp === 'medium'}
        onOpenDrawer={() => setDrawerOpen(true)}
      />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {bp === 'wide' && leftPanel}
        {bp === 'medium' && (
          <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            <Box sx={{ width: 280, display: 'flex', flexDirection: 'column', height: '100%' }}>
              {leftPanelBody}
            </Box>
          </Drawer>
        )}
        {centerColumn}
        {(bp === 'wide' || bp === 'medium') && rightPanel}
      </Box>
      {bp === 'narrow' && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Tabs value={mobileTab} onChange={(e, v) => setMobileTab(v)} variant="fullWidth">
            <Tab value="explorer" label="Explorer" />
            <Tab value="games" label="Games" />
            <Tab value="analysis" label="Analysis" />
            <Tab value="saved" label="Saved" />
            <Tab value="ai" label="AI" />
          </Tabs>
          <Box sx={{ maxHeight: 240, overflow: 'auto' }}>
            <Suspense fallback={<PanelSkeleton />}>
              {mobileTab === 'explorer' && <ExplorerPanel />}
              {mobileTab === 'games' && <SearchPanel />}
              {mobileTab === 'analysis' && <AnalysisPanel />}
              {mobileTab === 'saved' && <AnalysesList />}
              {mobileTab === 'ai' && <AiPanel />}
            </Suspense>
          </Box>
        </Box>
      )}

      <SaveDialog {...saveDialog} />
      <LoginPromptDialog {...loginPrompt} />
      <RecoveryDialog
        open={recoveries.length > 0}
        entries={recoveries}
        onRestore={restoreRecovery}
        onDismiss={dismissRecovery}
      />
    </Box>
  );
}
