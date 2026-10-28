// Filter form for the ONE shared filter set (Phase 1 `filters` DTO, sent by BOTH position-stats and
// games/search). The form edits a local DRAFT and APPLIES it to the ui slice: selects (site, event,
// either-seat, winner, variant) apply at once; text fields (players, round, section, dates) apply on
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
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

import { usePlayersQuery } from '../../app/api';
import { selectFilters, setFilters, clearFilters } from '../../app/uiSlice';
import useVenueOptions from './useVenueOptions';

export const DEFAULT_DRAFT = {
  game: 1,
  player1Name: '',
  player2Name: '',
  eitherSeat: false,
  player1RatingAbove: 0,
  player2RatingAbove: 0,
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
  // "Either seat" ticked = both seats 0 (any seat); unticked = Player 1 is seat 1, Player 2 is seat 2.
  // Seats only mean something with a player name (the backend ignores them otherwise), so with no
  // name set they stay 1/2 and an otherwise-empty form still serializes to null.
  // Rating-above filters (0 = off) are omitted from the wire object; they also make seats meaningful.
  const p1Rating = Number(draft.player1RatingAbove) > 0 ? Number(draft.player1RatingAbove) : 0;
  const p2Rating = Number(draft.player2RatingAbove) > 0 ? Number(draft.player2RatingAbove) : 0;
  const anySeat =
    !!draft.eitherSeat && (player1Name != null || player2Name != null || p1Rating > 0 || p2Rating > 0);
  const player1Seat = anySeat ? 0 : 1;
  const player2Seat = anySeat ? 0 : 2;
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
    p1Rating === 0 &&
    p2Rating === 0 &&
    winner === 0;
  if (isDefault) return null;

  const out = {
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
  if (p1Rating > 0) out.player1RatingAbove = p1Rating;
  if (p2Rating > 0) out.player2RatingAbove = p2Rating;
  return out;
}

// Inverse of buildFilters: applied DTO (or null) -> form draft for `game`.
export function draftFromFilters(filters, game) {
  const f = filters || {};
  return {
    ...DEFAULT_DRAFT,
    game,
    player1Name: f.player1Name ?? '',
    player2Name: f.player2Name ?? '',
    eitherSeat: f.player1Seat === 0 && f.player2Seat === 0,
    player1RatingAbove: f.player1RatingAbove > 0 ? f.player1RatingAbove : 0,
    player2RatingAbove: f.player2RatingAbove > 0 ? f.player2RatingAbove : 0,
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

export const RATING_OPTIONS = [0, ...Array.from({ length: 14 }, (_, i) => 1600 + i * 100)];

function PlayerField({ label, value, onChange, onPick, onCommit, rating, onRating }) {
  const debounced = useDebounced(value, 300).trim();
  const skip = debounced.length < 2;
  const { data } = usePlayersQuery(debounced, { skip });
  const options = (!skip && data && data.players) || [];

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
    <Autocomplete
      sx={{ flex: 1, minWidth: 0 }}
      freeSolo
      disablePortal
      size="small"
      options={options}
      inputValue={value}
      value={value || null}
      onInputChange={(_e, val) => onChange(val)}
      onChange={(_e, val) => onPick(val || '')}
      renderInput={(params) => (
        <TextField {...params} label={label} margin="dense" fullWidth onBlur={onCommit} />
      )}
    />
    <TextField
      select
      size="small"
      margin="dense"
      label="Rating"
      value={rating}
      onChange={(e) => onRating(Number(e.target.value))}
      sx={{ width: 108, flexShrink: 0 }}
      SelectProps={{
        SelectDisplayProps: { 'aria-label': `${label} rating` },
        MenuProps: { disablePortal: false },
        renderValue: (v) => (Number(v) === 0 ? 'Any' : `${v}+`),
      }}
    >
      {RATING_OPTIONS.map((r) => (
        <MenuItem key={r} value={r}>
          {r === 0 ? 'Any' : `${r}+`}
        </MenuItem>
      ))}
    </TextField>
    </Stack>
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

        <PlayerField
          label="Player 1"
          value={draft.player1Name}
          onChange={(v) => update({ player1Name: v })}
          onPick={(v) => commit({ player1Name: v })}
          rating={draft.player1RatingAbove}
          onRating={(r) => commit({ player1RatingAbove: r })}
          onCommit={commitDraft}
        />
        <PlayerField
          label="Player 2"
          value={draft.player2Name}
          onChange={(v) => update({ player2Name: v })}
          onPick={(v) => commit({ player2Name: v })}
          rating={draft.player2RatingAbove}
          onRating={(r) => commit({ player2RatingAbove: r })}
          onCommit={commitDraft}
        />
        <FormControlLabel
          sx={{ mx: 0 }}
          control={
            <Checkbox
              size="small"
              checked={draft.eitherSeat}
              onChange={(e) => commit({ eitherSeat: e.target.checked })}
              inputProps={{ 'aria-description': 'Match players in either seat' }}
            />
          }
          label="Either seat"
        />

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
