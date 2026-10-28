import { useMemo } from 'react';
import { Provider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { BrowserRouter } from 'react-router-dom';
import { store } from './app/store';
import AppRoutes from './app/router';
import ErrorBoundary from './shell/ErrorBoundary';
import { ROUTER_BASENAME } from './shell/basename';
import { ThemeModeProvider, useThemeModeContext, getTheme } from './shell/theme';

function ThemedShell() {
  const [mode] = useThemeModeContext();
  const theme = useMemo(() => getTheme(mode), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter basename={ROUTER_BASENAME || undefined}>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  );
}

function App() {
  return (
    <Provider store={store}>
      <ThemeModeProvider>
        <ThemedShell />
      </ThemeModeProvider>
    </Provider>
  );
}

export default App;
