/**
 * Renders the board, dialogs, and score readouts.
 * User text is written with textContent or input.value, never innerHTML.
 */
import {
  LIMITS,
  categoryLabel,
  isReady,
  progressText,
  teamLabel,
} from './game.js';

const $ = (id) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
};

const app = $('app');
const board = $('board');
const grid = $('grid');
const teams = $('teams');
const clueTeams = $('clue-teams');
const status = $('status');
const titleInput = $('game-title');
const modeButton = $('mode-toggle');
const presentButton = $('present-toggle');
const fullscreenButton = $('fullscreen-toggle');
const editTools = $('edit-tools');
const adjustInput = $('score-step');
const warning = $('storage-warning');
const editor = $('editor');
const editorTitle = $('editor-title');
const editorQuestion = $('edit-question');
const editorAnswer = $('edit-answer');
const editorPlayed = $('edit-played');
const clueDialog = $('clue');
const clueHeading = $('clue-heading');
const clueText = $('clue-text');
const revealButton = $('reveal');
const revealHint = $('reveal-hint');
const answerWrap = $('answer-wrap');
const answerText = $('answer-text');
const awardHint = $('award-hint');

const coveredWhilePresenting = [...document.body.children].filter(
  (node) => node !== app && node.tagName !== 'SCRIPT',
);

const KIND_NOUN = {
  category: 'category',
  row: 'point row',
  team: 'team',
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

export function showWarning(message) {
  warning.hidden = false;
  warning.textContent = message;
}

export function hideWarning() {
  warning.hidden = true;
  warning.textContent = '';
}

export function isClueOpen() {
  return clueDialog.open;
}

export function isEditorOpen() {
  return editor.open;
}

export function closeClueDialog() {
  if (clueDialog.open) clueDialog.close();
}

export function closeEditorDialog() {
  if (editor.open) editor.close();
}

function applyPresenting(on) {
  app.classList.toggle('is-presenting', on);
  document.body.classList.toggle('is-presenting', on);
  for (const node of coveredWhilePresenting) node.inert = on;
}

export function syncFullscreenButton() {
  const active = Boolean(document.fullscreenElement);
  fullscreenButton.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
  fullscreenButton.hidden = document.fullscreenEnabled === false;
}

function syncChrome(state) {
  const editing = state.mode === 'edit';
  app.classList.toggle('is-editing', editing);
  document.body.classList.toggle('is-editing', editing);
  titleInput.value = state.title;
  titleInput.readOnly = !editing;
  modeButton.textContent = editing ? 'Play game' : 'Edit game';
  presentButton.textContent = state.presenting ? 'Exit presentation' : 'Present';
  modeButton.classList.toggle('primary', editing);
  presentButton.classList.toggle('primary', !editing);
  editTools.hidden = !editing;
  adjustInput.value = String(state.adjustBy);
  const trimmed = state.title.trim();
  document.title = trimmed ? `${trimmed} · Jeopardy Game` : 'Jeopardy Game';

  for (const kind of ['category', 'row', 'team']) {
    const count = kind === 'category'
      ? state.categories.length
      : kind === 'row'
        ? state.pointValues.length
        : state.teams.length;
    const add = editTools.querySelector(`[data-action="add-${kind}"]`);
    const remove = editTools.querySelector(`[data-action="remove-${kind}"]`);
    const noun = KIND_NOUN[kind];
    add.disabled = count >= LIMITS.maxCount;
    remove.disabled = count <= LIMITS.minCount;
    add.title = add.disabled ? `At most ${LIMITS.maxCount} ${noun}s` : '';
    remove.title = remove.disabled ? `Keep at least one ${noun}` : '';
  }
  applyPresenting(state.presenting);
}

function cellLabel(state, col, row, editing) {
  const clue = state.categories[col].clues[row];
  const parts = [`${categoryLabel(state, col)}, ${formatNumber(state.pointValues[row])} points`];
  if (editing) parts.push('edit question');
  else if (clue.played) parts.push('already played');
  else if (!isReady(clue)) parts.push('not ready');
  return parts.join(', ');
}

function renderGrid(state) {
  const editing = state.mode === 'edit';
  const columns = state.categories.length;
  grid.style.setProperty('--cols', String(columns));
  grid.style.setProperty('--rows', String(state.pointValues.length));
  grid.replaceChildren();

  if (editing) grid.append(element('div', 'Points', 'corner'));

  state.categories.forEach((category, col) => {
    const heading = element('div', '', 'category');
    if (editing) {
      const input = document.createElement('input');
      input.value = category.name;
      input.maxLength = LIMITS.categoryName;
      input.autocomplete = 'off';
      input.spellcheck = true;
      input.setAttribute('aria-label', `Category ${col + 1} name`);
      input.dataset.field = 'category';
      input.dataset.col = String(col);
      heading.append(input);
    } else {
      heading.append(element('span', categoryLabel(state, col), 'category-label'));
    }
    grid.append(heading);
  });

  state.pointValues.forEach((points, row) => {
    if (editing) {
      const wrap = element('div', '', 'points');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = String(LIMITS.maxPoints);
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = String(points);
      input.setAttribute('aria-label', `Points for row ${row + 1}`);
      input.dataset.field = 'points';
      input.dataset.row = String(row);
      wrap.append(input);
      grid.append(wrap);
    }

    state.categories.forEach((category, col) => {
      const clue = category.clues[row];
      const ready = isReady(clue);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      if (clue.played) button.classList.add('played');
      if (!ready) button.classList.add('incomplete');
      button.dataset.col = String(col);
      button.dataset.row = String(row);
      button.setAttribute('aria-label', cellLabel(state, col, row, editing));
      if (!editing && (clue.played || !ready)) button.disabled = true;
      button.append(element('span', formatNumber(points), 'value'));

      let detail = '';
      if (editing) {
        if (clue.question.trim() && !clue.answer.trim()) detail = 'Needs an answer';
        else detail = clue.question.trim() || 'Add a question';
      } else if (clue.played) {
        detail = 'Played';
      } else if (!ready) {
        detail = 'Not ready';
      }
      if (detail) button.append(element('small', detail, 'detail'));
      grid.append(button);
    });
  });
}

function scoreButton(index, direction, name) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'score-btn';
  button.dataset.teamIndex = String(index);
  button.dataset.delta = String(direction);
  button.textContent = direction < 0 ? '\u2212' : '+';
  button.setAttribute(
    'aria-label',
    `${direction < 0 ? 'Subtract points from' : 'Add points to'} ${name}`,
  );
  return button;
}

