# Red Tetris

Red Tetris is a multiplayer, real-time Tetris game built with React, Express,
Socket.IO, and TypeScript. Players join named rooms, compete on separate boards,
and send penalty lines when they clear multiple rows.

The project is a monorepo-style TypeScript application with a Vite client and a
Node.js server. Both the server and client are written as strict TypeScript
modules and share the same gameplay conventions for the board, pieces, and colors
where applicable.

## Features

- Room-based multiplayer with a generated player ID and username
- A 10-column by 20-visible-row board with two hidden spawn rows
- Seven tetromino types dealt from a shared seven-bag sequence
- Ghost piece, three-piece preview queue, hold, soft drop, and hard drop
- Host-only game start and difficulty selection, with a three-second countdown
- Multiplayer garbage-line attacks and opponent board spectra
- Reconnection grace period for the same username and in-room waiting between
  games
- Victory and elimination results
- Keyboard controls and an on-screen control toolbar
- Unit tests for server state, client rendering, controls, and gameplay utilities

## Bonus

- **SRS-style rotation:** wall kicks allow pieces to rotate near walls and
  stacked blocks, with separate kick tables for I pieces and JLSTZ pieces.
- **Counter-clockwise rotation:** rotate counter-clockwise with **Z** or the
  **Rotate ↺** toolbar button.
- **Scoring:** clear 1 / 2 / 3 / 4 lines for 100 / 300 / 500 / 800 points.
  Soft drop adds 1 point per row and hard drop adds 2 points per row.
- **Configurable difficulty:** the host can choose easy, medium, or hard before
  starting a match. Starting gravity is 800 / 500 / 250 ms, respectively.
- **Hold:** store or swap the active piece once per piece; holding becomes
  available again after the next piece locks.
- **DAS (Delayed Auto Shift):** hold left or right to move immediately, then
  auto-repeat after 170 ms at 60 ms intervals.

## Tech stack

| Area | Technology |
| --- | --- |
| Client UI | React 19, React DOM |
| Routing | React Router |
| Realtime communication | Socket.IO Client |
| Server | Node.js, Express 5 |
| Realtime server | Socket.IO |
| Language | Strict TypeScript |
| Client build | Vite |
| Tests | Vitest, Testing Library, jsdom |
| Formatting and linting | Biome |

## Project structure

```text
red-tetris/
├── client/
│   ├── index.html              # Vite HTML entry document
│   └── src/
│       ├── main.tsx            # React DOM entry point
│       ├── App.tsx             # Browser routes and app shell
│       ├── Home.tsx            # Join form, controls, and rules
│       ├── Game.tsx            # Connected game screen composition
│       ├── board.ts            # Board composition and ghost-piece calculation
│       ├── controls.ts         # Keyboard mapping
│       ├── display.ts          # Derived host, opponent, and status UI state
│       ├── types.ts            # Client-side shared state types
│       ├── colors.ts           # Tetromino and spectrum colors
│       ├── components/
│       │   ├── Board.tsx       # 10x20 active board renderer
│       │   ├── Opponents.tsx   # Opponent spectra and player tags
│       │   ├── PiecePreview.tsx # Hold and next-piece preview
│       │   ├── SidePanel.tsx   # Score, lines, hold, and next queue
│       │   └── Toolbar.tsx     # Start, difficulty, and touch/button controls
│       └── hooks/
│           ├── useElapsedSeconds.ts
│           ├── useGameConnection.ts
│           └── useKeyboardControls.ts
├── server/
│   └── src/
│       ├── index.ts            # Process entry point and signal handling
│       ├── server.ts           # Express/Socket.IO server factory
│       ├── game.ts             # Board, piece, scoring, rotation, and bag utilities
│       ├── throttle.ts         # Per-action cooldown logic
│       └── models/
│           ├── Game.ts         # Room lifecycle, rounds, gravity, and penalties
│           ├── Player.ts       # Individual board and player state
│           └── Piece.ts        # Active piece movement and collision model
├── dist/                       # Vite production output, generated on build
├── vite.config.ts              # Vite root, proxy, React plugin, and build output
├── vitest.config.ts            # Test discovery and coverage thresholds
├── biome.json                  # Formatting and lint configuration
└── package.json                # Scripts and dependencies
```

