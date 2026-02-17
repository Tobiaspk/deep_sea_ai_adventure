 # AGENTS.md

## Purpose

This document defines the implementation blueprint for a **very lightweight, simple HTML-based version** of **Deep Sea Adventure**.

---

## Core Principles

1. Keep the game small, readable, and easy to run locally.
2. Prefer plain web technologies over frameworks.
3. Avoid premature complexity (no backend, no build pipeline unless absolutely needed).
4. Keep game rules deterministic and testable.
5. Separate game logic from UI rendering.

---

## Technology Choices

Use the following baseline stack:

- **HTML5** for page structure.
- **CSS3** for styling.
- **Vanilla JavaScript (ES Modules)** for logic.

Do not use React/Vue/Angular or heavy runtime dependencies.

Optional (only if later needed):

- Lightweight dev server (e.g., `python -m http.server` or `npx serve`).
- Small test tooling for game logic only.

---

## Scope and Constraints

- Target: desktop browser first; responsive enough for tablet if simple.
- No online multiplayer in initial versions.
- No account/authentication.
- No backend services.
- No database.
- No animation-heavy or GPU-heavy effects.
- Keep asset count low and file sizes small.

---

## Architecture (High-Level)

Follow a simple layered structure:

1. **Domain/Game Rules Layer**
   - Pure logic: players, turns, oxygen, treasure track, movement, pickup/drop, round transitions, scoring.
   - No DOM access.
   - Deterministic state transitions.

2. **Application/Controller Layer**
   - Orchestrates flow: start game, process current player action, advance turn/round, detect end game.
   - Calls domain functions and updates state.

3. **Presentation/UI Layer**
   - Reads state and renders board, tokens, oxygen, player inventories, and controls.
   - Sends user actions (move, pick, return, etc.) to controller.
   - No game-rule decisions in UI code.

4. **Infrastructure Layer (Lightweight)**
   - Small utilities: RNG (if needed), constants, local storage adapter for optional save/load.
   - Static assets (icons/sprites).

---

## Suggested Project Structure

```text
/
  index.html
  /src
    /domain
      gameState.js
      rules.js
      turnEngine.js
      scoring.js
    /app
      gameController.js
      actions.js
    /ui
      renderBoard.js
      renderHud.js
      bindControls.js
    /infra
      constants.js
      rng.js
      storage.js
    main.js
  /styles
    base.css
    board.css
    ui.css
  /assets
    /img
    /icons
  /tests
    domain.rules.test.js
  README.md
```

Notes:

- Keep file count minimal; merge files if architecture feels over-split.
- `domain/` must remain framework-agnostic and DOM-free.

---

## Coding Conventions

### JavaScript

- Use ES modules (`import`/`export`).
- Prefer pure functions in `domain/`.
- Prefer `const` by default, `let` only when reassignment is needed.
- Use descriptive names; avoid one-letter variables.
- Keep functions short and single-purpose.
- JSDoc is optional; use only where clarity is needed.

### State Management

- Maintain a single canonical game state object.
- All state changes should happen via explicit action handlers/reducers.
- Avoid mutating shared state directly in UI code.

### Styling

- Keep CSS simple and modular by area (`base`, `board`, `ui`).
- Prefer classes over inline styles.
- Keep visual style lightweight and readable.

### Files and Naming

- Use `camelCase` for JS files/functions/variables.
- Keep naming consistent with game terminology (oxygen, diver, treasure, round).
- Avoid deep nesting of folders.

---

## Rule Implementation Guidance

- Use the official rulebook as the source of truth for mechanics.
- If ambiguities appear, document assumptions in `README.md` before coding.
- Keep rule constants centralized (e.g., player count ranges, oxygen behavior).
- Add small deterministic tests for edge cases in turn and oxygen resolution.

---

## UI/UX Guidance (Lightweight)

- Prioritize clarity over visual effects.
- Show current player and legal actions clearly.
- Always display oxygen, turn order, and each player's carried treasure.
- Keep interactions to simple buttons and minimal board click handling.
- Support keyboard shortcuts only if trivial.

---

## Performance and Simplicity Targets

- Initial load should be fast on a typical laptop browser.
- No heavy libraries.
- Minimal DOM churn: rerender only changed sections when practical.
- Keep total JavaScript footprint small and understandable.

---

## Testing Strategy (Minimal but Useful)

- Focus tests on `domain/` rules and turn engine.
- Test deterministic scenarios:
  - move validation,
  - oxygen consumption,
  - treasure pickup/drop constraints,
  - round/game end scoring.
- UI testing is optional for early versions.

---

## Non-Goals (for initial implementation)

- Networked multiplayer.
- AI opponents with advanced strategy.
- Complex animation system.
- Mobile-native packaging.
- Backend persistence.

---

## Delivery Phases

1. ✅ Skeleton UI + static board layout.
2. ✅ Domain state model + turn progression.
3. ✅ Player actions and rule enforcement.
4. ✅ Scoring and game-end flow.
5. ✅ UI polish and lightweight usability improvements.

---

## Implementation Status

**All five phases are implemented.** The game is fully playable in a browser.

### What was built

| Layer | Files | Description |
|-------|-------|-------------|
| Infra | `constants.js`, `rng.js`, `storage.js` | Game constants, dice roller, localStorage adapter |
| Domain | `gameState.js`, `rules.js`, `turnEngine.js`, `scoring.js` | Pure game logic — state factory, movement, oxygen, pickup/drop, round/game end, scoring |
| App | `gameController.js` | Orchestrates user actions ↔ domain transitions, exposes action API |
| UI | `renderBoard.js`, `renderHud.js`, `bindControls.js` | Board rendering, oxygen/player HUD, action buttons |
| Entry | `main.js`, `index.html` | Bootstrap, setup form, render loop |
| Style | `base.css`, `board.css`, `ui.css` | Dark-ocean theme, responsive flexbox layout |
| Tests | `domain.rules.test.js` | 15+ deterministic rule tests (oxygen, movement, pickup, round end, scoring) |

### Running the game

```bash
python3 -m http.server 8080   # or: npx serve .
# Open http://localhost:8080
```

### Running tests

```bash
node tests/domain.rules.test.js
```

### Rule assumptions

- Dice: two identical dice each with faces 1, 2, 3 (uniform).
- Movement is reduced by the number of carried chips (minimum 1 step).
- Occupied spaces are skipped (don't count as steps).
- When oxygen reaches 0, all divers still underwater lose their carried chips.
- Board compacts (gaps close) between rounds.
- After 3 rounds the player with the highest total scored-chip value wins.
