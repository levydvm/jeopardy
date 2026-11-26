# Jeopardy Game

A customizable, playable Jeopardy-style quiz board that runs entirely in the browser. One person hosts on a shared screen: teams pick a category and a point value, the host reveals the question and then the answer, and scores are awarded by hand. There is no account, no server, and no build step.

This is an independent quiz tool. It is not affiliated with, sponsored by, or endorsed by the Jeopardy television show or its owners. Jeopardy is a trademark of its owner. This project does not use the Jeopardy logo.

## Play

1. Open the site. A finished 5×5 general-knowledge game is already loaded, in edit mode so you can see every question.
2. Name your teams, then choose **Play game**.
3. Click a point value to show the question. Click it again, or press Enter, to show the answer. The game does not judge answers for you.
4. Use a team’s **+** or **−** to add or subtract that question’s points. Scores can go below zero.
5. Choose **Back to grid · mark played**. The square turns grey. Escape does the same thing.
6. On the grid, set **Adjust by** and use **+** / **−** to change a score by that amount — a bonus, a correction, or a penalty you choose.
7. Choose **Present** to fill the window for a projector or TV. Team scores stay visible while a question is open. **Fullscreen** hides the browser toolbar. **Exit presentation**, or Escape when no question is open, returns to the page.

Only squares with both a question and an answer can be played. Squares that are not ready stay on the board and cannot be opened. The line under the board shows how many questions are ready (while editing) or how many are left (while playing).

Arrow keys move between squares.

## Edit

Choose **Edit game**.

- Rename the game title, each category, and each team. Changes save as you type.
- Change the point value at the start of any row.
- Click a square to edit its question and answer. Check **Already played** to make the board skip it. Ctrl+Enter or Cmd+Enter closes the editor.
- **+ Category**, **− Last category**, **+ Point row**, and **− Last row** resize the grid, up to 8 of each. Removing a category or a point row deletes its questions and asks you to confirm first.
- **+ Team** and **− Last team** change the teams. Removing a team deletes its name and score and asks you to confirm.

**Restart game** clears played squares and sets every score to zero. Questions, categories, point values, and team names stay.

**New blank game** replaces the board with an empty grid of the same shape. **Load example** puts the general-knowledge game back. Each of these asks you to confirm.

## Saving

The game is stored in this browser with `localStorage` (key `jeopardy-game-v1`). That includes questions, categories, point values, team names and scores, played squares, and a question you still have open. Refresh the page and it comes back.

Nothing is sent to a server. After the page has loaded, the controls work offline. Clearing site data, using a private window, or blocking storage can erase the game or prevent saving. If saving is blocked, a warning appears on the board. Keep your own copy of any questions you cannot afford to lose.

Use one tab. Two open tabs can overwrite each other.

## Local preview

The scripts are ES modules, so open the site through a static server rather than by double-clicking `index.html` (browsers block modules on `file://` URLs).

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

## GitHub Pages

The site is static files at the repository root (`index.html`, `styles.css`, `favicon.svg`, and `js/`). No build step is required.

1. Push the `main` branch.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to **`/ (root)`**.
5. Save. The game is served from the Pages URL for this repository.

Paths in the page are relative, so the site works when Pages serves it from either a user site or a project site. A `.nojekyll` file is included so Pages serves these files as-is.

## Project layout

- `index.html` — page structure
- `styles.css` — board, editor, and presentation styles
- `js/sample.js` — the built-in example questions
- `js/game.js` — rules and game state (add new actions here)
- `js/persist.js` — `localStorage` load and save
- `js/ui.js` — rendering
- `js/main.js` — connects the controls to the game
