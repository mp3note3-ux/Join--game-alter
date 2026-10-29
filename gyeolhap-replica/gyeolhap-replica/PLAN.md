# Build plan

## Product goals

- A fresh implementation with a playful Korean-language interface and original SVG card artwork.
- Solo practice across multiple rounds with scoring.
- Host-created realtime rooms, four-digit join codes, student entry, a claim timer, server-validated combinations, and a live scoreboard.
- Mobile-first layout and keyboard-visible focus states.

## Architecture decisions

| Concern | Choice | Reason |
| --- | --- | --- |
| UI | React + TypeScript + Vite | Fast iteration and clear component boundaries |
| Rule engine | Pure TypeScript in `src/shared/game.ts` | Client and server call the same rule implementation |
| Realtime | Socket.IO | Bidirectional rooms and server-timed claims |
| HTTP server | Express | Serves the built app in production and exposes a health check |
| Persistence | In-memory for MVP | Keeps the first version simple; add persistence before production use |
| Tests | Vitest unit tests | Protects the most important game rule and board invariants |

## Implementation sequence

1. **Domain first — implemented:** attribute types, unique 27-card catalog, combination validation, board generation, and replacement.
2. **Playable solo UI — implemented:** original card visuals, selection feedback, three rounds, score, and `결!` scoring.
3. **Realtime multiplayer MVP — implemented in source:** room create/join, host start, first-claimant lock, claim timeout, server-side validation, penalties, and live score updates.
4. **Responsive experience — implemented in source:** home/mode selection, host/student forms, lobby, game board, leaderboard, and mobile breakpoints.
5. **Verification — partially complete:** core rule checks and TypeScript syntax transpilation passed. Full dependency-backed `npm test` and `npm run build` remain to be run after package installation; the first `npm install` attempt timed out in the authoring environment.
6. **Production hardening — next:** add Socket.IO integration tests; persist rooms or use Redis; support reconnect/session restoration; add rate limiting and stronger room-code abuse controls; add end-to-end mobile tests.
7. **Optional parity features — next:** QR join link, weekly leaderboard, accessibility review, and configurable game sounds.

## Important trust boundary

The browser requests actions, but the server owns the room state, claim deadline, card IDs, validation result, penalties, and scores. Never accept a client-supplied score or a client-supplied “valid” flag. The server should remain the authoritative source when adding persistence or reconnect support.
