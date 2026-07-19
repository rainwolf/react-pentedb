// Analysis-persistence dialogs (P3 Task 3). Three presentational MUI dialogs, all driven
// by state the Workbench owns (via useAnalysisSave / recovery):
//   - SaveDialog        : name the analysis before a save; variant is shown read-only
//                         (a saved analysis keeps the variant it was created in).
//   - LoginPromptDialog : anonymous Save — the work is already preserved to localStorage,
//                         this just nudges the user to sign in.
//   - RecoveryDialog    : offer to restore unsaved work snapshotted on a previous visit.
import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';

import { variantKey } from '../../board/boardGeometry';

// Where pente.org's session-cookie login page sends the browser back to (same-origin so
// the cookie it sets is shared with this app). Mirrors UserMenu's loginUrl.
function loginUrl() {
  const ret = typeof window !== 'undefined' ? window.location.href : '';
  return `/gameServer/login.jsp?return=${encodeURIComponent(ret)}`;
}

export default function SaveDialog({ open, name, variant, saving, error, onCancel, onSave }) {
  const [value, setValue] = useState(name || '');
  const wasOpen = useRef(false);
  // Reseed the field from the incoming name each time the dialog (re)opens, not on every
  // keystroke-driven `name` change of the underlying tab.
  useEffect(() => {
    if (open && !wasOpen.current) setValue(name || '');
    wasOpen.current = open;
  }, [open, name]);

  const trimmed = value.trim();

  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby="save-analysis-title">
      <DialogTitle id="save-analysis-title">Save analysis</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Name"
          fullWidth
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed && !saving) onSave(trimmed);
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Variant: <strong>{variant}</strong>
        </Typography>
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            Could not save — please try again.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(trimmed)} disabled={!trimmed || saving} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function LoginPromptDialog({ open, onCancel }) {
  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby="login-prompt-title">
      <DialogTitle id="login-prompt-title">Log in to save</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          You need to be logged in to save analyses. Your current work has been kept and
          will be waiting when you come back.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Not now</Button>
        <Button href={loginUrl()} variant="contained">
          Log in
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RecoveryDialog({ open, entries, onRestore, onDismiss }) {
  const list = entries || [];
  return (
    <Dialog open={open} onClose={onDismiss} aria-labelledby="recovery-title">
      <DialogTitle id="recovery-title">Restore unsaved work?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {list.length === 1 ? 'An unsaved analysis' : `${list.length} unsaved analyses`} from
          your last visit can be restored.
        </Typography>
        <List dense>
          {list.map((e) => (
            <ListItem key={e.id} disableGutters>
              <ListItemText primary={e.name || '(untitled)'} secondary={variantKey(e.game)} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDismiss}>Discard</Button>
        <Button onClick={onRestore} variant="contained">
          Restore
        </Button>
      </DialogActions>
    </Dialog>
  );
}
