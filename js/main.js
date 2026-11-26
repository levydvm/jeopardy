/**
 * Wires the page to the game. New controls should call a game.js action,
 * persist(), then refresh only the part of the view that changed.
 */
import {
  addCategory,
  addRow,
  addTeam,
  changeScore,
  createGame,
  finishClue,
  openClue,
  removeLastCategory,
  removeLastRow,
  removeLastTeam,
  renameCategory,
  renameTeam,
  restartGame,
  revealAnswer,
  setAdjustBy,
  setMode,
  setPointValue,
  setPresenting,
  setTitle,
  updateClue,
} from './game.js';
import { clearLinkedDriveFile, initLibrary } from './library.js';
import { loadSavedGame, saveGame } from './persist.js';
import {
  closeClueDialog,
  closeEditorDialog,
  focusCell,
  hideWarning,
  isClueOpen,
  isEditorOpen,
  nodes,
  paintClue,
  render,
  showClue,
  showEditor,
  showWarning,
  syncFullscreenButton,
  updateRowPoints,
  updateScores,
  updateStatus,
} from './ui.js';

const BLOCKED_MESSAGE =
  'This browser could not save your game. Keep this tab open — a refresh or a closed tab may lose your changes.';
const INVALID_MESSAGE =
  'Your saved game could not be loaded. The example is open, and new changes will try to save again.';

const REMOVE_COPY = {
  category: 'Remove the last category? Its questions will be deleted.',
  row: 'Remove the last point row? Its questions will be deleted.',
  team: 'Remove the last team? Its name and score will be deleted.',
};

const ADD = {
  category: addCategory,
  row: addRow,
  team: addTeam,
};

const REMOVE = {
  category: removeLastCategory,
  row: removeLastRow,
  team: removeLastTeam,
};

let state;
let editing = null;
let warningReason = null;

function noteWarning(reason, message) {
  warningReason = reason;
  showWarning(message);
}

function persist() {
  if (saveGame(state)) {
    if (warningReason === 'blocked') {
      warningReason = null;
      hideWarning();
    }
    return;
  }
  noteWarning('blocked', BLOCKED_MESSAGE);
}

function replaceGame(next) {
  const wasPresenting = state.presenting;
  editing = null;
  closeEditorDialog();
  closeClueDialog();
  state = next;
  clearLinkedDriveFile();
  persist();
  render(state);
  releaseFullscreen(wasPresenting);
}

function leaveEditor() {
  const current = editing;
  editing = null;
  closeEditorDialog();
  render(state);
  if (current) focusCell(current.col, current.row);
}

function leaveClue() {
  if (!state.openClue) {
    closeClueDialog();
    return;
  }
  const { categoryIndex, rowIndex } = state.openClue;
  finishClue(state);
  persist();
  closeClueDialog();
  render(state);
  focusCell(categoryIndex, rowIndex);
}

function releaseFullscreen(wasPresenting) {
  if (wasPresenting && !state.presenting && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function exitPresentation() {
  if (!state.presenting) return;
  setPresenting(state, false);
  persist();
  render(state);
  releaseFullscreen(true);
  nodes.presentButton.focus();
}

function onTitleInput() {
  setTitle(state, nodes.titleInput.value);
  persist();
  const trimmed = state.title.trim();
  document.title = trimmed ? `${trimmed} · Jeopardy Game` : 'Jeopardy Game';
}

function onAdjustInput() {
  if (setAdjustBy(state, nodes.adjustInput.valueAsNumber)) persist();
}

function onFieldInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.field === 'category') {
    renameCategory(state, Number(target.dataset.col), target.value);
    persist();
  } else if (target.dataset.field === 'team') {
    renameTeam(state, Number(target.dataset.teamIndex), target.value);
    persist();
  } else if (target.dataset.field === 'points') {
    const row = Number(target.dataset.row);
    if (setPointValue(state, row, target.valueAsNumber)) {
      persist();
      updateRowPoints(state, row);
    }
  }
}

function onFieldChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.field === 'points') {
    const row = Number(target.dataset.row);
    target.value = String(state.pointValues[row]);
  }
}

function onGridClick(event) {
  const cell = event.target.closest('.cell');
  if (!cell || cell.disabled) return;
  const col = Number(cell.dataset.col);
  const row = Number(cell.dataset.row);
  if (state.mode === 'edit') {
    editing = { col, row };
    showEditor(state, col, row);
    return;
  }
  if (!openClue(state, col, row)) return;
  persist();
  showClue(state);
}

function onGridKeydown(event) {
  const moves = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const move = moves[event.key];
  if (!move) return;
  const current = event.target.closest('.cell');
  if (!current) return;
  event.preventDefault();
  let col = Number(current.dataset.col) + move[0];
  let row = Number(current.dataset.row) + move[1];
  const lastCol = state.categories.length - 1;
  const lastRow = state.pointValues.length - 1;
  while (col >= 0 && row >= 0 && col <= lastCol && row <= lastRow) {
    const next = nodes.grid.querySelector(`.cell[data-col="${col}"][data-row="${row}"]`);
    if (next && !next.disabled) {
      next.focus();
      return;
    }
    col += move[0];
    row += move[1];
  }
}

function onStructureClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const [action, kind] = button.dataset.action.split('-');
  const run = action === 'add' ? ADD[kind] : REMOVE[kind];
  if (!run) return;
  if (action === 'remove' && !window.confirm(REMOVE_COPY[kind])) return;
  if (!run(state)) return;
  persist();
  render(state);
}

