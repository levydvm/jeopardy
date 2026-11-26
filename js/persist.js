/**
 * One JSON blob in localStorage. Nothing is sent to a server.
 * Bump the key (and game.js version) together when a saved game
 * can no longer be read by parseGame.
 */
import { parseGame } from './game.js';

export const STORAGE_KEY = 'jeopardy-game-v1';

export function loadSavedGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { available: true, game: null, invalid: false };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { available: true, game: null, invalid: true };
    }
    const game = parseGame(parsed);
    if (!game) return { available: true, game: null, invalid: true };
    return { available: true, game, invalid: false };
  } catch {
    return { available: false, game: null, invalid: false };
  }
}

export function saveGame(game) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}
