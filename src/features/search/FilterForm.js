// Filter form for archive search (Phase 1 /api/db/games/search `filters` DTO).
//
// Player-name autocomplete debounces locally (300ms, 2-char minimum) before calling
// usePlayersQuery — the api slice deliberately has no debounce of its own.
import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';

import { usePlayersQuery } from '../../app/api';
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

function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function PlayerField({ label, value, onChange }) {
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
      onChange={(e, val) => onChange(val || '')}
      renderInput={(params) => <TextField {...params} label={label} margin="dense" fullWidth />}
    />
  );
}

export default function FilterForm({ initialGame = 1, onSubmit }) {
  const [draft, setDraft] = useState({ ...DEFAULT_DRAFT, game: initialGame });
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const { variants, sites, events } = useVenueOptions(draft.game, draft.site);

  const submit = () => onSubmit({ game: draft.game, filters: buildFilters(draft) });
  const clear = () => {
    const cleared = { ...DEFAULT_DRAFT, game: draft.game };
    setDraft(cleared);
    onSubmit({ game: cleared.game, filters: null });
  };

  const variantOptions = variants.length ? variants : [{ game: draft.game, name: `Game ${draft.game}` }];

  return (
    <Box
      component="form"
      sx={{ px: 1, py: 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
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
          onChange={(e) => update({ game: Number(e.target.value), site: '', event: '' })}
        >
          {variantOptions.map((v) => (
            <MenuItem key={v.game} value={v.game}>
              {v.name}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 2 }}>
            <PlayerField label="Player 1" value={draft.player1Name} onChange={(v) => update({ player1Name: v })} />
          </Box>
          <TextField
            select
            size="small"
            margin="dense"
            label="Player 1 seat"
            sx={{ flex: 1 }}
            disabled={!draft.player1Name}
            value={draft.player1Seat}
            onChange={(e) => update({ player1Seat: Number(e.target.value) })}
          >
            <MenuItem value={0}>Any seat</MenuItem>
            <MenuItem value={1}>Seat 1</MenuItem>
            <MenuItem value={2}>Seat 2</MenuItem>
          </TextField>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 2 }}>
            <PlayerField label="Player 2" value={draft.player2Name} onChange={(v) => update({ player2Name: v })} />
          </Box>
          <TextField
            select
            size="small"
            margin="dense"
            label="Player 2 seat"
            sx={{ flex: 1 }}
            disabled={!draft.player2Name}
            value={draft.player2Seat}
            onChange={(e) => update({ player2Seat: Number(e.target.value) })}
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
          onChange={(e) => update({ site: e.target.value, event: '' })}
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
          onChange={(e) => update({ event: e.target.value })}
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
          />
          <TextField
            size="small"
            margin="dense"
            fullWidth
            label="Section"
            value={draft.section}
            onChange={(e) => update({ section: e.target.value })}
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
          />
        </Stack>

        <TextField
          select
          size="small"
          margin="dense"
          fullWidth
          label="Winner"
          value={draft.winner}
          onChange={(e) => update({ winner: Number(e.target.value) })}
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
            Clear
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
