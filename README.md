# Radio Calico

A browser-based player for the Radio Calico live stream. It plays a 48 kHz FLAC HLS stream, shows what's on air, and lists the last five tracks.

## Getting started

Requires Node.js and npm.

```sh
npm install
npm start
```

Then open http://localhost:3000. The server needs a Postgres database, given by `DATABASE_URL`, for example `postgres://user:pass@localhost:5432/radiocalico`. To use another port, set `PORT`:

```sh
PORT=8080 npm start
```

For development, `npm run dev` runs the server under nodemon, which restarts it when files change.

## How it works

- `public/index.html` is the page markup. It loads `public/style.css` and `public/app.js`, plus hls.js. Both hls.js and the fonts are served from this server, so the page needs no CDN access.
- `public/app.js` plays the stream and polls the track metadata every 15 seconds.
- The audio and metadata come directly from the CloudFront origin. The Node server only serves the `public/` folder.
- Where the browser has no MSE support (such as iOS Safari), the player uses native HLS playback.

The stream URL is in `stream_URL.txt` and in the `STREAM_URL` constant at the top of `public/app.js`. Keep them in sync.

## Docker

Requires Docker with the Compose plugin.

Production runs three containers: **nginx** serves the player and proxies `/api/` to the **backend**, which stores data in **Postgres**. Only nginx is published. Before the first run, create a `.env` file in the project root with a database password (it is git-ignored):

```sh
echo POSTGRES_PASSWORD=5304b925787937eab23003a8084c9476 > .env
```

```sh
# Production: the player at http://localhost:3000 (set PORT in .env to change it)
docker compose --profile prod up --build

# Development: source mounted, auto-restarts on change, at http://localhost:3001
docker compose --profile dev up --build
```

Production data lives in the `pgdata` volume and survives `docker compose down`. Remove it with `docker compose down -v`, which deletes all data.

## Deploy

The backend image is published to GHCR, and the nginx frontend is built from this repo. The stream itself is external: the live audio, track metadata and cover art come from `d3d4yli4hf5bmh.cloudfront.net`, so the host needs outbound internet access.

The easiest deployment is the compose stack above, run from a checkout of this repo. Images for the backend are published for `linux/amd64` and `linux/arm64` at `ghcr.io/lennartson/radiocalcio`.

## Project layout

- `server.js`: Express API, plus static serving of `public/` when run standalone.
- `db.js`: Postgres connection pool (`DATABASE_URL`). Creates the `users` table on startup.
- `Dockerfile` / `Dockerfile.nginx` / `Dockerfile.dev`: backend, frontend, and dev images.
- `nginx/default.conf`: nginx config for static files and the API proxy.
- `public/`: the player (`index.html`, `style.css`, `app.js`) and the logo.
- `RadioCalico_Style_Guide.txt`: brand colors, typography, and UI guidelines.

## API

| Method | Path          | Description                                      |
|--------|---------------|--------------------------------------------------|
| GET    | `/api/health` | Returns `{ "status": "ok" }`.                    |
| GET    | `/api/users`  | Lists users.                                     |
| POST   | `/api/users`  | Creates a user. Body: `{ "name", "email" }`. Both are required. |

The player does not use these routes.

## Data

Data is stored in Postgres. The `users` table is created on startup. In production it lives in the `pgdata` Docker volume.

## Tests

Run the tests with:

```sh
npm test
```

- `test/api.test.js`: the health, users and static-file routes, against Postgres. Each run uses its own schema, set by `TEST_DATABASE_URL` (default `postgres://postgres:test@localhost:5433/radiocalico`).
- `test/player.test.js`: the player logic in `public/app.js`, run in a sandbox with stand-ins for the DOM and hls.js. It doesn't play audio or contact the stream.
