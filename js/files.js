/**
 * File names and JSON checks shared by Export/Import and Google Drive.
 * No network and no DOM, so the rules can be tested on their own.
 */
import { parseGame } from './game.js';

const INVALID_JSON = 'That file is not valid JSON.';
const INVALID_GAME = 'That file is not a Jeopardy game this app can open.';

export function fileNameFromTitle(title) {
  const withoutExtension = String(title ?? '').replace(/\.json\s*$/i, '');
  const cleaned = withoutExtension
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${cleaned || 'Jeopardy Game'}.json`;
}

/** Parse exported or Drive JSON into a game, or return a message and no game. */
export function parseGameText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { game: null, error: INVALID_GAME };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { game: null, error: INVALID_JSON };
  }
  const game = parseGame(data);
  if (!game) return { game: null, error: INVALID_GAME };
  return { game, error: '' };
}

export function serializeGame(game) {
  return JSON.stringify(game, null, 2);
}
