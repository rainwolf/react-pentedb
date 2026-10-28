// Export menu (P3 Task 5): a self-contained button+menu bound to the ACTIVE tab (no props
// required) so the same component can be dropped in at multiple entry points
// (GameHeaderBar, TreeView) per the brief. Offers all three formats regardless of tab kind
// ("SGF (analysis tree)" preserves the full branching tree; "SGF (game)"/"PGN" want a linear
// move list + a GameHeader — for an 'analysis'/'scratch' tab that header is just {game}, for
// a 'game' tab it's fetched via useGameQuery(gid) since docSlice tabs never persist the raw
// header (see Phase 2 selectors / ResultsList.js: only title/game are kept at open time).
//
// PGN always exports mainline(tree) — never the full tree — matching spec §12 (an analysis's
// PGN is mainline-only; PGN has no branch representation to begin with, so this also governs
// the 'game'/'scratch' cases uniformly).
//
// Download: Blob + temporary <a download> click (client-side, no server round trip). jsdom has
// no native URL.createObjectURL, so callers/tests must stub it (see export.test.js).
import { useState } from 'react';
import { useSelector } from 'react-redux';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

import { mainline } from '../../model/gameTree';
import { exportAnalysisSgf, exportGameSgf } from '../../export/sgf';
import { exportGamePgn } from '../../export/pgn';
import { useGameQuery, useCollectionGameQuery } from '../../app/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Filenames must survive a filesystem: strip path separators/colons (illegal or dangerous on
// most OSes) and collapse whitespace so a title with spaces doesn't produce a quoting hazard.
export function sanitizeFilename(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return 'export';
  const cleaned = s
    .replace(/[\\/:]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '');
  return cleaned || 'export';
}

// `<name-or-players>-<date>.<ext>` per the brief's Interfaces block.
export function exportFilename(nameOrPlayers, dateStr, ext) {
  return `${sanitizeFilename(nameOrPlayers)}-${sanitizeFilename(dateStr)}.${ext}`;
}

export function downloadText(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ExportMenu({ label = 'Export', size } = {}) {
  const activeTab = useSelector((s) => s.docs.tabs.find((t) => t.id === s.docs.activeTabId) || null);
  const isGame = Boolean(activeTab && activeTab.kind === 'game');
  const gid = isGame ? activeTab.gid : undefined;
  // Personal (`w:<wgid>`) tabs live in the collection id space: fetch via the collection
  // endpoint, never the archive /games/<wgid> (which would be a different/absent game).
  const isPersonal = isGame && typeof activeTab.id === 'string' && activeTab.id.startsWith('w:');
  const archiveQuery = useGameQuery(gid, { skip: gid == null || isPersonal });
  const personalQuery = useCollectionGameQuery(gid, { skip: gid == null || !isPersonal });
  const gameQuery = isPersonal ? personalQuery : archiveQuery;
  const [anchorEl, setAnchorEl] = useState(null);

  if (!activeTab) return null;

  const open = (e) => setAnchorEl(e.currentTarget);
  const close = () => setAnchorEl(null);

  // For a 'game' tab the real GameHeader (players/site/event/date/...) only exists server-side;
  // the tab itself carries just title/game. For 'analysis'/'scratch' there's no such header at
  // all, so a minimal {game} stands in — the codecs already default every other field.
  const fetchedHeader = isGame ? gameQuery.data && gameQuery.data.header : null;
  const header = fetchedHeader || { game: activeTab.game };
  const dataReady = !isGame || Boolean(fetchedHeader);
  const filenameBase = activeTab.title || 'export';
  const dateStr = (isGame && fetchedHeader && fetchedHeader.date) || todayIso();

  const runExport = (ext, content) => {
    downloadText(exportFilename(filenameBase, dateStr, ext), content);
    close();
  };

  const handleAnalysisSgf = () =>
    runExport(
      'sgf',
      exportAnalysisSgf({ name: activeTab.title, game: activeTab.game, tree: activeTab.tree })
    );
  const handleGameSgf = () => runExport('sgf', exportGameSgf(header, mainline(activeTab.tree)));
  const handlePgn = () => runExport('pgn', exportGamePgn(header, mainline(activeTab.tree)));

  return (
    <>
      <Button size={size} onClick={open}>
        {label}
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <MenuItem onClick={handleAnalysisSgf}>SGF (analysis tree)</MenuItem>
        <MenuItem onClick={handleGameSgf} disabled={!dataReady}>
          SGF (game)
        </MenuItem>
        <MenuItem onClick={handlePgn} disabled={!dataReady}>
          PGN
        </MenuItem>
      </Menu>
    </>
  );
}
