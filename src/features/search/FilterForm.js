// Filter form for the ONE shared filter set (Phase 1 `filters` DTO, sent by BOTH position-stats and
// games/search). The form edits a local DRAFT and APPLIES it to the ui slice: selects (site, event,
// seats, winner, variant) apply at once; text fields (players, round, section, dates) apply on
// Enter / blur / autocomplete pick; "Search" is an explicit apply; "Clear filters" resets both.
// The draft re-syncs from the store when the applied filters change elsewhere (chip clear-all).
//
// Player-name autocomplete debounces locally (300ms, 2-char minimum) before calling
// usePlayersQuery — the api slice deliberately has no debounce of its own.
import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';

import { usePlayersQuery } from '../../app/api';
import { selectFilters, setFilters, clearFilters } from '../../app/uiSlice';
import useVenueOptions from './useVenueOptions';

export const DEFAULT_DRAFT = {
  game: 1,
  player1Name: '',
  player1Seat: 1,
  player2Name: '',
  player2Seat: 2,
  site: '',
  event: '',
  round: '',
  section: '',
  afterDate: '',
  beforeDate: '',
  winner: 0,
};

function norm(s) {
  const t = (s || '').trim();
  return t === '' ? null : t;
}

// Pure: draft (form state) -> the exact wire `filters` object, or `null` when every field
// is still at its documented default ("no filters"). String fields are ALWAYS PRESENT keys
// that are null when unset (never omitted, never ''); player1Seat/player2Seat/winner are
// always-present ints (default 1 / 2 / 0) — Gson can't deserialize null into a Java
// primitive int, per PositionStatsRequest.Filters' field initializers (webdb-api branch).
export function buildFilters(draft) {
  const player1Name = norm(draft.player1Name);
  const player2Name = norm(draft.player2Name);
  const site = norm(draft.site);
  const event = norm(draft.event);
  const round = norm(draft.round);
  const section = norm(draft.section);
  const afterDate = norm(draft.afterDate);
  const beforeDate = norm(draft.beforeDate);
  const player1Seat = draft.player1Seat == null ? 1 : draft.player1Seat;
  const player2Seat = draft.player2Seat == null ? 2 : draft.player2Seat;
  const winner = draft.winner == null ? 0 : draft.winner;

  const isDefault =
    player1Name == null &&
    player2Name == null &&
    site == null &&
    event == null &&
    round == null &&
    section == null &&
    afterDate == null &&
    beforeDate == null &&
    player1Seat === 1 &&
    player2Seat === 2 &&
    winner === 0;
  if (isDefault) return null;

  return {
    player1Name,
    player1Seat,
    player2Name,
    player2Seat,
    site,
    event,
    round,
    section,
    afterDate,
    beforeDate,
    winner,
  };
}

// Inverse of buildFilters: applied DTO (or null) -> form draft for `game`.
export function draftFromFilters(filters, game) {
  const f = filters || {};
  return {
    ...DEFAULT_DRAFT,
    game,
    player1Name: f.player1Name ?? '',
    player1Seat: f.player1Seat ?? DEFAULT_DRAFT.player1Seat,
    player2Name: f.player2Name ?? '',
    player2Seat: f.player2Seat ?? DEFAULT_DRAFT.player2Seat,
    site: f.site ?? '',
    event: f.event ?? '',
    round: f.round ?? '',
    section: f.section ?? '',
    afterDate: f.afterDate ?? '',
    beforeDate: f.beforeDate ?? '',
    winner: f.winner ?? 0,
  };
}

function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function PlayerField({ label, value, onChange, onPick, onCommit }) {
  const debounced = useDebounced(value, 300).trim();
  const skip = debounced.length < 2;
  const { data } = usePlayersQuery(debounced, { skip });
  const options = (!skip && data && data.players) || [];

  return (
    <Autocomplete
      freeSolo
      disablePortal
      size="small"
      options={options}
      inputValue={value}
      value={value || null}
      onInputChange={(e, val) => onChange(val)}
      onChange={(e, val) => onPick(val || '')}
      renderInput={(params) => (
        <TextField {...params} label={label} margin="dense" fullWidth onBlur={onCommit} />
      )}
    />
  );
}

