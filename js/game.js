/**
 * Rules and game state. The page keeps one mutable state object and saves it
 * after each change. Add a feature by extending the state shape, parseGame,
 * and a function here — the view only renders what these functions describe.
 *
 * State shape (version 1):
 * {
 *   version, title, pointValues: number[],
 *   categories: [{ name, clues: [{ question, answer, played, dailyDouble }] }],
 *   teams: [{ name, score }],
 *   mode: 'edit' | 'play',
 *   openClue: null | { categoryIndex, rowIndex, answerVisible, stage, wagerTeam, wagerAmount },
 *   presenting: boolean,
 *   adjustBy: number
 * }
 */
import { SAMPLE_CATEGORIES, SAMPLE_TITLE } from './sample.js';

export const LIMITS = {
  version: 1,
  minCount: 1,
  maxCount: 8,
  maxPoints: 100000,
  maxScore: 1000000000,
  title: 100,
  categoryName: 60,
  teamName: 40,
  clue: 2000,
};

const rowCount = SAMPLE_CATEGORIES[0]?.clues.length ?? 0;
if (
  rowCount < 1 ||
  SAMPLE_CATEGORIES.some((category) => category.clues.length !== rowCount)
) {
  throw new Error('Sample categories must share one non-empty clue list');
}

function emptyClue() {
  return { question: '', answer: '', played: false, dailyDouble: false };
}

function defaultPoints(count) {
  return Array.from({ length: count }, (_, index) =>
    Math.min(LIMITS.maxPoints, (index + 1) * 100),
  );
}

/** Fresh example game, or the same grid with empty questions. */
export function createGame(blank = false) {
  return {
    version: LIMITS.version,
    title: blank ? 'My game' : SAMPLE_TITLE,
    pointValues: defaultPoints(rowCount),
    categories: SAMPLE_CATEGORIES.map((category, index) => ({
      name: blank ? `Category ${index + 1}` : category.name,
      clues: category.clues.map((clue) =>
        blank
          ? emptyClue()
          : {
            question: clue.question,
            answer: clue.answer,
            played: false,
            dailyDouble: clue.dailyDouble === true,
          },
      ),
    })),
    teams: [
      { name: 'Team 1', score: 0 },
      { name: 'Team 2', score: 0 },
    ],
    mode: 'edit',
    openClue: null,
    presenting: false,
    adjustBy: 100,
  };
}

export function isReady(clue) {
  return clue.question.trim() !== '' && clue.answer.trim() !== '';
}

export function categoryLabel(state, index) {
  const name = state.categories[index]?.name.trim() ?? '';
  return name || `Category ${index + 1}`;
}

export function teamLabel(state, index) {
  const name = state.teams[index]?.name.trim() ?? '';
  return name || `Team ${index + 1}`;
}

export function progressText(state) {
  const clues = state.categories.flatMap((category) => category.clues);
  const ready = clues.filter(isReady);
  if (state.mode === 'edit') {
    return `${ready.length} of ${clues.length} questions ready. Each needs a question and an answer.`;
  }
  const left = ready.filter((clue) => !clue.played).length;
  if (left === 1) return '1 question left. Pick a category and point value.';
  if (left > 1) return `${left} questions left. Pick a category and point value.`;
  if (ready.length > 0) return 'Game complete. Restart to play these questions again.';
  return 'No questions ready yet. Choose Edit game to add a question and an answer.';
}

/** True when a saved clue omitted dailyDouble, which older games do. */
export function readDailyDouble(clue) {
  if (!clue || clue.dailyDouble === undefined) return false;
  return clue.dailyDouble === true ? true : clue.dailyDouble === false ? false : null;
}

export const DAILY_DOUBLE_MINIMUM = 5;

export function boardMaxValue(state) {
  return state.pointValues.reduce((highest, value) => Math.max(highest, value), 0);
}

/** Greater of this team's score and the highest clue value on the board. */
export function wagerLimit(state, teamIndex) {
  const score = state.teams[teamIndex]?.score ?? 0;
  return Math.max(score, boardMaxValue(state));
}

export function minimumWager(state, teamIndex) {
  const maximum = wagerLimit(state, teamIndex);
  return maximum >= DAILY_DOUBLE_MINIMUM ? DAILY_DOUBLE_MINIMUM : maximum;
}

export function isValidWager(state, teamIndex, amount) {
  if (!Number.isInteger(amount) || !state.teams[teamIndex]) return false;
  return amount >= minimumWager(state, teamIndex) && amount <= wagerLimit(state, teamIndex);
}

/** Points added or removed by the team buttons right now. */
export function activePointValue(state) {
  if (state.openClue?.wagerAmount != null) return state.openClue.wagerAmount;
  if (state.openClue) return state.pointValues[state.openClue.rowIndex];
  return state.adjustBy;
}

