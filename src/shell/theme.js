// Light/dark MUI theming with the mode persisted to localStorage (spec §9). Breakpoints
// are widened to match the workbench's own 768/1200 collapse points (responsive.js) so
// any MUI-native responsive helpers added later (useMediaQuery, Hidden, etc.) agree with
// useBreakpoint() rather than defining a second, conflicting set of thresholds.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createTheme } from '@mui/material/styles';

export const THEME_STORAGE_KEY = 'pentedb.themeMode';

function systemPrefersDark() {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

function readStoredMode() {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function writeStoredMode(mode) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore write failures (private browsing / storage disabled) — the mode still
    // works for the current session, it just won't persist.
  }
}

export function getTheme(mode) {
  return createTheme({
    palette: { mode },
    breakpoints: { values: { xs: 0, sm: 600, md: 768, lg: 1200, xl: 1536 } },
  });
}

// Raw hook (mode + toggle), independent of context — exported so persistence behavior
// is directly unit-testable without rendering a provider tree.
export function useThemeMode() {
  const [mode, setMode] = useState(() => readStoredMode() || (systemPrefersDark() ? 'dark' : 'light'));

  const toggle = useCallback(() => {
    setMode((m) => {
      const next = m === 'light' ? 'dark' : 'light';
      writeStoredMode(next);
      return next;
    });
  }, []);

  return [mode, toggle];
}

const ThemeModeContext = createContext(null);

export function ThemeModeProvider({ children }) {
  const [mode, toggle] = useThemeMode();
  const value = useMemo(() => [mode, toggle], [mode, toggle]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeModeContext() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error('useThemeModeContext must be used within a ThemeModeProvider');
  }
  return ctx;
}
