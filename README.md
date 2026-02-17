# Dive, Laugh, Love — Browser Edition

A lightweight, framework-free HTML5 implementation of the
Inspired by [Deep Sea Adventure](https://oinkgames.com/en/games/analog/deep-sea-adventure/)
board game by Oink Games.

## Quick Start

```bash
# Any static file server works. Examples:
npx serve .
# or
python3 -m http.server
```

Then open **http://localhost:3000** (or the port printed) in your browser.

> **Note:** The game uses ES modules, so you must serve the files via HTTP —
> opening `index.html` directly from the file system won't work in most browsers.

## How to Play

1. Enter 2–6 player names and click **Start Game**.
2. Each turn:
   - **Choose direction** — dive deeper or turn back toward the submarine.
   - **Roll dice** — two dice each showing 1–3. Movement is reduced by the number of chips you carry.
   - **Pick up / drop / skip** — grab the chip on your space, swap one, or pass.
3. The shared oxygen tank decreases each turn by the number of chips a player carries.
4. When oxygen reaches **0** or all players return to the submarine, the round ends.
   Divers still underwater **lose** all carried chips.
5. After **3 rounds**, the player with the highest total chip value wins.

## Project Structure

```
index.html            – entry page
src/
  main.js             – app bootstrap
  domain/             – pure game logic (no DOM)
    gameState.js      – state factory
    rules.js          – rule functions
    turnEngine.js     – turn/round progression
    scoring.js        – score helpers
  app/
    gameController.js – orchestrator / action dispatcher
  ui/
    renderBoard.js    – board rendering
    renderHud.js      – HUD / player panels / log
    bindControls.js   – action buttons
  infra/
    constants.js      – game constants
    rng.js            – dice helpers
    storage.js        – localStorage adapter
styles/               – CSS files
tests/
  domain.rules.test.js – deterministic rule tests
```

## Running Tests

```bash
node --experimental-vm-modules tests/domain.rules.test.js
```

## License

Fan project for educational purposes. Inspired by Deep Sea Adventure, which is © Oink Games.
