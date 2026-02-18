 # AGENTS.md

## Purpose

This document defines the implementation blueprint for **Dive, Laugh, Love** (inspired by Deep Sea Adventure) — a lightweight HTML-based board game with local **and** online multiplayer.

---

## Core Principles

1. Keep the game small, readable, and easy to run.
2. Prefer plain web technologies over frameworks.
3. Avoid premature complexity (no build pipeline, no heavy dependencies).
4. Keep game rules deterministic and testable.
5. Separate game logic from UI rendering.
6. Server is authoritative in online mode — clients never run game logic.

---

## Technology Choices

### Client (browser)

- **HTML5** for page structure.
- **CSS3** for styling and animations (`@keyframes`).
- **Vanilla JavaScript (ES Modules)** for logic.
- **Web Audio API** for synthesized sound effects (no audio files).

### Server

- **Node.js** (v25+) — runtime for the WebSocket game server.
- **`ws`** (npm) — lightweight WebSocket library.
- The server also serves static files so no separate HTTP server is needed.

### Deployment / Tunneling

- **ngrok** — optional public tunnel for remote players outside the LAN.

Do not use React/Vue/Angular or heavy runtime dependencies.

---

## Scope and Constraints

- Target: desktop browser first; responsive enough for tablet.
- Online multiplayer via WebSocket room codes (2–6 players).
- No account/authentication.
- No database or backend persistence.
- No GPU-heavy effects.
- Keep asset count low and file sizes small.

---

## Architecture (High-Level)

```
┌─────────────┐        WebSocket         ┌──────────────────┐
│  Browser(s)  │  ◄──────────────────►   │   Node.js Server  │
│  UI + Client │     state / actions     │  Authoritative    │
│  Network.js  │                         │  Game Logic       │
└─────────────┘                          └──────────────────┘
```

### Layers

1. **Domain/Game Rules Layer** (`src/domain/`)
   - Pure logic: players, turns, oxygen, treasure track, movement, pickup/drop, round transitions, scoring.
   - Custom mechanics: Poseidon's Trident, Depth Charge, Anchor Boost.
   - No DOM access. Deterministic state transitions.
   - Used directly in local mode; inlined/adapted in `server.js` for online mode.

2. **Application/Controller Layer** (`src/app/`)
   - Dual-mode controller: **local** (runs domain logic directly) or **online** (sends actions via WebSocket, receives authoritative state).
   - Exposes unified action API to the UI regardless of mode.

3. **Presentation/UI Layer** (`src/ui/`)
   - Reads state and renders board, tokens, oxygen, player inventories, and controls.
   - Sends user actions to controller.
   - No game-rule decisions in UI code.
   - In online mode, gates controls to the current player's turn.

4. **Infrastructure Layer** (`src/infra/`)
   - `constants.js` — game constants.
   - `rng.js` — dice roller (two d3).
   - `storage.js` — localStorage adapter for optional save/load.
   - `sounds.js` — 16 synthesized sound effects via Web Audio API.
   - `network.js` — WebSocket client wrapper (connect, create/join room, send action).

5. **Server Layer** (`server.js`)
   - Authoritative WebSocket server with room management (4-letter codes).
   - In-memory `Map` of rooms; each room holds full game state.
   - Inlines domain logic (adapted from `src/domain/`) so the server is self-contained.
   - Serves static files (HTML/CSS/JS/assets) — replaces `python -m http.server`.

---

## Project Structure

```text
/
  index.html              # Entry HTML — mode select, lobby, game
  server.js               # Node.js WebSocket + static file server
  package.json            # npm metadata + ws dependency
  start.sh                # Convenience script (server + optional ngrok)
  .gitignore
  /src
    /domain
      gameState.js         # State factory
      rules.js             # Pure validation functions
      turnEngine.js        # All game-state mutations
      scoring.js           # Score utilities
    /app
      gameController.js    # Dual-mode controller (local / online)
    /ui
      renderBoard.js       # Board rendering
      renderHud.js         # Oxygen / player HUD
      bindControls.js      # Contextual action buttons + turn gating
    /infra
      constants.js         # Game constants
      rng.js               # Dice
      sounds.js            # Web Audio synthesized SFX (16 sounds)
      storage.js           # localStorage adapter
      network.js           # WebSocket client wrapper
    main.js                # Bootstrap, lobby flow, render loop
  /styles
    base.css               # Reset, body, typography
    board.css              # Board tiles, diver tokens
    ui.css                 # HUD, controls, lobby, mode select, animations
  /assets
    /img
    /icons
  /tests
    domain.rules.test.js   # 25+ deterministic rule tests
```

---

## Coding Conventions

### JavaScript

- Use ES modules (`import`/`export`) on the client.
- `server.js` uses CommonJS-compatible patterns (no bundler).
- Prefer pure functions in `domain/`.
- Prefer `const` by default, `let` only when reassignment is needed.
- Use descriptive names; avoid one-letter variables.
- Keep functions short and single-purpose.

### State Management

- Maintain a single canonical game state object.
- In local mode, state lives in the controller.
- In online mode, the server holds authoritative state and broadcasts it to all clients after every action.
- Avoid mutating shared state directly in UI code.

