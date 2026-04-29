# dots-and-boxes

[![ci](https://github.com/ikarolaborda/arkadium-dots-and-boxes/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ikarolaborda/arkadium-dots-and-boxes/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%5E20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A real-time multiplayer **Dots and Boxes** game built around an
> **authoritative server** with a **pure-functional game engine**, a
> **write-through PostgreSQL persistence layer** that survives restarts,
> and a Vue 3 client that talks to the server over Socket.IO.

The Arkadium coding challenge focuses on *how the system is designed*, not
on visual polish. This repository is therefore a small but complete
production-shaped slice: separation of concerns by hexagonal layering,
SOLID-respecting interfaces between modules, deterministic and replayable
move semantics, transactional state writes, JWT-secured reconnection, and
an explicit horizontal-scale story (Socket.IO + Redis adapter, sticky LB,
Postgres read replicas) — most of which is *described* in
[`ARCHITECTURE.md`](./ARCHITECTURE.md) rather than implemented in 4 hours.

---

## Highlights

- **Authoritative pure-functional game engine** — `GameEngine.applyMove`
  is a stateless module that takes a `GameState` and a `Line` and returns
  a new state plus a deterministic event stream. Easy to unit-test, easy
  to replay from the `moves` table, impossible for clients to cheat past.
- **Hexagonal layering** with explicit ports/adapters: `domain` knows
  nothing about HTTP, Socket.IO, or Prisma; `application` orchestrates
  through ports; `infrastructure` adapts to NestJS, Prisma, Socket.IO,
  and JWT. Swapping any adapter is a one-class change.
- **Write-through persistence** wrapped in a Prisma `$transaction` so each
  move atomically updates the game snapshot, the player scores, and the
  append-only `moves` ledger. Crash recovery means rebooting the process
  — there is no in-memory state that the database does not own.
- **Reconnect with grace window** — the gateway issues a JWT on
  `POST /api/sessions`; clients reconnect with the same token, the
  scheduler cancels the pending forfeit, and the server replays the
  current snapshot to the rejoining socket.
- **Match history** — completed and abandoned games stay in the database
  with full scores and durations, queryable via `GET /api/games/history`.
- **Container-first** — `docker compose up` brings Postgres + Redis +
  backend (with migrations) + frontend served via Nginx, all healthchecked.
- **Tested** — Jest unit tests cover engine determinism, turn rotation,
  bonus turns, multi-box closures, end-of-game, and forfeit. CI runs
  install / typecheck / test / build, then validates a full Docker build.

---

## Quickstart

### Local dev (Docker)

```bash
git clone git@github.com:ikarolaborda/arkadium-dots-and-boxes.git
cd arkadium-dots-and-boxes
cp .env.example .env
make up
```

- Frontend: <http://localhost:8080>
- Backend (HTTP + WS): <http://localhost:3001/api>
- Postgres: `localhost:5432` (`dab` / `dab`)

### Local dev (host)

```bash
npm install
npx prisma migrate deploy --schema=backend/prisma/schema.prisma
npm run -w @dab/backend start:dev
npm run -w @dab/frontend dev
```

Tests:

```bash
npm test --workspace @dab/backend
```

---

## Architecture in one paragraph

A Vue 3 client speaks REST for lobby and history, and Socket.IO for live
gameplay. The NestJS server holds the **only** authoritative game state.
Every move runs through the pure `GameEngine`, which validates the line,
detects newly closed boxes, advances scores, applies the bonus-turn rule,
and may emit a `game_ended` event. The `GameService` then commits the
new state and the immutable `Move` row inside a single Prisma
transaction (Unit of Work over `AsyncLocalStorage`), and the broadcaster
emits a `state:delta` to the room. Clients reduce that delta into their
local snapshot. On disconnect, a 30-second forfeit timer is armed; if the
player rejoins within the window, the server cancels it and replays the
snapshot. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full
write-up, including the 10k-concurrent-player path, the spectator-mode
plan, and the CDN strategy.

---

## Repository layout

```
arkadium-dots-and-boxes/
├── shared/                      protocol DTOs, event names, error codes (used by both ends)
├── backend/                     NestJS authoritative server
│   ├── prisma/                  schema + migrations (Postgres)
│   └── src/
│       ├── domain/              pure game model + engine (no framework imports)
│       ├── application/         services, ports (GameRepository, GameBroadcaster, UnitOfWork)
│       ├── infrastructure/      Prisma adapter, Socket.IO gateway, JWT, scheduler
│       ├── interfaces/http/     REST controllers (DTO + class-validator)
│       └── main/                NestFactory bootstrap
├── frontend/                    Vue 3 + Pinia + Vite client
│   └── src/
│       ├── views/               Lobby, Game, History
│       ├── components/          GameBoard.vue (SVG)
│       ├── stores/              session.ts, game.ts (Pinia)
│       └── services/            HttpClient, RealtimeClient (socket.io-client)
├── ops/docker/                  docker-compose.yml + nginx config
├── .github/workflows/ci.yml     install / typecheck / test / build / docker
├── Makefile                     one-line task runner
└── README.md
```

---

## Database schema (ERD-light)

| table          | purpose                                                                      |
|----------------|------------------------------------------------------------------------------|
| `players`      | One row per nickname; UUID primary key. Anonymous, no email/password.        |
| `games`        | One row per game; `state` JSONB holds the full board for fast reload, plus indexable columns for status / winner / completion. |
| `game_players` | Join table: `(game_id, player_id)` PK with `seat_index` and live score.      |
| `moves`        | Append-only ledger: `(game_id, sequence)` unique. Enables replay + spectators. |

Why JSONB **and** moves? The JSONB snapshot avoids replaying the entire
ledger on every load (O(1) reload). The move table is the audit log:
spectators, replays, and any future analytics ride on it. Both are
written inside the same transaction so they cannot diverge.

---

## What I'd do differently with more time

1. **Redis Socket.IO adapter wired in** — currently described in the
   ARCHITECTURE doc and present in `docker-compose.yml` as a service, but
   the gateway still uses the in-memory adapter. Adding it is ~5 lines in
   `GatewayModule`, plus a runtime config flag.
2. **Optimistic locking on `games.state`** — today the engine + UoW
   transaction is enough because move rate per game is low and a single
   instance owns each game's serialised state. With many instances, I'd
   add a `version` column and bump it conditionally to detect lost-update
   races on hot games.
3. **Property-based tests for the engine** — `fast-check` over random
   move sequences would catch box-detection edge cases far more
   thoroughly than the hand-written cases.
4. **Spectator mode end-to-end** — read-only socket join + replay
   endpoint that streams persisted moves. The schema already supports it.
5. **Observability** — structured logs are in place; I'd add OpenTelemetry
   tracing across `playMove → commit → broadcast` and a Prometheus
   `/metrics` endpoint.
6. **Frontend tests** — `@vue/test-utils` for `GameBoard.vue` covering
   click-to-line and color-by-seat invariants.
7. **Auth hardening** — short-lived JWT + refresh token, rate-limit on
   `POST /api/sessions`.

The full set of architectural decisions and their tradeoffs lives in
`docs/adr/` (intentionally git-ignored — see `.git/info/exclude` — so the
review surface stays focused on code, not ceremony).
