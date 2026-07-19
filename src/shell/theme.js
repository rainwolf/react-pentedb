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

// Design tokens per mode (Phase 4 premium pass — see docs/design-notes.md). Identity:
// a wood-and-stone analysis workbench. The board is the hero; chrome stays quiet with ONE
// confident accent — a deep teal, deliberately clear of every board overlay hue (heat
// blue/umber/vermillion, the AI ghost's violet, the threat bands' blue/orange, last-move
// red) so an accented control never reads as a board mark.
const TOKENS = {
  light: {
    primary: '#0F6E63', primaryLight: '#43978B', primaryDark: '#0A5249', onPrimary: '#FFFFFF',
    secondary: '#5A6472', bgDefault: '#EFECE4', bgPaper: '#FBFAF6',
    textPrimary: '#23201C', textSecondary: '#6C665C', divider: 'rgba(43,35,27,0.14)',
    coordInk: '#6B5F52', scrollThumb: 'rgba(43,35,27,0.28)',
    error: '#C0392B', warning: '#B7791F', info: '#2A6F97', success: '#2E7D57',
  },
  dark: {
    primary: '#4FB3A5', primaryLight: '#7BCDC1', primaryDark: '#2E8578', onPrimary: '#0A0F0E',
    secondary: '#8992A2', bgDefault: '#14120F', bgPaper: '#1E1B17',
    textPrimary: '#ECE7DE', textSecondary: '#A79F93', divider: 'rgba(236,231,222,0.12)',
    coordInk: '#B9AD9C', scrollThumb: 'rgba(236,231,222,0.22)',
    error: '#E5715F', warning: '#D9A441', info: '#6FB2D6', success: '#5FB98C',
  },
};

export function getTheme(mode) {
  const t = TOKENS[mode] || TOKENS.light;
  return createTheme({
    // Breakpoints stay pinned to the workbench's own 768/1200 collapse points (responsive.js).
    breakpoints: { values: { xs: 0, sm: 600, md: 768, lg: 1200, xl: 1536 } },
    shape: { borderRadius: 10 },
    // Snappier chrome: interaction transitions land ≤150 ms (the board place/capture budget).
    transitions: { duration: { shortest: 120, shorter: 150 } },
    palette: {
      mode,
      primary: { main: t.primary, light: t.primaryLight, dark: t.primaryDark, contrastText: t.onPrimary },
      secondary: { main: t.secondary },
      background: { default: t.bgDefault, paper: t.bgPaper },
      text: { primary: t.textPrimary, secondary: t.textSecondary },
      divider: t.divider,
      error: { main: t.error }, warning: { main: t.warning }, info: { main: t.info }, success: { main: t.success },
    },
    typography: {
      fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
      // A deliberate scale: tight, weighty display sizes; readable body; a spaced overline for
      // section eyebrows. Weights and letter-spacing carry the workbench's crisp, technical tone.
      h1: { fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.02em' },
      h2: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.16, letterSpacing: '-0.015em' },
      h3: { fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' },
      h4: { fontSize: '1.3rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.005em' },
      h5: { fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.3 },
      h6: { fontSize: '1rem', fontWeight: 700, lineHeight: 1.35, letterSpacing: '0.01em' },
      subtitle1: { fontWeight: 600, letterSpacing: '0.005em' },
      subtitle2: { fontWeight: 600, letterSpacing: '0.01em' },
      body1: { lineHeight: 1.55 },
      body2: { lineHeight: 1.5 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
      caption: { letterSpacing: '0.01em' },
      overline: { fontWeight: 700, letterSpacing: '0.09em', fontSize: '0.6875rem' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Theme-aware ink for the board coordinate ruler (consumed by board.css).
          ':root': { '--board-coord-ink': t.coordInk },
          // Tabular figures everywhere: win%, counts, coordinates align cleanly, no jitter.
          body: { fontVariantNumeric: 'tabular-nums', WebkitFontSmoothing: 'antialiased' },
          // Accessibility floor: a consistent, visible keyboard-focus ring on every focusable.
          '*:focus-visible': { outline: `2px solid ${t.primary}`, outlineOffset: '2px', borderRadius: '3px' },
          // Honour prefers-reduced-motion for ALL CSS animation/transition (board shake, stone
          // place, hover, chrome). (SMIL <animate> on the AI-ghost ring is browser-frozen in a
          // screenshot and is documented as the one exception in design-notes.md.)
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
          // Quieter, self-colouring scrollbars.
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: t.scrollThumb, borderRadius: 8,
            border: '2px solid transparent', backgroundClip: 'content-box',
          },
        },
      },
      // Header: flat, with a crisp hairline instead of a drop shadow.
      MuiAppBar: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none', borderBottom: `1px solid ${t.divider}` } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: '0.75rem', fontWeight: 500 } } },
      MuiSkeleton: { styleOverrides: { root: { borderRadius: 6 } } },
    },
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
