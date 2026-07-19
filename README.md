# react_pentedb

React workbench for the pente.org game database ("pentedb") — a workbench app for
browsing/searching the game archive. Sibling of `react_mmai` and `react_live_game_room`.

Built with [rsbuild](https://rsbuild.dev/) (like the other two React apps here) + React 18 +
Material UI. Served in production at `pente.org/gameServer/db` (see `output.assetPrefix` in
`rsbuild.config.ts`).

## Local backend

By default the dev server proxies `/api/db` and `/gameServer` to the production backend
(`https://pente.org`), matching deployed behavior. To point it at a local Tomcat instance
instead (e.g. `docker compose up` in `../pente.org`):

```bash
cp .env.example .env.local
```

`.env.local` is git-ignored; `.env.example` documents the flag it needs
(`PUBLIC_LOCAL_BACKEND=1`).

## Scripts

```bash
npm start        # rsbuild dev server
npm run build    # production build -> build/
npm run preview  # preview a production build
npm test         # vitest run
npm run test:watch
```