export default function FilterForm({ initialGame = 1, syncGame, onVariantChange }) {
  const dispatch = useDispatch();
  const applied = useSelector(selectFilters);
  const [draft, setDraft] = useState(() => draftFromFilters(applied, initialGame));
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  // Apply `next` (a full draft) to the store and keep the local draft in step.
  const applyDraft = (next) => {
    setDraft(next);
    dispatch(setFilters(buildFilters(next)));
  };
  // Apply the current draft plus a patch (selects, autocomplete picks).
  const commit = (patch) => applyDraft({ ...draft, ...patch });
  // Apply the draft as it stands (blur / Enter on text fields).
  const commitDraft = () => applyDraft(draft);
  const onEnter = (e) => {
    if (e.key === 'Enter') commitDraft();
  };

  // Follow the active tab's game (tab switch, route load). site/event are per-variant names, so
  // they reset - and the APPLIED filters follow (a stale site would silently filter the new
  // variant). No onVariantChange (the workbench is already there - no loop).
  useEffect(() => {
    if (syncGame == null || draft.game === syncGame) return;
    applyDraft({ ...draft, game: syncGame, site: '', event: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncGame]);

  // The applied filters changed from outside this form (chips' clear-all): pull the draft to match.
  const appliedKey = JSON.stringify(applied ?? null);
  useEffect(() => {
    setDraft((d) => (JSON.stringify(buildFilters(d)) === appliedKey ? d : draftFromFilters(applied, d.game)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

  const { variants, sites, events } = useVenueOptions(draft.game, draft.site);

  const clear = () => {
    setDraft(draftFromFilters(null, draft.game));
    dispatch(clearFilters());
  };

  const variantOptions = variants.some((v) => v.game === draft.game)
    ? variants
    : [...variants, { game: draft.game, name: `Game ${draft.game}` }];

  return (
    <Box
      component="form"
      sx={{ px: 1, py: 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        commitDraft();
      }}
    >
      <Stack spacing={0.5}>
        <TextField
          select
          size="small"
          margin="dense"
          fullWidth
          label="Variant"
          value={draft.game}
          onChange={(e) => {
            const game = Number(e.target.value);
            commit({ game, site: '', event: '' });
            if (onVariantChange) onVariantChange(game); // workbench follows the variant at once
          }}
        >
          {variantOptions.map((v) => (
            <MenuItem key={v.game} value={v.game}>
              {v.name}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 2 }}>
            <PlayerField
              label="Player 1"
              value={draft.player1Name}
              onChange={(v) => update({ player1Name: v })}
              onPick={(v) => commit({ player1Name: v })}
              onCommit={commitDraft}
            />
          </Box>
          <TextField
            select
            size="small"
            margin="dense"
            label="Player 1 seat"
            sx={{ flex: 1 }}
            disabled={!draft.player1Name}
            helperText={!draft.player1Name ? 'Enter a player name first' : undefined}
            value={draft.player1Seat}
            onChange={(e) => commit({ player1Seat: Number(e.target.value) })}
          >
            <MenuItem value={0}>Any seat</MenuItem>
            <MenuItem value={1}>Seat 1</MenuItem>
            <MenuItem value={2}>Seat 2</MenuItem>
          </TextField>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 2 }}>
            <PlayerField
              label="Player 2"
              value={draft.player2Name}
              onChange={(v) => update({ player2Name: v })}
              onPick={(v) => commit({ player2Name: v })}
              onCommit={commitDraft}
            />
          </Box>
          <TextField
            select
            size="small"
            margin="dense"
            label="Player 2 seat"
            sx={{ flex: 1 }}
            disabled={!draft.player2Name}
            helperText={!draft.player2Name ? 'Enter a player name first' : undefined}
            value={draft.player2Seat}
            onChange={(e) => commit({ player2Seat: Number(e.target.value) })}
          >
            <MenuItem value={0}>Any seat</MenuItem>
            <MenuItem value={1}>Seat 1</MenuItem>
            <MenuItem value={2}>Seat 2</MenuItem>
          </TextField>
        </Stack>

        <TextField
          select
          size="small"
          margin="dense"
          fullWidth
          label="Site"
          value={draft.site}
          onChange={(e) => commit({ site: e.target.value, event: '' })}
        >
          <MenuItem value="">Any site</MenuItem>
          {sites.map((s) => (
            <MenuItem key={s.id} value={s.name}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          margin="dense"
          fullWidth
          label="Event"
          disabled={!draft.site}
          value={draft.event}
          onChange={(e) => commit({ event: e.target.value })}
        >
          <MenuItem value="">Any event</MenuItem>
          {events.map((ev) => (
            <MenuItem key={ev.id} value={ev.name}>
              {ev.name}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            margin="dense"
            fullWidth
            label="Round"
            value={draft.round}
            onChange={(e) => update({ round: e.target.value })}
            onBlur={commitDraft}
            onKeyDown={onEnter}
          />
          <TextField
            size="small"
            margin="dense"
            fullWidth
            label="Section"
            value={draft.section}
            onChange={(e) => update({ section: e.target.value })}
            onBlur={commitDraft}
            onKeyDown={onEnter}
          />
        </Stack>

        <Stack direction="row" spacing={1}>
          <TextField
            type="date"
            size="small"
            margin="dense"
            fullWidth
            label="After date"
            InputLabelProps={{ shrink: true }}
            value={draft.afterDate}
            onChange={(e) => update({ afterDate: e.target.value })}
            onBlur={commitDraft}
            onKeyDown={onEnter}
          />
          <TextField
            type="date"
            size="small"
            margin="dense"
            fullWidth
            label="Before date"
            InputLabelProps={{ shrink: true }}
            value={draft.beforeDate}
            onChange={(e) => update({ beforeDate: e.target.value })}
            onBlur={commitDraft}
            onKeyDown={onEnter}
          />
        </Stack>

        <TextField
          select
          size="small"
          margin="dense"
          fullWidth
          label="Winner"
          value={draft.winner}
          onChange={(e) => commit({ winner: Number(e.target.value) })}
        >
          <MenuItem value={0}>Any</MenuItem>
          <MenuItem value={1}>Player 1</MenuItem>
          <MenuItem value={2}>Player 2</MenuItem>
        </TextField>

        <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
          <Button type="submit" variant="contained" size="small">
            Search
          </Button>
          <Button type="button" size="small" onClick={clear}>
            Clear filters
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
