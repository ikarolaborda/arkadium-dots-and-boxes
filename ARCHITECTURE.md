# Architecture

This document answers the six architecture questions in the Arkadium
brief and walks through the seam map of the system. The companion
ADRs (in `docs/adr/`, git-ignored) record each individual decision with
its alternatives and tradeoffs.

---

## 1. State flow: client ↔ server ↔ database

```
┌──────────────┐ Socket.IO ┌──────────────────────────────────┐ Prisma  ┌────────────┐
│ Vue 3 client │ ◀──────▶ │  NestJS gateway → GameService    │ ──tx──▶ │ PostgreSQL │
│ (Pinia store)│           │  GameEngine (pure, in-process)  │           │  (games,   │
│              │           │  GameBroadcaster → Socket.IO    │           │   moves,   │
│              │           └──────────────────────────────────┘           │   players) │
│              │ HTTP /api ┌──────────────────────────────────┐           │            │
│              │ ◀──────▶ │  REST controllers (lobby, hist.) │ ──read──▶ │            │
└──────────────┘           └──────────────────────────────────┘           └────────────┘
```

Authoritative state lives **on the server**, persisted **synchronously**
on every move. The in-memory `GameState` returned by the engine is never
the source of truth; it is a per-request value derived from the database
snapshot. This is the inversion that makes recovery trivial: a server
crash is a `kill -9` away from a no-op replay.

### When does state hit the DB?

- **POST /api/games** — `LobbyService.createGame` inserts the seed
  `games` row + the host's `game_players` row in a single transaction.
- **Socket message: `game:join`** — `LobbyService.joinGame` inserts the
  joining seat. If the seat count crosses `minPlayers`, the game flips
  from `WAITING` to `IN_PROGRESS` in the same transaction.
- **Socket message: `game:move`** — `GameService.playMove` runs inside a
  Prisma `$transaction`:
  1. `SELECT … FOR UPDATE`-equivalent reload via `findUnique` (Postgres
     read-committed gives us the freshness we need; the actual conflict
     surface is the unique `(game_id, sequence)` constraint on `moves`).
  2. `GameEngine.applyMove` validates and computes the next state.
  3. `UPDATE games SET state, current_turn_seat_idx, status, winner_id, draw, completed_at`.
  4. `UPDATE game_players SET score` per seat (only the moving seat
     changes, but we batch all four for simplicity).
  5. `INSERT INTO moves` — fails on `P2002` if the same sequence has
     already been written, which rolls the whole batch back.
- **Socket disconnect** — `GameService.setConnection(false)` updates
  `disconnected_at` immediately and arms a 30-second forfeit timer.
- **Forfeit** — same UoW: flip `status=ABANDONED`, set winner if
  unambiguous, and broadcast `game:ended`.

### Consistency guarantees

- **Per-game serial order** is enforced by the unique constraint on
  `(game_id, sequence)`. Two concurrent moves on the same game cannot
  both commit; the loser fails on `P2002` and the gateway retries the
  read or returns an error.
- **Read-after-write** for the moving client: the broadcaster emits the
  delta only after the transaction commits, so every client receives
  the post-commit snapshot.
- **Eventual consistency between instances** is acceptable today because
  exactly one server instance owns each socket; with the Redis adapter
  enabled, all instances see the broadcast at most one network hop late.

The engine is a pure function so the DB and in-memory views can never
drift in *interpretation*: identical input always yields identical
output. The drift surface is reduced to "is the input fresh?", which is
exactly what the transaction guarantees.

---

## 2. Database schema

```
players(id UUID PK, nickname, created_at)
games(id UUID PK, status, grid_size, host_id FK→players, current_turn_seat_idx,
      state JSONB, winner_id FK→players, draw, created_at, started_at, completed_at)
game_players(game_id FK→games, player_id FK→players, seat_index, score, disconnected_at, joined_at;
             PK(game_id, player_id); UNIQUE(game_id, seat_index))
moves(id UUID PK, game_id FK→games, sequence, player_id FK→players, seat_index,
      line_orientation char(1), line_x, line_y, completed_boxes, created_at;
      UNIQUE(game_id, sequence))
```

### Why this shape

- **Players** are first-class so multiple games can reference the same
  identity (history, friends-list later, leaderboards). Anonymity is fine
  for the challenge — the JWT is signed by the server and carries the
  player UUID + nickname.
- **Games hold a JSONB snapshot AND link to a moves ledger.** The JSONB
  is for O(1) reload (no replay on hot path). The moves table is the
  audit log: replays, spectators, analytics. They cannot diverge because
  every commit writes both inside one transaction. ADR-0007 captures the
  alternative (pure event sourcing) and why it was rejected for a 4-hour
  scope.
