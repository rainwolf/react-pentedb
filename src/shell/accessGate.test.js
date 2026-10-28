// Subscriber-only gate: AccessGate renders the app only when ping reports dbAccess:true.
// Real store + real ping endpoint (fetch stubbed); Workbench is stubbed so we can assert it
// (and therefore every data query it would fire) is NOT mounted in gated states.
import { describe, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { api } from '../app/api';
import { subscriptionGuard } from '../app/subscriptionGuard';
import { selectDbAccess } from '../features/auth/authSlice';
import { hasDbAccess } from '../features/auth/access';
import { ThemeModeProvider } from './theme';
import AppRoutes from '../app/router';

vi.mock('./Workbench', () => ({ default: () => <div data-testid="app-stub" /> }));

let RealRequest;
beforeAll(() => {
  RealRequest = globalThis.Request;
  globalThis.Request = class extends RealRequest {
    constructor(input, init) {
      if (typeof input === 'string' && input.startsWith('/')) input = 'http://localhost' + input;
      super(input, init);
    }
  };
});
afterAll(() => {
  globalThis.Request = RealRequest;
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (gDM) => gDM().concat(api.middleware, subscriptionGuard),
  });
}

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(store) {
  return render(
    <Provider store={store}>
      <ThemeModeProvider>
        <ThemeProvider theme={createTheme()}>
          <MemoryRouter initialEntries={['/']}>
            <AppRoutes />
          </MemoryRouter>
        </ThemeProvider>
      </ThemeModeProvider>
    </Provider>
  );
}

const urls = () => fetchMock.mock.calls.map((c) => new URL(c[0].url).pathname);

describe('hasDbAccess', () => {
  test('only a literal true grants access (fail closed)', () => {
    expect(hasDbAccess({ ok: true, auth: 'a', dbAccess: true })).toBe(true);
    expect(hasDbAccess({ ok: true, auth: 'a', dbAccess: false })).toBe(false);
    expect(hasDbAccess({ ok: true, auth: 'a' })).toBe(false);
    expect(hasDbAccess({ dbAccess: 'true' })).toBe(false);
    expect(hasDbAccess(undefined)).toBe(false);
  });
});

describe('AccessGate', () => {
  test('loading: spinner, no app', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderApp(makeStore());
    expect(await screen.findByRole('status', { name: /checking access/i })).toBeTruthy();
    expect(screen.queryByTestId('app-stub')).toBeNull();
  });

  test('anonymous: gate card with Log in link, TopBar kept, no app, only ping fetched', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true, auth: null, dbAccess: false }));
    renderApp(makeStore());
    expect(await screen.findByText(/available to subscribers/i)).toBeTruthy();
    const links = screen.getAllByRole('link', { name: /log in/i });
    expect(links.some((a) => a.getAttribute('href') === `/gameServer/login.jsp?return=${encodeURIComponent(window.location.href)}`)).toBe(true);
    expect(screen.getByText('pentedb')).toBeTruthy();
    expect(screen.queryByTestId('app-stub')).toBeNull();
    expect(new Set(urls())).toEqual(new Set(['/api/db/ping']));
  });

  test('logged in without access: subscriptions link + rule note, user menu, no app', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true, auth: 'alice', dbAccess: false }));
    renderApp(makeStore());
    expect(await screen.findByText(/first 2 months/i)).toBeTruthy();
    const subs = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/gameServer/subscriptions');
    expect(subs.length).toBeGreaterThan(0);
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.queryByTestId('app-stub')).toBeNull();
  });

  test('access: renders the app', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true, auth: 'alice', dbAccess: true }));
    renderApp(makeStore());
    expect(await screen.findByTestId('app-stub')).toBeTruthy();
    expect(screen.queryByTestId('access-gate')).toBeNull();
  });

  test('missing dbAccess field is treated as no access', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true, auth: 'alice' }));
    renderApp(makeStore());
    expect(await screen.findByTestId('access-gate')).toBeTruthy();
    expect(screen.queryByTestId('app-stub')).toBeNull();
  });

  test('ping error: fails closed with Retry', async () => {
    fetchMock.mockImplementation(async () => json({ error: { code: 'x', message: 'x' } }, 500));
    renderApp(makeStore());
    expect(await screen.findByRole('button', { name: /retry/i })).toBeTruthy();
    expect(screen.queryByTestId('app-stub')).toBeNull();
  });

  test('selectDbAccess reflects the ping cache', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true, auth: 'a', dbAccess: true }));
    const store = makeStore();
    expect(selectDbAccess(store.getState())).toBe(false);
    await store.dispatch(api.endpoints.ping.initiate());
    expect(selectDbAccess(store.getState())).toBe(true);
  });
});

describe('subscriptionGuard', () => {
  test('403 subscription_required from another endpoint refetches ping and the gate shows', async () => {
    let access = true;
    fetchMock.mockImplementation(async (req) => {
      const p = new URL(req.url).pathname;
      if (p === '/api/db/ping') return json({ ok: true, auth: 'alice', dbAccess: access });
      return json({ error: { code: 'subscription_required', message: 'no' } }, 403);
    });
    const store = makeStore();
    renderApp(store);
    expect(await screen.findByTestId('app-stub')).toBeTruthy();
    access = false; // subscription expires mid-session
    await store.dispatch(api.endpoints.venues.initiate());
    await waitFor(() => expect(screen.getByTestId('access-gate')).toBeTruthy());
    expect(screen.queryByTestId('app-stub')).toBeNull();
    // >= 2: with keepUnusedDataFor 0 (no client cache) the gate remount also re-fetches ping.
    expect(urls().filter((u) => u === '/api/db/ping').length).toBeGreaterThanOrEqual(2);
  });

  test('other 403 codes / 401 do not refetch ping', async () => {
    fetchMock.mockImplementation(async (req) => {
      const p = new URL(req.url).pathname;
      if (p === '/api/db/ping') return json({ ok: true, auth: 'a', dbAccess: true });
      return json({ error: { code: 'unauthorized', message: 'no' } }, 401);
    });
    const store = makeStore();
    await store.dispatch(api.endpoints.ping.initiate());
    await store.dispatch(api.endpoints.venues.initiate());
    expect(urls().filter((u) => u === '/api/db/ping').length).toBe(1);
  });
});
