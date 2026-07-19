// Scope selector (P3 Task 6): Archive / Mine / Both. Feeds `scope` into position-stats and
// games-search via the ui slice, so the ExplorerPanel's stats and the SearchPanel's results
// move together. Visible only when logged in — the mine/both corpora are the signed-in user's
// personal collection, and asking for them anonymously would 401. Auth is read via usePingQuery
// (UserMenu's precedent) so it shares the single ping cache.
import { useDispatch, useSelector } from 'react-redux';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { usePingQuery } from '../../app/api';
import { selectScope, setScope } from '../../app/uiSlice';

export default function ScopeToggle({ size = 'small' }) {
  const dispatch = useDispatch();
  const { data: ping } = usePingQuery();
  const authName = ping?.auth ?? null;
  const scope = useSelector(selectScope);

  if (!authName) return null;

  return (
    <ToggleButtonGroup
      value={scope}
      exclusive
      size={size}
      aria-label="Search scope"
      onChange={(e, v) => v && dispatch(setScope(v))}
    >
      <ToggleButton value="archive" aria-label="Archive">
        Archive
      </ToggleButton>
      <ToggleButton value="mine" aria-label="Mine">
        Mine
      </ToggleButton>
      <ToggleButton value="both" aria-label="Both">
        Both
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