Each directory containing tests also includes a matching `*.test.ts` or
`*.test.tsx` file. Tests cover server state transitions, client components, board
logic, keyboard controls, and utility behavior.

## Architecture

### Client

The browser entry point is [client/src/main.tsx](client/src/main.tsx). It mounts
the React application from [client/src/App.tsx](client/src/App.tsx).

Routes are:

- `/` - join form and the game instructions
- `/<room>/<username>` - game room
- Any other route - `404`

The [useGameConnection](client/src/hooks/useGameConnection.ts) hook owns the
Socket.IO connection and translates server events into React state. It provides:

- `gameState` - the local board and active piece
- `room` - all player summaries, status, host, countdown, and difficulty
- `result` - the latest match result
- `myId` - the server-assigned ID for reconnection and host checks
- `connectionError` - handshake or capacity errors
- `send` - a typed wrapper for emitting Socket.IO events

The [useKeyboardControls](client/src/hooks/useKeyboardControls.ts) hook maps
browser keys to commands, handles delayed left/right auto-repeat, and releases
soft drop when keys are released or the window loses focus. The toolbar provides
equivalent button controls.

### Server

[server/src/index.ts](server/src/index.ts) starts the HTTP server on port `3000`
by default. Set `PORT` to use another port.

[server/src/server.ts](server/src/server.ts) is the server factory. It creates
Express and Socket.IO instances, serves the built client from `dist/`, manages
room limits and player reconnections, validates socket handshakes, and forwards
validated actions to the room's `Game` model.

[server/src/models/Game.ts](server/src/models/Game.ts) is the central multiplayer
state machine:

- `waiting`: no match is running; the host configures and starts it
- `countdown`: a 3-second countdown is announced to the room
- `playing`: gravity, drops, rotations, line clears, and penalties are active

The model also assigns the first player as host and transfers host status when
that player leaves.

[server/src/models/Player.ts](server/src/models/Player.ts) owns one player's
board, active piece, held piece, queue index, score, line count, and alive state.
It is responsible for locking pieces, clearing lines, scoring, spawning, hold,
and penalty-line overflow.

[server/src/models/Piece.ts](server/src/models/Piece.ts) represents an active
piece and implements movement, rotation, collision checks, and hard drop.
Pure board and tetromino rules live in [server/src/game.ts](server/src/game.ts).

### Board and piece rules

- The visible board is 10 columns by 20 rows. The server keeps two additional
  hidden rows above it so pieces can spawn before entering view.
- A piece that locks entirely within the hidden rows is a lock-out.
- Locked cells store the tetromino letter.
- The penalty cell is `X` and cannot be cleared by a normal complete line.
- One, two, three, or four cleared lines score 100, 300, 500, or 800 points.
- Soft drop adds 1 point per moved row.
- Hard drop adds 2 points per dropped row.
- Clearing `n` lines sends `n - 1` indestructible rows to each opponent.
- Gravity starts at 800 / 500 / 250 ms for easy / medium / hard. Every 10 cleared
  lines reduces the delay to 80% of the previous level, with a 50 ms minimum.
- Pieces are dealt from shuffled seven-piece bags, keeping each seven-piece cycle
  balanced. All players in a room receive the same sequence for each round.

## Socket.IO protocol

The client connects with authentication containing `roomId` and `username`.
Room and username lengths are limited to 64 and 24 characters respectively.

### Server -> client events

| Event | Payload | Purpose |
| --- | --- | --- |
| `welcome` | `{ playerId }` | Identifies the local player |
| `gameState` | `PlayerState` | Replaces the local board/state |
| `room` | `RoomSnapshot` | Updates room status and player summaries |
| `gameEnd` | `{ winner }` | Announces the match winner |
| `connectionError` | `{ message }` | Rejects invalid or duplicate connections |

### Client -> server events

| Event | Payload | Purpose |
| --- | --- | --- |
| `start` | none | Starts the countdown as the host |
| `difficulty` | `easy`, `medium`, or `hard` | Changes difficulty as the host |
| `move` | `left` or `right` | Moves the active piece horizontally |
| `rotate` | `cw` or `ccw` | Rotates the active piece |
| `softDrop` | none or `boolean` | Applies or releases soft drop |
| `hardDrop` | none | Locks the piece at the ghost position |
| `hold` | none | Holds or swaps the active piece |

