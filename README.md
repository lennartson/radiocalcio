# Radio Calico

A browser-based player for the Radio Calico live stream. It plays a 48 kHz FLAC HLS stream, shows what's on air, and lists the last five tracks.

## Getting started

Requires Node.js and npm.

```sh
npm install
npm start
```

Then open http://localhost:3000. To use another port, set `PORT`:

```sh
PORT=8080 npm start
```

For development, `npm run dev` runs the server under nodemon, which restarts it when files change.

## How it works

- `public/index.html` is the page markup. It loads `public/style.css` and `public/app.js`, plus hls.js from jsDelivr.
- `public/app.js` plays the stream and polls the track metadata every 15 seconds.
- The audio and metadata come directly from the CloudFront origin. The Node server only serves the `public/` folder.
- Where the browser has no MSE support (such as iOS Safari), the player uses native HLS playback.

The stream URL is in `stream_URL.txt` and in the `STREAM_URL` constant at the top of `public/app.js`. Keep them in sync.

## Project layout

- `server.js`: Express server that serves `public/` and the API routes.
- `db.js`: SQLite connection (better-sqlite3). Creates `data/app.db` and the `users` table on startup.
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

The SQLite database lives in `data/app.db` and is created on first run. The `data/` files are gitignored.

## Tests

Run the tests with:

```sh
npm test
```

- `test/api.test.js`: the health, users and static-file routes, against a temporary SQLite database (set with `DB_PATH`).
- `test/player.test.js`: the player logic in `public/app.js`, run in a sandbox with stand-ins for the DOM and hls.js. It doesn't play audio or contact the stream.
