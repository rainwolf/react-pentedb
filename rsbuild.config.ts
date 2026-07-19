import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// PUBLIC_ is added alongside REACT_APP_ (rsbuild's own default prefix set) so that
// PUBLIC_LOCAL_BACKEND is picked up by loadEnv and injected into client code as
// `import.meta.env.PUBLIC_LOCAL_BACKEND` — explicitly requesting a prefix list here
// replaces rsbuild's implicit ['PUBLIC_'] default, so it must be listed by hand.
// (Mirrors react_live_game_room/rsbuild.config.ts.)
const { publicVars, rawPublicVars } = loadEnv({ prefixes: ['REACT_APP_', 'PUBLIC_'] });

// Production-first backend: dev builds default to the PRODUCTION backend (matches the
// deployed behavior). Set PUBLIC_LOCAL_BACKEND=1 in an env file rsbuild loads (e.g.
// .env.local, see .env.example) to opt into the local backend instead.
const LOCAL_BACKEND = process.env.PUBLIC_LOCAL_BACKEND === '1';

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: './public/index.html',
  },
  source: {
    define: {
      ...publicVars,
      'process.env': JSON.stringify(rawPublicVars),
    },
  },
  server: {
    proxy: {
      '/api/db': {
        target: LOCAL_BACKEND ? 'https://localhost' : 'https://pente.org',
        changeOrigin: true,
        ...(LOCAL_BACKEND ? { secure: false } : {}),
      },
      '/gameServer': {
        target: LOCAL_BACKEND ? 'https://localhost' : 'https://pente.org',
        changeOrigin: true,
        ...(LOCAL_BACKEND ? { secure: false } : {}),
      },
    },
  },
  output: {
    distPath: {
      root: 'build',
    },
    assetPrefix: '/gameServer/db',
  },
});
