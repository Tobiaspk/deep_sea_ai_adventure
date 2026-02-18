# AGENTS.md — Dive, Laugh, Love

Lightweight HTML board game (inspired by Deep Sea Adventure). Local + online multiplayer, 2–6 players.

## Tech Stack

- **Client:** HTML5, CSS3, vanilla JS (ES modules), Web Audio API (synthesized SFX)
- **Server:** Node.js v25+, `ws` npm package (only runtime dep). Serves static files + WebSocket.
- **No** frameworks, build tools, databases, auth, or heavy deps.

## File Map

```
index.html                 # Single page: mode select → lobby → game
server.js                  # Authoritative WebSocket server (inlines domain logic)
start.sh                   # Launch server; optional --ngrok flag
src/
  main.js                  # Entry: wires screens, lobby, render loop, overlays
  domain/
    gameState.js            # State factories: createGameState, createCoopGameState
    rules.js                # Pure validation: canPickUp, canDrop, canBuyAnchor, isRoundOver, etc.
    turnEngine.js           # State mutations: chooseDirection, applyMovement, endTurn, endRound, etc.
    scoring.js              # Score helpers & scoreboard
  app/
    gameController.js       # Dual-mode controller (local runs domain; online sends WebSocket actions)
  ui/
    renderBoard.js          # Board tile rendering
    renderHud.js            # Oxygen bar, player panels, co-op status, game-over scoreboard
    bindControls.js         # Contextual action buttons; gates by turn phase & online turn ownership
  infra/
    constants.js            # All game constants (oxygen, rounds, chip levels, costs, colors)
    rng.js                  # Dice: two d3
    sounds.js               # 16 Web Audio synthesized SFX
    storage.js              # localStorage save/load
    network.js              # WebSocket client wrapper
styles/
  base.css                  # Reset, body, typography
  board.css                 # Board tiles, diver tokens
  ui.css                    # HUD, controls, lobby, animations, co-op panels
tests/
  domain.rules.test.js      # 25+ deterministic rule tests
```

## Architecture

```
Browser(s) ◄──WebSocket──► Node.js server (authoritative)
```

- **Domain** (`src/domain/`): pure functions, no DOM. Deterministic state transitions.
- **Controller** (`src/app/gameController.js`): local mode calls domain directly; online mode sends actions via WebSocket and applies server state.
- **UI** (`src/ui/`): reads state, renders, emits user actions to controller. No game logic.
- **Server** (`server.js`): mirrors domain logic server-side. Room management (4-letter codes), broadcasts state after each action.

## Game Modes

| Mode | Sub-mode | How state works |
|------|----------|----------------|
| Local | Versus | Controller runs domain logic in-browser |
| Local | Co-op (Treasure Haul / Monster Hunt) | Same, with `state.coop=true` |
| Online | Versus | Server authoritative; clients send actions |
| Online | Co-op | Same, with `room.coop=true` |

## Turn Flow

1. **Direction phase** (`turnPhase='direction'`): player picks down/up (sub players always go down). Available sub-actions: Buy Anchor, Buy Bomb (co-op monsters), End Round (co-op, all on sub), Skip Turn.
2. **Auto-roll**: dice roll happens automatically after direction choice (no manual roll step).
3. **Pickup phase** (`turnPhase='pickup'`): Pick Up, Drop, Skip, Trident attack, Depth Charge, Bomb Monster.
4. **End turn**: advance to next player or end round.

## Key Mechanics

- **Oxygen** (starts 25): each player's turn costs oxygen = number of carried chips. Round ends at 0.
- **Chips**: 32 tiles, levels 1–4, values randomized per level range. Board compacts between rounds.
- **Anchor Boost**: costs 3 pts (from scored chips in versus, from coopScore in co-op). Multiplies next roll ×5.
- **Poseidon's Trident**: attack adjacent player. 1d6: ≥5 = kill, 1 = backfire, else miss.
- **Depth Charge**: destroy chip on current space, costs 3 oxygen. 1 per round.
- **Co-op Treasure Haul**: shared coopScore pool, target = 30 × playerCount.
- **Co-op Monster Hunt**: monsters block movement. Buy bombs (cost 20 from pool) to destroy them.
- **Co-op round end**: when all players are on the sub, round does NOT auto-end — players choose "End Round" or keep diving.

## Coding Rules

- ES modules client-side. `server.js` uses ESM (`import`).
- Pure functions in `domain/`. `const` default, `let` when needed.
- Single state object; UI never mutates it directly.
- CSS: modular by area. Animations via `@keyframes`. Classes over inline styles.
- `camelCase` files/functions/variables. Game terminology: oxygen, diver, treasure, round, chip.
- **server.js inlines domain logic** — keep both in sync when changing rules.

## Adding a New Action

1. Add validation function in `rules.js` (e.g. `canDoThing`).
2. Add state mutation in `turnEngine.js` (e.g. `doThing`).
3. Add `actionDoThing` in `gameController.js` (handle both local + `sendAction` for online).
4. Add button in `getAvailableActions()` in `gameController.js`.
5. Add `handleDoThing` in `server.js` and register in `ACTION_HANDLERS`.
6. Add SFX call if needed. Add overlay in `main.js` if needed.

## Running

```bash
npm install          # first time
./start.sh           # http://localhost:8080
./start.sh --ngrok   # with public tunnel
node tests/domain.rules.test.js  # run tests
```
