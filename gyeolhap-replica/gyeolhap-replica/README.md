# 반짝 결! 합! — original replica

A responsive, original-code implementation of a Korean three-attribute matching game. It includes a solo practice mode and realtime multiplayer rooms with host/student flows. It does **not** reuse the reference site's source code, screenshots, or assets.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The multiplayer server runs on `http://localhost:3001`; Vite proxies Socket.IO during development.

```bash
npm test
npm run build
npm start
```

`npm start` runs the Socket.IO server and serves the built `dist/` directory. Run `npm run build` first for a production-style local run.

## Gameplay rules

Each board contains nine cards. Every card has three attributes: shape, shape color, and background color. A valid set contains three cards where, independently for each attribute, the three values are either **all identical** or **all different**. A mixture of two equal values plus one different value is invalid.

- Correct set: **+1**
- Incorrect set or timeout: **−1**
- Correct `결!` declaration when no set remains: **+3**
- Incorrect `결!` declaration: **−1**

The solo mode has three rounds. A successful `결!` advances to the next round. The host can configure 3, 5, or 10 multiplayer rounds, the claim timer, and an incorrect-answer cooldown.

## Architecture

```text
src/
  shared/game.ts         Pure card model, shuffling, rules validation, board generation
  components/CardTile.ts SVG card rendering; original CSS shapes, no reference assets
  App.tsx                Home, solo, host lobby, student lobby, multiplayer game UI
  style.css              Responsive design system and layouts
server/
  index.ts               Express + Socket.IO, room lifecycle, authoritative scoring
 tests/
  game.test.ts           Unit tests for rules, generated boards, and replacement
```

### Realtime protocol

Socket.IO events are handled on the server, not trusted from the client:

- `room:create` — create a four-digit room; creator becomes host
- `room:join` — join a waiting room with nickname + code
- `room:start` — host starts a room
- `game:claim` — first eligible player claims the selection window
- `game:select` — server validates three card IDs and updates score
- `game:declare-none` — server checks that no valid set remains
- `room:leave` — leave a room

Room state currently lives in process memory. Restarting the server clears rooms. This keeps the first version easy to run and avoids requiring a database, but it is not intended for multi-instance hosting yet. Before a public classroom launch, consider Redis-backed Socket.IO adapters and room persistence, rate limiting, join-code abuse controls, reconnect handling, and server-side integration tests.

## GitHub repository setup

Create an empty repository named `gyeolhap-replica` in your GitHub account, then from this folder run:

```bash
git init
git add .
git commit -m "feat: build Gyeolhap card game MVP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/gyeolhap-replica.git
git push -u origin main
```

Alternatively, download the source ZIP from this session and upload it to a new GitHub repository. The separate Git bundle includes the prepared commit history; after creating an empty repository on GitHub, use:

```bash
git clone ./gyeolhap-replica.bundle gyeolhap-replica
cd gyeolhap-replica
git remote add origin https://github.com/YOUR-USERNAME/gyeolhap-replica.git
git push -u origin main
```

Do not commit `.env`, personal tokens, or other secrets.

## Known MVP limits

- Multiplayer rooms are in-memory and are cleared on server restart.
- Rejoining after refreshing creates a new socket identity; reconnect/session restoration is a future improvement.
- The reference experience's broader weekly leaderboard and QR-code flow are not implemented in this first pass.
- The board uses a controlled 27-card attribute catalog with new replacements selected so there are no duplicate cards on the active board.