function isString(value, max) {
  return typeof value === 'string' && value.length <= max;
}

function isInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isList(value) {
  return Array.isArray(value) && value.length >= LIMITS.minCount && value.length <= LIMITS.maxCount;
}

/** Return a clean state object, or null when saved data cannot be trusted. */
export function parseGame(input) {
  if (!input || typeof input !== 'object' || input.version !== LIMITS.version) return null;
  if (!isString(input.title, LIMITS.title)) return null;
  if (!isList(input.pointValues) || !input.pointValues.every((value) => isInt(value, 1, LIMITS.maxPoints))) {
    return null;
  }
  if (!isList(input.categories)) return null;
  const rows = input.pointValues.length;
  for (const category of input.categories) {
    if (!category || !isString(category.name, LIMITS.categoryName) || !Array.isArray(category.clues)) {
      return null;
    }
    if (category.clues.length !== rows) return null;
    for (const clue of category.clues) {
      const dailyDouble = readDailyDouble(clue);
      if (
        !clue ||
        !isString(clue.question, LIMITS.clue) ||
        !isString(clue.answer, LIMITS.clue) ||
        typeof clue.played !== 'boolean' ||
        dailyDouble === null
      ) {
        return null;
      }
    }
  }
  if (!isList(input.teams)) return null;
  for (const team of input.teams) {
    if (!team || !isString(team.name, LIMITS.teamName) || !isInt(team.score, -LIMITS.maxScore, LIMITS.maxScore)) {
      return null;
    }
  }
  if (input.mode !== 'edit' && input.mode !== 'play') return null;
  if (typeof input.presenting !== 'boolean' || (input.presenting && input.mode !== 'play')) return null;
  if (!isInt(input.adjustBy, 1, LIMITS.maxPoints)) return null;

  let openClue = null;
  if (input.openClue !== null) {
    const open = input.openClue;
    const stage = open?.stage === undefined ? 'clue' : open.stage;
    if (
      !open ||
      input.mode !== 'play' ||
      !isInt(open.categoryIndex, 0, input.categories.length - 1) ||
      !isInt(open.rowIndex, 0, rows - 1) ||
      typeof open.answerVisible !== 'boolean' ||
      (stage !== 'announce' && stage !== 'wager' && stage !== 'clue')
    ) {
      return null;
    }
    const clue = input.categories[open.categoryIndex].clues[open.rowIndex];
    if (clue.played || !isReady(clue)) return null;
    const dailyDouble = readDailyDouble(clue) === true;
    if ((stage === 'announce' || stage === 'wager') && !dailyDouble) return null;
    let wagerTeam = open.wagerTeam === undefined ? null : open.wagerTeam;
    let wagerAmount = open.wagerAmount === undefined ? null : open.wagerAmount;
    if (wagerTeam !== null && !isInt(wagerTeam, 0, input.teams.length - 1)) return null;
    if (wagerAmount !== null && !isInt(wagerAmount, 1, LIMITS.maxScore)) return null;
    if (!dailyDouble || stage !== 'clue') {
      if (stage !== 'wager') wagerTeam = null;
      wagerAmount = null;
    }
    openClue = {
      categoryIndex: open.categoryIndex,
      rowIndex: open.rowIndex,
      answerVisible: stage === 'clue' ? open.answerVisible : false,
      stage,
      wagerTeam,
      wagerAmount,
    };
  }

  return {
    version: LIMITS.version,
    title: input.title,
    pointValues: input.pointValues.slice(),
    categories: input.categories.map((category) => ({
      name: category.name,
      clues: category.clues.map((clue) => ({
        question: clue.question,
        answer: clue.answer,
        played: clue.played,
        dailyDouble: readDailyDouble(clue) === true,
      })),
    })),
    teams: input.teams.map((team) => ({ name: team.name, score: team.score })),
    mode: input.mode,
    openClue,
    presenting: input.presenting,
    adjustBy: input.adjustBy,
  };
}

export function setTitle(state, title) {
  state.title = String(title).slice(0, LIMITS.title);
}

export function renameCategory(state, index, name) {
  const category = state.categories[index];
  if (!category) return;
  category.name = String(name).slice(0, LIMITS.categoryName);
}

export function renameTeam(state, index, name) {
  const team = state.teams[index];
  if (!team) return;
  team.name = String(name).slice(0, LIMITS.teamName);
}

export function setPointValue(state, row, value) {
  if (!isInt(value, 1, LIMITS.maxPoints)) return false;
  if (!Number.isInteger(row) || row < 0 || row >= state.pointValues.length) return false;
  state.pointValues[row] = value;
  return true;
}

export function setAdjustBy(state, value) {
  if (!isInt(value, 1, LIMITS.maxPoints)) return false;
  state.adjustBy = value;
  return true;
}