### Styling

- Keep CSS simple and modular by area (`base`, `board`, `ui`).
- Prefer classes over inline styles.
- Animations use pure CSS `@keyframes` (kill overlay, explosion, anchor sinking, event banners).

### Files and Naming

- Use `camelCase` for JS files/functions/variables.
- Keep naming consistent with game terminology (oxygen, diver, treasure, round).
- Avoid deep nesting of folders.

---

## Rule Implementation Guidance

- Use the official rulebook as the source of truth for core mechanics.
- Custom mechanics (Trident, Depth Charge, Anchor Boost) are documented in-code and in README.
- Keep rule constants centralized in `constants.js`.
- Add small deterministic tests for edge cases in turn and oxygen resolution.

---

## UI/UX Guidance

- Prioritize clarity over visual effects.
- Show current player and legal actions clearly.
- Always display oxygen, turn order, and each player's carried treasure.
- Keep interactions to simple buttons and minimal board click handling.
- In online mode, show "Waiting for [name]…" when it's not the local player's turn.
- Mode selection (Local / Online) is the first screen; lobby flow for online games.

---

## Performance and Simplicity Targets

- Initial load should be fast on a typical laptop browser.
- Only runtime dependency: `ws` (server-side only, ~60 KB).
- Minimal DOM churn: rerender only changed sections when practical.
- Keep total client JavaScript footprint small and understandable.

---

## Testing Strategy (Minimal but Useful)

- Focus tests on `domain/` rules and turn engine.
- Test deterministic scenarios:
  - move validation,
  - oxygen consumption,
  - treasure pickup/drop constraints,
  - round/game end scoring,
  - custom mechanic edge cases.
- UI and network testing are optional for early versions.

---

## Non-Goals

- AI opponents with advanced strategy.
- Mobile-native packaging.
- Backend persistence / database.
- Account/authentication system.

---

## Delivery Phases

1. ✅ Skeleton UI + static board layout.
2. ✅ Domain state model + turn progression.
3. ✅ Player actions and rule enforcement.
4. ✅ Scoring and game-end flow.
5. ✅ UI polish and lightweight usability improvements.
6. ✅ Custom mechanics (Poseidon's Trident, Depth Charge, Anchor Boost).
7. ✅ Sound effects (Web Audio API) and CSS animations.
8. ✅ Rename to "Dive, Laugh, Love" + v1.0.0 release.
9. ✅ Online multiplayer (WebSocket server, room codes, lobby UI).
10. ✅ Deployment tooling (`start.sh`, ngrok tunneling).

---

## Implementation Status

**All ten phases are implemented.** The game supports both local hot-seat and online multiplayer.

### What was built

| Layer | Files | Description |
|-------|-------|-------------|
| Infra | `constants.js`, `rng.js`, `storage.js`, `sounds.js`, `network.js` | Game constants, dice, localStorage, 16 synthesized SFX, WebSocket client |
| Domain | `gameState.js`, `rules.js`, `turnEngine.js`, `scoring.js` | Pure game logic — state factory, movement, oxygen, pickup/drop, Trident/Depth Charge/Anchor, round/game end, scoring |
| App | `gameController.js` | Dual-mode controller (local ↔ online), unified action API |
| UI | `renderBoard.js`, `renderHud.js`, `bindControls.js` | Board rendering, HUD, contextual action buttons with turn gating |
| Entry | `main.js`, `index.html` | Mode select, lobby flow, render loop |
| Server | `server.js` | Authoritative WebSocket server, room management, static file serving |
| Style | `base.css`, `board.css`, `ui.css` | Dark-ocean theme, responsive layout, lobby/mode-select UI, CSS animations |
| Tests | `domain.rules.test.js` | 25+ deterministic rule tests |
| Scripts | `start.sh` | One-command server start with optional ngrok tunnel |

### Running the game

```bash
# Install dependencies (first time only)
npm install

# Start the server (default port 8080)
./start.sh

# Or with a public ngrok tunnel for remote players
./start.sh --ngrok

# Or specify a custom port
./start.sh 3000
./start.sh 3000 --ngrok
```

Open the URL printed in the terminal.

### Running tests

```bash
node tests/domain.rules.test.js
```

### Multiplayer flow

1. One player clicks **Online** → **Create Room** → shares the 4-letter room code.
2. Other players click **Online** → **Join Room** → enter the code.
3. Host clicks **Start Game** when everyone has joined.
4. The server runs all game logic; clients send actions and receive state updates.

### Rule assumptions

- Dice: two identical dice each with faces 1, 2, 3 (uniform).
- Movement is reduced by the number of carried chips (minimum 1 step).
- Occupied spaces are skipped (don't count as steps).
- When oxygen reaches 0, all divers still underwater lose their carried chips.
- Board compacts (gaps close) between rounds.
- After 3 rounds the player with the highest total scored-chip value wins.
- **Poseidon's Trident**: attack another diver to steal a treasure chip.
- **Depth Charge**: place an explosive on a tile to destroy it and its treasure.
- **Anchor Boost**: spend points to negate carried-chip movement penalty for one turn.
