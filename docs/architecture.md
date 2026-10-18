# Architecture

This page shows how Radio Calico runs in production and how changes reach `main`. The diagrams are Mermaid, which GitHub renders directly.

## Runtime system (production)

```mermaid
flowchart LR
  user["Listener's browser"]

  subgraph external["External: CloudFront"]
    hls["HLS stream<br/>live.m3u8 (FLAC + AAC)"]
    meta["metadatav2.json<br/>polled every 15s"]
    cover["cover.jpg"]
  end

  subgraph prod["Production stack (docker compose --profile prod)"]
    web["web: nginx<br/>static files, gzip, /vendor"]
    backend["backend: Node / Express<br/>API only"]
    db[("db: Postgres 16<br/>pgdata volume")]
  end

  user -->|"HTTP :3000<br/>page, CSS, JS, hls.js, fonts"| web
  web -->|"/api/* proxy"| backend
  backend -->|"SQL via DATABASE_URL"| db
  user -->|"audio segments"| hls
  user -->|"track info"| meta
  user -->|"cover art"| cover
```

The browser loads the page from nginx and audio, metadata and cover art from CloudFront. The backend is reachable only through nginx, and Postgres only from the backend.

## Delivery pipeline (GitHub)

```mermaid
flowchart LR
  dev["Developer"] -->|"push branch, open PR"| pr["Pull request"]

  pr --> ci_test["test job<br/>npm audit, unit tests, smoke check"]
  pr --> ci_browser["browser job<br/>Playwright, live stream"]
  pr --> ci_image["image job<br/>build amd64 + arm64"]

  ci_test & ci_browser & ci_image --> gate{{"Required checks pass<br/>and branch up to date"}}
  gate -->|"merge to main"| main["main"]
  main -->|"docker-publish.yml"| ghcr[("ghcr.io<br/>backend image")]
```

The three checks named `test`, `browser` and `image` are required on `main`. The publish step pushes only the backend image. nginx is built from `Dockerfile.nginx` by compose and isn't published.

## Development stack

The dev profile (`docker compose --profile dev`) runs the app under nodemon with the source mounted, and a second Postgres (`db-dev`). It is served on port 3001 and isn't part of the production diagram above.
