/**
 * Sound effects using the Web Audio API — no external files needed.
 * Each function plays a short synthesized sound.
 */

let ctx = null;

const getCtx = () => {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
};

/* ── helpers ──────────────────────────────────────────────── */

const playTone = (freq, duration, type = 'sine', gain = 0.25) => {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
};

const playNoise = (duration, gain = 0.15) => {
  const c = getCtx();
  const bufSize = c.sampleRate * duration;
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  src.connect(g).connect(c.destination);
  src.start();
};

/* ── public sound effects ─────────────────────────────────── */

/** Dice roll — short rattle. */
export const sfxDiceRoll = () => {
  const c = getCtx();
  for (let i = 0; i < 6; i++) {
    setTimeout(() => playNoise(0.04, 0.2), i * 35);
  }
  // Final "land" click
  setTimeout(() => playTone(800, 0.08, 'square', 0.15), 230);
};

/** Player moves — quick ascending bloop. */
export const sfxMove = () => {
  playTone(330, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(440, 0.1, 'sine', 0.2), 60);
};

/** Player returns to submarine — cheerful rising arpeggio. */
export const sfxReturnToSub = () => {
  [523, 659, 784].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, 'sine', 0.2), i * 80);
  });
};

/** Pick up a chip — shiny sparkle. */
export const sfxPickup = () => {
  playTone(880, 0.12, 'sine', 0.2);
  setTimeout(() => playTone(1320, 0.15, 'sine', 0.15), 70);
};

/** Drop a chip — low thud. */
export const sfxDrop = () => {
  playTone(180, 0.15, 'triangle', 0.25);
};

/** Trident attack — dramatic stab. */
export const sfxTridentAttack = () => {
  playTone(200, 0.06, 'sawtooth', 0.3);
  setTimeout(() => playTone(600, 0.12, 'sawtooth', 0.2), 50);
  setTimeout(() => playNoise(0.15, 0.2), 100);
};

/** Trident kill — dark crash. */
export const sfxTridentKill = () => {
  playNoise(0.3, 0.3);
  playTone(120, 0.4, 'sawtooth', 0.25);
  setTimeout(() => playTone(80, 0.3, 'sawtooth', 0.2), 200);
};

/** Trident backfire — descending doom. */
export const sfxTridentBackfire = () => {
  playTone(500, 0.15, 'sawtooth', 0.25);
  setTimeout(() => playTone(250, 0.2, 'sawtooth', 0.25), 100);
  setTimeout(() => playTone(100, 0.3, 'sawtooth', 0.2), 200);
};

/** Trident miss — whiff. */
export const sfxTridentMiss = () => {
  playTone(400, 0.08, 'triangle', 0.15);
  setTimeout(() => playTone(300, 0.1, 'triangle', 0.1), 60);
};

/** Oxygen warning — low bubble. */
export const sfxOxygenLow = () => {
  playTone(220, 0.2, 'sine', 0.15);
  setTimeout(() => playTone(180, 0.25, 'sine', 0.12), 150);
};

/** Round end — deep horn. */
export const sfxRoundEnd = () => {
  playTone(130, 0.5, 'sawtooth', 0.15);
  setTimeout(() => playTone(165, 0.5, 'sawtooth', 0.12), 300);
};

/** Game over — fanfare. */
export const sfxGameOver = () => {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.3, 'sine', 0.2), i * 150);
  });
};

/** Depth Charge — deep explosion with rumble. */
export const sfxDepthCharge = () => {
  const c = getCtx();
  // Initial blast — loud noise burst
  playNoise(0.15, 0.4);
  // Deep boom
  playTone(60, 0.5, 'sawtooth', 0.35);
  // Secondary rumble crackle
  setTimeout(() => {
    playNoise(0.25, 0.25);
    playTone(45, 0.6, 'sawtooth', 0.2);
  }, 100);
  // Debris rattle
  setTimeout(() => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => playNoise(0.03, 0.12), i * 40);
    }
  }, 250);
  // Fading low rumble
  setTimeout(() => playTone(35, 0.8, 'sawtooth', 0.1), 400);
};

/** Anchor Boost — heavy chain rattle then deep splash. */
export const sfxAnchor = () => {
  // Chain rattle
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      playTone(300 + Math.random() * 200, 0.04, 'square', 0.12);
      playNoise(0.03, 0.08);
    }, i * 45);
  }
  // Heavy metallic clank
  setTimeout(() => playTone(150, 0.15, 'sawtooth', 0.25), 350);
  // Water splash
  setTimeout(() => {
    playNoise(0.3, 0.2);
    playTone(100, 0.3, 'sine', 0.15);
  }, 450);
  // Deep sinking rumble
  setTimeout(() => playTone(55, 0.6, 'sine', 0.12), 600);
};

/** Button click — subtle tick. */
export const sfxClick = () => {
  playTone(660, 0.04, 'square', 0.08);
};
