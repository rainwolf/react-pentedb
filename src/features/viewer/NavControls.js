// Transport controls under the board: first / prev / next / last, plus sibling-variation
// up/down. Thin dispatchers over docSlice nav actions (Task 3 names verbatim). The aria-labels
// are load-bearing — the Workbench URL-sync tests click "Previous move" — so keep them stable.
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import {
  navFirst,
  navPrev,
  navNext,
  navLast,
  navSiblingUp,
  navSiblingDown,
} from '../../model/docSlice';

export default function NavControls() {
  const dispatch = useDispatch();
  const hasActive = useSelector(
    (s) => s.docs.activeTabId != null && s.docs.tabs.some((t) => t.id === s.docs.activeTabId)
  );
  const disabled = !hasActive;

  const btn = (label, Icon, action) => (
    <IconButton size="small" title={label} aria-label={label} disabled={disabled} onClick={() => dispatch(action())}>
      <Icon fontSize="small" />
    </IconButton>
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, px: 1, py: 0.5 }}>
      {btn('First move', FirstPageIcon, navFirst)}
      {btn('Previous move', ArrowBackIcon, navPrev)}
      {btn('Next move', ArrowForwardIcon, navNext)}
      {btn('Last move', LastPageIcon, navLast)}
      {btn('Variation up', KeyboardArrowUpIcon, navSiblingUp)}
      {btn('Variation down', KeyboardArrowDownIcon, navSiblingDown)}
    </Box>
  );
}