export function updateClue(state, col, row, patch) {
  const clue = state.categories[col]?.clues[row];
  if (!clue) return false;
  if (typeof patch.question === 'string') clue.question = patch.question.slice(0, LIMITS.clue);
  if (typeof patch.answer === 'string') clue.answer = patch.answer.slice(0, LIMITS.clue);
  if (typeof patch.played === 'boolean') clue.played = patch.played;
  if (typeof patch.dailyDouble === 'boolean') clue.dailyDouble = patch.dailyDouble;
  return true;
}

export function setMode(state, mode) {
  if (mode !== 'edit' && mode !== 'play') return;
  state.mode = mode;
  if (mode === 'edit') state.presenting = false;
}

export function setPresenting(state, presenting) {
  state.presenting = Boolean(presenting);
  if (state.presenting) state.mode = 'play';
}

export function openClue(state, categoryIndex, rowIndex) {
  if (state.mode !== 'play' || state.openClue) return false;
  const clue = state.categories[categoryIndex]?.clues[rowIndex];
  if (!clue || clue.played || !isReady(clue)) return false;
  state.openClue = {
    categoryIndex,
    rowIndex,
    answerVisible: false,
    stage: clue.dailyDouble ? 'announce' : 'clue',
    wagerTeam: null,
    wagerAmount: null,
  };
  return true;
}

export function beginWager(state) {
  if (state.openClue?.stage !== 'announce') return false;
  state.openClue.stage = 'wager';
  state.openClue.wagerTeam = state.teams.length ? 0 : null;
  return true;
}

export function chooseWagerTeam(state, teamIndex) {
  if (state.openClue?.stage !== 'wager' || !state.teams[teamIndex]) return false;
  state.openClue.wagerTeam = teamIndex;
  return true;
}

export function commitWager(state, amount) {
  const open = state.openClue;
  if (!open || open.stage !== 'wager' || open.wagerTeam == null) return false;
  if (!isValidWager(state, open.wagerTeam, amount)) return false;
  open.wagerAmount = amount;
  open.stage = 'clue';
  return true;
}

export function revealAnswer(state) {
  if (!state.openClue || state.openClue.answerVisible) return false;
  if (state.openClue.stage && state.openClue.stage !== 'clue') return false;
  state.openClue.answerVisible = true;
  return true;
}

/** Closing a clue marks that square played and returns to the grid. */
export function finishClue(state) {
  const open = state.openClue;
  if (!open) return;
  const clue = state.categories[open.categoryIndex]?.clues[open.rowIndex];
  if (clue) clue.played = true;
  state.openClue = null;
}

export function changeScore(state, teamIndex, direction) {
  const team = state.teams[teamIndex];
  if (!team || (direction !== 1 && direction !== -1)) return false;
  const open = state.openClue;
  if (open?.stage === 'clue' && open.wagerAmount != null && teamIndex !== open.wagerTeam) return false;
  const next = team.score + direction * activePointValue(state);
  const clamped = Math.max(-LIMITS.maxScore, Math.min(LIMITS.maxScore, next));
  if (clamped === team.score) return false;
  team.score = clamped;
  return true;
}

export function restartGame(state) {
  for (const category of state.categories) {
    for (const clue of category.clues) clue.played = false;
  }
  for (const team of state.teams) team.score = 0;
  state.openClue = null;
}

function countFor(state, kind) {
  if (kind === 'category') return state.categories.length;
  if (kind === 'row') return state.pointValues.length;
  if (kind === 'team') return state.teams.length;
  return 0;
}

export function canAdd(state, kind) {
  return countFor(state, kind) < LIMITS.maxCount;
}

export function canRemove(state, kind) {
  return countFor(state, kind) > LIMITS.minCount;
}

export function addCategory(state) {
  if (!canAdd(state, 'category')) return false;
  state.categories.push({
    name: `Category ${state.categories.length + 1}`,
    clues: state.pointValues.map(() => emptyClue()),
  });
  return true;
}

export function removeLastCategory(state) {
  if (!canRemove(state, 'category')) return false;
  state.categories.pop();
  return true;
}

export function addRow(state) {
  if (!canAdd(state, 'row')) return false;
  const last = state.pointValues[state.pointValues.length - 1];
  state.pointValues.push(Math.min(LIMITS.maxPoints, last + 100));
  for (const category of state.categories) category.clues.push(emptyClue());
  return true;
}

export function removeLastRow(state) {
  if (!canRemove(state, 'row')) return false;
  state.pointValues.pop();
  for (const category of state.categories) category.clues.pop();
  return true;
}

export function addTeam(state) {
  if (!canAdd(state, 'team')) return false;
  state.teams.push({ name: `Team ${state.teams.length + 1}`, score: 0 });
  return true;
}

export function removeLastTeam(state) {
  if (!canRemove(state, 'team')) return false;
  state.teams.pop();
  return true;
}
