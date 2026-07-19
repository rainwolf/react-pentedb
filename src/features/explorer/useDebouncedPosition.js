// useDebouncedPosition — the active document position (game + CANONICAL move line),
// debounced so a burst of cursor moves (holding →, keyboard scrubbing, wheel spins)
// collapses into a SINGLE settled value. The explorer keys its position-stats query off
// the returned object, so rapid navigation fires at most one network request per pause.
//
// The moves are the canonical (stored) line straight from selectActivePosition — never the
// viewer's rotated display moves. Position-stats is a canonical-coordinate query; the
// board's view rotation is applied only when RENDERING candidate cells (see HeatOverlay).
//
// Debounce shape: the first committed position is adopted immediately (no 150ms blank on
// open); every subsequent change to the position key restarts the timer, so only the last
// value in a burst survives.
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { selectActivePosition } from '../../model/docSlice';

// A stable identity for a position (avoids churning on selectActivePosition's fresh object).
export function positionKey(pos) {
  return pos ? `${pos.game}:${pos.moves.join('-')}` : '';
}

export default function useDebouncedPosition(delay = 150) {
  const pos = useSelector(selectActivePosition);
  const key = positionKey(pos);

  // Latest value, read inside the timer so the settle always commits the freshest position.
  const posRef = useRef(pos);
  posRef.current = pos;

  const [debounced, setDebounced] = useState(pos);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(posRef.current), delay);
    return () => clearTimeout(t);
  }, [key, delay]);

  return debounced;
}
