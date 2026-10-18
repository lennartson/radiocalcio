# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install: `npm install`
- Run: `npm start` (serves on `http://localhost:3000`; set `PORT` to change it, and `DATABASE_URL` to a Postgres connection string)
- Dev with auto-restart: `npm run dev` (nodemon)
- Security: `make security` runs `npm audit --omit=dev --audit-level=high` and fails on high-severity production vulnerabilities. CI runs the same check.
- Tests: `npm test` (Node's built-in test runner, no extra dependencies). It runs `test/api.test.js` and `test/player.test.js` together. To run one file: `node --test test/player.test.js`. Tests need Node 22+ (`node --test` doesn't accept a directory on Node 24). There is no lint or build step.

## Architecture

This is a small Express 5 app with two largely independent halves.

**Radio player (what the site is for).** `public/index.html` is the page markup. It loads `public/style.css` and `public/app.js`, plus hls.js from `/vendor/hls` (served from `node_modules`) before `app.js`. Fonts come from `/vendor/fonts`. The page makes no CDN or Google Fonts requests.. There is no build step. `app.js` plays a live HLS stream from a CloudFront origin, with hard-coded URLs at the top of the file (`STREAM_URL`, `METADATA_URL`, `COVER_URL`). The stream is 48 kHz FLAC. The manifest under-reports FLAC bitrate, so the player tracks the AAC rendition and switches to it after repeated buffer stalls. Playback uses hls.js when MSE is available, and falls back to native HLS on iOS Safari. Every 15 seconds the page re-fetches `metadatav2.json` to update the now-playing artist, title, album, cover, "new" badge, and last five tracks. Metadata is best-effort: on failure the page keeps the last known track. The server is not involved in playback. `server.js` serves the static `public/` directory and the vendored packages from `node_modules`. hls.js and the fonts are production dependencies, so the Docker image needs them installed.

**API and database (scaffolding).** `server.js` exposes `/api/health` and `/api/users` (GET list, POST create with `name` and `email`). `db.js` connects to Postgres through `DATABASE_URL` (node-postgres) and creates the `users` table on startup. `server.js` waits for that before listening. Nothing in the frontend calls these endpoints. Treat them as a template, not as part of the radio feature.

**Assets and brand.** `RadioCalico_Style_Guide.txt` is the brand reference. The CSS variables at the top of `public/style.css` mirror its palette (mint, forest, teal, orange, charcoal, cream, white). Montserrat is used for headings and Open Sans for body text. Keep new UI consistent with it, and keep the logo unmodified.

## Notes

- `stream_URL.txt` holds the same stream URL as the `STREAM_URL` constant in `public/app.js`. Update both if the stream moves.
- Production runs as three containers (`docker-compose.yml`): nginx serves `public/` and proxies `/api/`, the Node backend runs the API only, and Postgres 16 holds the data. Only nginx is published; `POSTGRES_PASSWORD` comes from a git-ignored `.env`.
- `npm test` needs a reachable Postgres (`TEST_DATABASE_URL`, default `localhost:5433`). Each run uses its own schema.