function renderTeamList(container, state, editable) {
  container.replaceChildren();
  state.teams.forEach((team, index) => {
    const card = element('div', '', 'team');
    const name = teamLabel(state, index);
    if (editable) {
      const input = document.createElement('input');
      input.value = team.name;
      input.maxLength = LIMITS.teamName;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', `Team ${index + 1} name`);
      input.dataset.field = 'team';
      input.dataset.teamIndex = String(index);
      card.append(input);
    } else {
      card.append(element('span', name, 'team-name'));
    }
    const controls = element('div', '', 'score-controls');
    controls.append(scoreButton(index, -1, name));
    const output = element('output', formatNumber(team.score), 'score');
    output.dataset.scoreFor = String(index);
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-label', `${name} score`);
    controls.append(output);
    controls.append(scoreButton(index, 1, name));
    card.append(controls);
    container.append(card);
  });
}

export function updateScores(state) {
  for (const output of document.querySelectorAll('[data-score-for]')) {
    const index = Number(output.dataset.scoreFor);
    const team = state.teams[index];
    if (team) output.textContent = formatNumber(team.score);
  }
}

export function updateStatus(state) {
  status.textContent = progressText(state);
}

export function updateRowPoints(state, row) {
  const points = state.pointValues[row];
  const label = formatNumber(points);
  for (const button of grid.querySelectorAll(`.cell[data-row="${row}"]`)) {
    const value = button.querySelector('.value');
    if (value) value.textContent = label;
    const col = Number(button.dataset.col);
    button.setAttribute('aria-label', cellLabel(state, col, row, state.mode === 'edit'));
  }
}

export function focusCell(col, row) {
  const cell = grid.querySelector(`.cell[data-col="${col}"][data-row="${row}"]`);
  if (cell && !cell.disabled) {
    cell.focus();
    return;
  }
  const fallback = grid.querySelector('.cell:not(:disabled)') || modeButton;
  fallback.focus();
}

export function render(state) {
  board.hidden = false;
  syncChrome(state);
  renderGrid(state);
  renderTeamList(teams, state, state.mode === 'edit');
  updateStatus(state);
}

export function paintClue(state) {
  const open = state.openClue;
  if (!open) return;
  const points = state.pointValues[open.rowIndex];
  const clue = state.categories[open.categoryIndex].clues[open.rowIndex];
  clueHeading.textContent = `${categoryLabel(state, open.categoryIndex)} · ${formatNumber(points)} points`;
  clueText.textContent = clue.question;
  answerText.textContent = clue.answer;
  revealHint.hidden = open.answerVisible;
  answerWrap.hidden = !open.answerVisible;
  revealButton.classList.toggle('is-revealed', open.answerVisible);
  awardHint.textContent = `Team buttons add or subtract ${formatNumber(points)} points.`;
  requestAnimationFrame(fitClueText);
}

/** Shrink the question and answer until they fit the overlay. */
export function fitClueText() {
  if (!clueDialog.open) return;
  const stage = clueDialog.querySelector('.clue-stage');
  if (!stage) return;
  const texts = [clueText, answerText];
  const max = Math.max(15, Math.min(56, Math.floor(Math.min(stage.clientWidth / 14, stage.clientHeight / 6))));
  const min = 11;
  const overflows = () => {
    if (stage.scrollHeight > stage.clientHeight + 1) return true;
    const limit = stage.getBoundingClientRect().bottom + 1;
    return texts.some((el) => !el.closest('[hidden]') && el.getBoundingClientRect().bottom > limit);
  };
  let low = min;
  let high = max;
  let best = min;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    for (const el of texts) el.style.fontSize = `${mid}px`;
    if (!overflows()) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  for (const el of texts) el.style.fontSize = `${best}px`;
}

window.addEventListener('resize', () => {
  if (clueDialog.open) fitClueText();
});

export function showClue(state) {
  paintClue(state);
  renderTeamList(clueTeams, state, false);
  if (!clueDialog.open) {
    clueDialog.showModal();
    revealButton.focus();
  }
}

export function showEditor(state, col, row) {
  const clue = state.categories[col].clues[row];
  editorTitle.textContent = `${categoryLabel(state, col)} · ${formatNumber(state.pointValues[row])} points`;
  editorQuestion.value = clue.question;
  editorAnswer.value = clue.answer;
  editorPlayed.checked = clue.played;
  if (!editor.open) editor.showModal();
  editorQuestion.focus();
}

export const nodes = {
  app,
  grid,
  editTools,
  titleInput,
  adjustInput,
  modeButton,
  presentButton,
  fullscreenButton,
  editor,
  editorQuestion,
  editorAnswer,
  editorPlayed,
  editorDone: $('edit-done'),
  clueDialog,
  revealButton,
  closeClue: $('close-clue'),
  restart: $('restart'),
  blank: $('blank'),
  example: $('example'),
};