function onScoreClick(event) {
  const button = event.target.closest('[data-delta]');
  if (!button) return;
  const direction = Number(button.dataset.delta) < 0 ? -1 : 1;
  if (!changeScore(state, Number(button.dataset.teamIndex), direction)) return;
  persist();
  updateScores(state);
}

function onReveal() {
  if (!revealAnswer(state)) return;
  persist();
  paintClue(state);
}

function onMode() {
  if (isClueOpen() || isEditorOpen()) return;
  const wasPresenting = state.presenting;
  setMode(state, state.mode === 'edit' ? 'play' : 'edit');
  persist();
  render(state);
  releaseFullscreen(wasPresenting);
  nodes.modeButton.focus();
}

function onPresent() {
  if (isEditorOpen()) return;
  if (state.presenting) {
    exitPresentation();
    return;
  }
  setPresenting(state, true);
  persist();
  render(state);
  if (state.openClue) showClue(state);
  nodes.presentButton.focus();
}

async function onFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    // Fullscreen can be refused without a user gesture or in a blocked iframe.
  }
}

function onRestart() {
  if (isClueOpen() || isEditorOpen()) return;
  const ok = window.confirm(
    'Restart this game? Played squares will clear and scores will reset to zero. Questions, categories, point values, and team names will stay.',
  );
  if (!ok) return;
  restartGame(state);
  persist();
  render(state);
}

function onBlank() {
  if (isClueOpen() || isEditorOpen()) return;
  const ok = window.confirm(
    'Replace this game with a blank game? Your current questions and scores will be deleted.',
  );
  if (!ok) return;
  replaceGame(createGame(true));
}

function onExample() {
  if (isClueOpen() || isEditorOpen()) return;
  const ok = window.confirm(
    'Replace this game with the example? Your current questions and scores will be deleted.',
  );
  if (!ok) return;
  replaceGame(createGame(false));
}

function onEditorQuestion() {
  if (!editing) return;
  updateClue(state, editing.col, editing.row, { question: nodes.editorQuestion.value });
  persist();
  updateStatus(state);
}

function onEditorAnswer() {
  if (!editing) return;
  updateClue(state, editing.col, editing.row, { answer: nodes.editorAnswer.value });
  persist();
  updateStatus(state);
}

function onEditorPlayed() {
  if (!editing) return;
  updateClue(state, editing.col, editing.row, { played: nodes.editorPlayed.checked });
  persist();
}

function onEscape(event) {
  if (event.key !== 'Escape') return;
  if (nodes.editor.open || nodes.clueDialog.open) return;
  if (state.presenting) exitPresentation();
}

function onClueKeydown(event) {
  if (event.key !== 'Enter' || !state.openClue || state.openClue.answerVisible) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('button') && target.id !== 'reveal') return;
  event.preventDefault();
  onReveal();
}

function onEditorKeydown(event) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    leaveEditor();
  }
}

function onWheel(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === 'number' && document.activeElement === target) {
    event.preventDefault();
  }
}

function bind() {
  nodes.titleInput.addEventListener('input', onTitleInput);
  nodes.adjustInput.addEventListener('input', onAdjustInput);
  nodes.adjustInput.addEventListener('change', () => {
    nodes.adjustInput.value = String(state.adjustBy);
  });
  nodes.app.addEventListener('input', onFieldInput);
  nodes.app.addEventListener('change', onFieldChange);
  nodes.app.addEventListener('wheel', onWheel, { passive: false });
  nodes.grid.addEventListener('click', onGridClick);
  nodes.grid.addEventListener('keydown', onGridKeydown);
  nodes.editTools.addEventListener('click', onStructureClick);
  document.addEventListener('click', onScoreClick);
  nodes.revealButton.addEventListener('click', onReveal);
  nodes.closeClue.addEventListener('click', leaveClue);
  nodes.modeButton.addEventListener('click', onMode);
  nodes.presentButton.addEventListener('click', onPresent);
  nodes.fullscreenButton.addEventListener('click', onFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreenButton);
  nodes.restart.addEventListener('click', onRestart);
  nodes.blank.addEventListener('click', onBlank);
  nodes.example.addEventListener('click', onExample);
  nodes.editorDone.addEventListener('click', leaveEditor);
  nodes.editorQuestion.addEventListener('input', onEditorQuestion);
  nodes.editorAnswer.addEventListener('input', onEditorAnswer);
  nodes.editorPlayed.addEventListener('change', onEditorPlayed);
  nodes.editor.addEventListener('cancel', (event) => {
    event.preventDefault();
    leaveEditor();
  });
  nodes.clueDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    leaveClue();
  });
  nodes.clueDialog.addEventListener('keydown', onClueKeydown);
  nodes.editor.addEventListener('keydown', onEditorKeydown);
  document.addEventListener('keydown', onEscape);
}

function boot() {
  const loaded = loadSavedGame();
  if (!loaded.available) {
    state = createGame(false);
    noteWarning('blocked', BLOCKED_MESSAGE);
  } else if (loaded.invalid) {
    state = createGame(false);
    clearLinkedDriveFile();
    noteWarning('invalid', INVALID_MESSAGE);
  } else {
    state = loaded.game ?? createGame(false);
  }

  bind();
  render(state);
  initLibrary({
    getState: () => state,
    replaceGame,
  });
  syncFullscreenButton();
  if (state.openClue) showClue(state);
  persist();
}

boot();