Server actions are throttled to 30 events per socket per second and have
per-action cooldowns. Invalid actions are ignored rather than changing state.

## Multiplayer lifecycle

1. The client opens `/room/username`.
2. The server validates the handshake and creates or finds the room.
3. The first player becomes host.
4. The host chooses difficulty and starts the game.
5. Each connected player receives the same generated piece sequence.
6. Every room tick (25 ms by default) applies elapsed gravity.
7. Players clear lines and receive or send penalty lines.
8. A player is eliminated when a piece cannot spawn or its board overflows.
9. The last surviving player wins in multiplayer; single-player ends after
   elimination.
10. The room returns to `waiting`, while a player joining during play waits for
    the next match.

When a socket disconnects, the player remains in the room for five seconds.
Reconnecting with the same username resumes the existing player state rather than
creating a duplicate.

## Controls

| Action | Keyboard |
| --- | --- |
| Move left | Left Arrow |
| Move right | Right Arrow |
| Rotate clockwise | Up Arrow or X |
| Rotate counter-clockwise | Z |
| Soft drop | Down Arrow |
| Hard drop | Space |
| Hold | C or Shift |

Left and right use a 170 ms delayed auto-shift followed by 60 ms repeat
intervals. Soft drop stops when the key is released or the browser window loses
focus.

## Setup

Install dependencies from the repository root:

```bash
npm install
```

The project has no required environment variables. `PORT` is optional:

```bash
PORT=3000
```

## Development

Run the server and Vite client in two terminals.

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client
```

- Vite: `http://localhost:5173`
- API and Socket.IO server: `http://localhost:3000`

Vite proxies `/socket.io` traffic to the server, so the client normally does not
need a separate API URL.

## Production build and start

Create the client bundle:

```bash
npm run build
```

The Vite configuration builds [client/](client/) to [dist/](dist/). Start the
Node server, which serves that bundle and handles all Socket.IO connections:

```bash
npm start
```

The application is then available at `http://localhost:3000` unless `PORT` is
changed.

## Tests

Run the complete test suite:

```bash
npm test
```

Run tests continuously while developing:

```bash
npm run test:watch
```

Run coverage with the configured V8 provider:

```bash
npm run coverage
```

Coverage includes `server/src/**/*.ts` and `client/src/**/*.{ts,tsx}`, excludes
the server process entry and test files, and enforces the thresholds in
`vitest.config.ts`.

## Type checking

Check both TypeScript projects:

```bash
npm run typecheck
```

The server and client use separate `tsconfig.json` files. Both are strict and
disable emitted JavaScript.

## Formatting and linting

Format files in place:

```bash
npm run format
```

Run Biome lint fixes in place:

```bash
npm run lint
```

Biome is configured for tab indentation and double quotes.

## Server configuration

`createRedTetrisServer()` accepts optional server settings in
`server/src/server.ts`:

| Option | Default | Purpose |
| --- | --- | --- |
| `maxRooms` | 1000 | Maximum simultaneous rooms |
| `maxPlayersPerRoom` | 8 | Maximum players in a room |
| `maxEventsPerSecond` | 30 | Socket event-rate limit |
| `tickMs` | 25 | Room gravity and countdown tick interval |
| `graceMs` | 5000 | Disconnect reconnection window |
| `countdownMs` | 3000 | Match countdown |
| `distDir` | `../../dist` | Directory containing the built client |

These options are primarily useful for tests and custom server hosting.

## Testing layout

| Area | Test files |
| --- | --- |
| Server HTTP and Socket.IO behavior | `server/src/server.test.ts` |
| Room/game state machine | `server/src/models/Game.test.ts`, `server/src/game.test.ts` |
| Piece behavior | `server/src/models/Piece.test.ts` |
| Player behavior | `server/src/models/Player.test.ts` |
| Action throttling | `server/src/throttle.test.ts` |
| React app and screens | `client/src/App.test.tsx`, `client/src/Home.test.tsx`, `client/src/Game.test.tsx` |
| Board and display utilities | `client/src/board.test.ts`, `client/src/controls.test.ts`, `client/src/display.test.ts` |