- **`game_players` join table** carries score and disconnection state
  per seat. The `(game_id, seat_index)` unique constraint locks turn
  order to insertion order — handy for deterministic seat assignment.
- **`moves` is append-only** with a per-game sequence. The unique
  constraint *is* the optimistic concurrency check.

Indexes:

- `games.status` — lobby query (`WAITING` games).
- `games.completed_at` — match history listing (sorted DESC).
- `games.winner_id` — winner-leaderboard queries.
- `moves.game_id` — replay queries.
- `game_players.player_id` — "games this player has joined".

### Migration strategy

`prisma migrate` produces versioned SQL files under
`backend/prisma/migrations/`. They are applied with `prisma migrate
deploy` in CI and at container startup (`backend` service `command`).
For non-trivial migrations we'd:

1. Write the SQL by hand if Prisma's diff isn't safe (e.g. concurrent
   index creation, table renames with data preservation).
2. Run `migrate dev` locally to validate, then commit the generated SQL
   verbatim.
3. Make every migration **forward-and-backward compatible** for two
   deploys: app version N writes the old shape and reads both, version
   N+1 writes the new shape. This avoids any rolling-restart breakage
   when active games exist on disk.

---

## 3. Disconnection and reconnection

Flow:

1. The client connects with a Bearer JWT in the Socket.IO `auth.token`
   handshake. The gateway middleware verifies it, attaches
   `{playerId, nickname}` to the socket, and admits the connection.
2. On `game:join`, the socket joins room `game:<gameId>` and the
   `game_players.disconnected_at` is cleared.
3. On TCP/WebSocket close, the gateway:
   - flips `disconnected_at = now()` for every game the socket had
     joined,
   - schedules a 30-second forfeit timer per game in
     `DisconnectionScheduler`.
4. If the same player reconnects (same JWT) within 30s and emits
   `game:resume` or `game:join`:
   - the scheduler cancels the pending forfeit,
   - `disconnected_at` is cleared,
   - the gateway sends a fresh `game:state` snapshot to the rejoining
     socket only,
   - other clients in the room get `game:player_reconnected`.
5. If the timer fires:
   - `GameService.forfeitOnTimeout` runs `GameEngine.abandon`,
   - state is persisted with `status=ABANDONED`, `winner_id` set to the
     leading survivor (or `null` for draw),
   - everyone in the room gets `game:ended`.

The same JWT is reusable across socket reconnections because
authentication is stateless. Server crashes do not invalidate live
games: each reboot reads the snapshot back via `GameRepository.findById`
on the next message.

---

## 4. Scaling to 10,000 concurrent players

The 4-hour build is single-instance. The intended path is:

1. **Stateless app instances** — every NestJS pod is a peer; nothing
   important lives in process memory beyond the disconnection timers
   (which are per-socket and rebuilt on reconnect). Run N pods behind
   an L7 LB with **session-affinity by socket id** (cookie-based or
   IP-hash) so a given client stays on the same pod for its socket
   lifetime.
2. **Redis pub/sub Socket.IO adapter** — `@socket.io/redis-adapter`
   broadcasts room messages across pods. Already provisioned in the
   compose file; the gateway only needs `io.adapter(createAdapter(pub,
   sub))` in `afterInit`. With this, any pod can publish a `state:delta`
   to `game:<id>` and clients connected through any other pod receive
   it.
3. **Postgres** — at 10k concurrent users with ~30 moves per game and
   typical 8-minute matches, the steady-state write rate is well under
   100 writes/sec. The hot table is `moves`; PG handles that on a
   single primary trivially. We add **read replicas** for
   `GET /api/games/history` and `GET /api/games/joinable`.
4. **Hot-path optimisation** — once write contention starts to bite (>1
   move/sec per game on average, which Dots and Boxes does not produce
   organically), we shard hot games into a Redis hash keyed by `game_id`
   and run **periodic write-through** to Postgres every N moves. The
   transaction shifts from "one row update per move" to "one row update
   per N moves + one Redis write per move". The schema does not change;
   only the repository implementation does.
5. **Connection capacity** — each Node process tops out around ~10k
   concurrent sockets in practice. To serve 10k *players* (probably
   ~5k concurrent sockets including spectators), one beefy pod is
   enough; for headroom and zero-downtime deploys we run 3–5.
6. **Bottlenecks in order** — (a) sticky-session LB CPU, (b) Postgres
   `moves` insert rate (mitigated by Redis write-through above), (c)
   Redis pub/sub fanout (mitigated by sharded Redis if it ever bites),
   (d) match-history queries (mitigated by replicas + materialised
   leaderboards if those land later).

---

## 5. CDN strategy

