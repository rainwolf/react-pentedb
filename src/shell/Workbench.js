// The single routed component: layout shell + a URL<->document loader/sync effect.
// All four routes (/, /g/:gid, /p/:game/:moves, /a/:aid) render this component
// (see app/router.js); it reads whichever params matched and opens/activates the
// corresponding docSlice tab.
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { useGameQuery, useAnalysisQuery } from '../app/api';
import {
  openTab,
  activateTab,
  closeTab,
  navFirst,
  navPrev,
  navNext,
  navLast,
  navTo,
  selectActivePosition,
} from '../model/docSlice';
import { createTree, addMove, fromWire } from '../model/gameTree';
import { Game, GameState } from '../game/GameClass';
import Board from '../board/Board';
import '../resources/board.css';

import { useBreakpoint } from './responsive';
import { useThemeModeContext } from './theme';
import TopBar from './TopBar';
import PanelTabs from './PanelTabs';
import PanelSkeleton from './PanelSkeleton';

const ExplorerPanel = React.lazy(() => import('../features/explorer/ExplorerPanel'));
const SearchPanel = React.lazy(() => import('../features/search/SearchPanel'));
const AnalysisPanel = React.lazy(() => import('../features/analysis/AnalysisPanel'));
const AiPanel = React.lazy(() => import('../features/ai/AiPanel'));
const ThreatsPanel = React.lazy(() => import('../features/threats/ThreatsPanel'));

// No prefs feature yet (out of scope for this task) — the root route's default scratch
// tab always starts as pente (variant 1) until a preferences slice supplies a real default.
const DEFAULT_GAME = 1;

export function gameTitle(header) {
  if (!header) return 'Game';
  const p1 = header.player1 && header.player1.name;
  const p2 = header.player2 && header.player2.name;
  if (p1 && p2) return `${p1} vs ${p2}`;
  if (p1 || p2) return p1 || p2;
  return header.gid != null ? `Game ${header.gid}` : 'Game';
}

// Parses the `/p/:game/:moves` params into {game, cells}, or null if malformed —
// dash-separated non-negative ints, e.g. "180-199-210" (spec §8). Malformed params are
// the route's invalid-input case ("invalid -> redirect /").
export function parsePositionParams(gameParam, movesParam) {
  const gameNum = Number(gameParam);
  if (!Number.isInteger(gameNum) || gameNum <= 0) return null;
  if (!movesParam) return null;
  const parts = movesParam.split('-');
  const cells = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    cells.push(Number(part));
  }
  if (cells.length === 0) return null;
  return { game: gameNum, cells };
}

// The canonical URL for a tab's current state — game/analysis tabs are addressed by
// id and ignore cursor position; scratch tabs (and any tab without a gid/aid) are
// addressed by their move line via /p/:game/:moves, falling back to '/' at the root
// (no moves played yet, e.g. a brand new scratch tab).
export function canonicalUrl(tab, pos) {
  if (tab.kind === 'game' && tab.gid != null) return `/g/${tab.gid}`;
  if (tab.kind === 'analysis' && tab.aid != null) return `/a/${tab.aid}`;
  if (!pos.moves || pos.moves.length === 0) return '/';
  return `/p/${pos.game}/${pos.moves.join('-')}`;
}

function buildTreeFromMoves(moves) {
  let tree = createTree();
  let path = [];
  for (const m of moves) {
    ({ tree, path } = addMove(tree, path, m));
  }
  return { tree, path };
}

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

  const docs = useSelector((s) => s.docs);
  const activeTab = docs.tabs.find((t) => t.id === docs.activeTabId) || null;

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
      const key = `g:${gidNum}`;
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

  // --- Board (read-only) ----------------------------------------------------------
  const boardGame = useMemo(() => {
    if (!activePos) return null;
    const g = new Game();
    g.setGame(activePos.game);
    g.gameState = { ...g.gameState, state: GameState.State.STARTED };
    activePos.moves.forEach((m) => g.addMove(m));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePos]);

  const handleActivate = (id) => dispatch(activateTab(id));
  const handleClose = (id) => dispatch(closeTab(id));

  const centerColumn = (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <PanelTabs tabs={docs.tabs} activeTabId={docs.activeTabId} onActivate={handleActivate} onClose={handleClose} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5 }}>
        <IconButton size="small" aria-label="First move" disabled={!activeTab} onClick={() => dispatch(navFirst())}>
          <FirstPageIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Previous move" disabled={!activeTab} onClick={() => dispatch(navPrev())}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Next move" disabled={!activeTab} onClick={() => dispatch(navNext())}>
          <ArrowForwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Last move" disabled={!activeTab} onClick={() => dispatch(navLast())}>
          <LastPageIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, p: 2 }}>
        {boardGame && activePos ? (
          <Box sx={{ width: '100%', maxWidth: 640, aspectRatio: '1 / 1' }}>
            <Board game={boardGame} gameId={activePos.game} myTurn={false} />
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No document open
          </Typography>
        )}
      </Box>
      {activePos && activePos.moves.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ px: 1, py: 0.5, overflowX: 'auto' }}>
          {activePos.moves.map((m, i) => (
            <Chip
              key={i}
              label={m}
              size="small"
              color={i === activePos.cursorPath.length - 1 ? 'primary' : 'default'}
              onClick={() => dispatch(navTo(activePos.cursorPath.slice(0, i + 1)))}
            />
          ))}
        </Stack>
      )}
    </Box>
  );

  const leftPanel = (
    <Box sx={{ width: 280, flexShrink: 0, borderRight: 1, borderColor: 'divider', overflow: 'auto' }}>
      <Suspense fallback={<PanelSkeleton />}>
        <SearchPanel />
      </Suspense>
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
            <Box sx={{ width: 280 }}>
              <Suspense fallback={<PanelSkeleton />}>
                <SearchPanel />
              </Suspense>
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
            <Tab value="ai" label="AI" />
          </Tabs>
          <Box sx={{ maxHeight: 240, overflow: 'auto' }}>
            <Suspense fallback={<PanelSkeleton />}>
              {mobileTab === 'explorer' && <ExplorerPanel />}
              {mobileTab === 'games' && <SearchPanel />}
              {mobileTab === 'analysis' && <AnalysisPanel />}
              {mobileTab === 'ai' && <AiPanel />}
            </Suspense>
          </Box>
        </Box>
      )}
    </Box>
  );
}
