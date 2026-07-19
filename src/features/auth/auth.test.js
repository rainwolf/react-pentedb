// Auth state + login affordance (Phase 3 Task 1, brief Step 1):
//   - selectAuthName(state) derives string|null straight from the api slice's `ping`
//     query cache — the BINDING selector every later Phase-3 task gates on.
//   - ping resolves auth:null  -> UserMenu renders a login link to
//     /gameServer/login.jsp?return=<current app URL> (same-origin full navigation, so
//     the pente.org session cookie set by login.jsp is shared with this app).
//   - ping resolves auth:'name' -> UserMenu renders the user's name (menu); Log out hits
//     /gameServer/logout then refetches ping.
//
// No module mocking: UserMenu is exercised through its real usePingQuery() hook against
// a real store (api reducer + middleware), with the network stubbed. Network is stubbed
// with vitest's fetch mock, reusing api.test.js's Request shim (fetchBaseQuery builds
// `new Request(baseUrl + url, config)`; under vitest's jsdom the global Request is
// undici's, which throws on the slice's relative '/api/db' baseUrl — resolve relative
// URLs against http://localhost for the test environment only).
import { describe, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { api } from '../../app/api';
import { selectAuthName } from './authSlice';
import UserMenu from './UserMenu';

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

function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const theme = createTheme();
function renderMenu(store) {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <UserMenu />
      </ThemeProvider>
    </Provider>
  );
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

describe('ping — GET /api/db/ping', () => {
  test('GETs /api/db/ping with credentials include and parses {ok, auth}', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, auth: 'alice' }));
    const store = makeStore();
    const res = await store.dispatch(api.endpoints.ping.initiate());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const req = fetchMock.mock.calls[0][0];
    expect(new URL(req.url).pathname).toBe('/api/db/ping');
    expect(req.method).toBe('GET');
    expect(req.credentials).toBe('include');
    expect(res.data).toEqual({ ok: true, auth: 'alice' });
  });
});

describe('selectAuthName', () => {
  test('returns the username once ping resolves with an authed session', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, auth: 'alice' }));
    const store = makeStore();
    await store.dispatch(api.endpoints.ping.initiate());
    expect(selectAuthName(store.getState())).toBe('alice');
  });

  test('returns null when ping resolves anonymous (auth: null)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, auth: null }));
    const store = makeStore();
    await store.dispatch(api.endpoints.ping.initiate());
    expect(selectAuthName(store.getState())).toBeNull();
  });

  test('returns null before the query has resolved', () => {
    const store = makeStore();
    expect(selectAuthName(store.getState())).toBeNull();
  });
});

describe('UserMenu — anonymous', () => {
  test('renders a login link to /gameServer/login.jsp?return=<current app URL>, no logout', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, auth: null }));
    const store = makeStore();
    renderMenu(store);

    const link = await screen.findByRole('link', { name: /log in/i });
    expect(link.getAttribute('href')).toBe(
      `/gameServer/login.jsp?return=${encodeURIComponent(window.location.href)}`
    );
    expect(screen.queryByText(/log out/i)).toBeNull();
  });
});

describe('UserMenu — logged in', () => {
  test('renders the user name; Log out hits /gameServer/logout then refetches ping', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, auth: 'alice' }));
    const store = makeStore();
    renderMenu(store);

    await screen.findByText('alice');
    expect(screen.queryByRole('link', { name: /log in/i })).toBeNull();

    fetchMock.mockReset();
    fetchMock.mockImplementation((input) => {
      if (input === '/gameServer/logout') return Promise.resolve(new Response(null, { status: 200 }));
      return Promise.resolve(jsonResponse({ ok: true, auth: null }));
    });

    fireEvent.click(screen.getByText('alice'));
    fireEvent.click(await screen.findByText(/log out/i));

    await waitFor(() => {
      const logoutCall = fetchMock.mock.calls.find((c) => c[0] === '/gameServer/logout');
      expect(logoutCall).toBeTruthy();
      expect(logoutCall[1]).toMatchObject({ credentials: 'include' });
    });

    // Refetch landed (auth:null) and the UI flips back to the login link.
    await screen.findByRole('link', { name: /log in/i });
  });
});
