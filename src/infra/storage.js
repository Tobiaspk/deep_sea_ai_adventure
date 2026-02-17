/** Lightweight localStorage adapter for optional save/load. */

const STORAGE_KEY = 'dive_laugh_love_save';

export const saveGame = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* silently ignore */ }
};

export const loadGame = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearSave = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* silently ignore */ }
};
