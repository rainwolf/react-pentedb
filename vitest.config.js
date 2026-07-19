import { defineConfig } from 'vitest/config';

export default defineConfig({
  // CRA-style: JSX lives inside .js files (App.js, index.js), not .jsx/.tsx. Vite's
  // oxc transform infers "lang" from the file extension and excludes .js from JSX
  // parsing by default, so route src .js through the JSX transform alongside oxc's
  // default ts/jsx patterns (mirrors react_live_game_room/vitest.config.js).
  oxc: {
    lang: 'jsx',
    include: [/\.(m?ts|[jt]sx)$/, /src\/.*\.js$/],
    exclude: /node_modules/,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    exclude: ['node_modules/**'],
  },
});