The frontend is a static SPA: `frontend/dist` is HTML + immutable JS/CSS
bundles. The container serves them via Nginx with `Cache-Control:
public, max-age=2592000, immutable` on hashed assets and a default
revalidation policy on `index.html`.

The path to a CDN is a single rewrite: push `frontend/dist` to an S3 (or
R2 / GCS) bucket on every deploy, point a CloudFront / Cloudflare /
Fastly distribution at the bucket, and serve `index.html` from the edge.
The API and Socket.IO traffic stays on the origin (a CDN buys nothing
for stateful WebSockets) — typically:

```
https://app.example.com/           → CDN → S3        (HTML, JS, CSS, fonts, sprites)
https://app.example.com/api/*      → origin LB        (REST)
https://app.example.com/socket.io/ → origin LB        (WS, sticky)
```

Cache rules:
- `*.js`, `*.css`, `*.woff2`, hashed names → `public, max-age=31536000, immutable`
- `index.html` → `public, max-age=0, must-revalidate`
- API and `/socket.io/` paths bypass the CDN entirely.

---

## 6. Spectator mode

The schema is already spectator-ready. Plan:

1. **Auth.** A spectator JWT carries `{playerId, role: 'spectator',
   gameId}`. The gateway accepts it but binds the socket to read-only.
2. **Live channel.** On `game:join`, instead of inserting a
   `game_players` row, the spectator is just added to the `game:<id>`
   room. They receive every `state:snapshot` and `state:delta` like any
   player but cannot emit `game:move` (the gateway checks role).
3. **Replay channel.** A new HTTP endpoint
   `GET /api/games/:id/replay?since=<seq>` streams `moves` rows ordered
   by `(game_id, sequence)`. The client feeds them through the same
   client-side reducer used for live deltas, so live and replay share
   one rendering pipeline. For long replays we'd return them as
   newline-delimited JSON for backpressure.
4. **Catch-up to live.** A late spectator does:
   1. `GET /api/games/:id` → snapshot at the latest committed sequence,
   2. open the socket,
   3. replay moves between snapshot sequence and the next live delta
      (typically 0 because the snapshot is post-commit).

The persistence layer requires no changes; we'd add a `spectator_count`
counter on the `Game` entity for UI niceness and rate-limit the replay
endpoint per IP.

---

## Seam map

| seam | what crosses it | trust boundary | failure mode |
|------|-----------------|----------------|--------------|
| browser ↔ gateway | Socket.IO frames + JWT | yes — input is hostile | reject on bad JWT, type-check payloads, drop on rule violations |
| gateway ↔ application | DTO objects | no | exceptions surface as protocol errors |
| application ↔ engine | `GameState` value objects | no | engine throws domain errors, never persists |
| application ↔ persistence | port interfaces | no | Prisma errors map to domain errors at the adapter |
| backend ↔ Postgres | TCP | yes (network partition) | UoW rolls back; client retries |
| backend ↔ Redis (future) | TCP pub/sub | yes (network partition) | gateway falls back to in-memory adapter, single-instance broadcast still works |

---

## SOLID and design patterns

| principle / pattern | where |
|---------------------|-------|
| Single Responsibility | `GameEngine` plays moves; `LobbyService` orchestrates seating; `GameService` orchestrates moves; `MatchHistoryService` reads completed games. |
| Open/Closed | Engine accepts any `GameRules`; new rule flavors plug in without touching applyMove logic. |
| Liskov Substitution | `GameRepository` and `GameBroadcaster` are interfaces; the in-memory test double substitutes for Prisma/Socket.IO without changing services. |
| Interface Segregation | Separate ports for `GameRepository`, `PlayerRepository`, `GameBroadcaster`, `UnitOfWork`. No god-interface. |
| Dependency Inversion | Application depends on ports (interfaces), infrastructure depends on application (Nest DI tokens `GAME_REPOSITORY`, `GAME_BROADCASTER`, `UNIT_OF_WORK`). |
| Repository | `PrismaGameRepository`, `PrismaPlayerRepository`. |
| Unit of Work | `PrismaUnitOfWork` with `AsyncLocalStorage` so repositories transparently use the active transaction. |
| Strategy | `GameRules` is data-driven strategy for grid size and seat counts. |
| Observer | `GameBroadcaster` is the subject; clients subscribe by joining the Socket.IO room. |
| Adapter | `SocketIoGameBroadcaster` adapts the broadcaster port to Socket.IO. |
| Mapper | `GameStateMapper` (DTO ↔ domain), `mappers/GameStateMapper` (Prisma ↔ domain). |
| Command | `PlayMoveCommand`, `CreateGameCommand`, `JoinGameCommand` carry intent through the application layer. |
| Token-based authentication | JWT signed by the server; reused across reconnects, validated in the Socket.IO middleware. |
