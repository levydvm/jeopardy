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
7. Choose **Present** to fill the window for a projector or TV. The whole board stays on screen in play and present, including on a small or narrow window; edit mode can still scroll. Team scores stay visible while a question is open. **Fullscreen** hides the browser toolbar. **Exit presentation**, or Escape when no question is open, returns to the page.

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

## Saving on this device

The game is stored in this browser with `localStorage` (key `jeopardy-game-v1`). That includes questions, categories, point values, team names and scores, played squares, and a question you still have open. Refresh the page and it comes back. This still happens when Google sign-in is turned off, and it still happens while you are signed in.

Clearing site data, using a private window, or blocking storage can erase the game or prevent saving. If saving is blocked, a warning appears on the board. Use one tab. Two open tabs can overwrite each other.

**Export JSON** downloads the current game. **Import JSON** loads a file that was exported from this app. Import asks before it replaces the game on screen, and it rejects a file that is not valid JSON or not a game this version can read.

## Google Drive

Sign-in is optional. Until a Client ID is set, the Google buttons stay hidden and a short note explains that. Export and Import keep working.

When you are signed in:

- **Save to Drive** puts the current game in a folder named **Jeopardy Games**, creating that folder the first time. The file name starts from the game title, and you can edit it. Saving again updates that same file. **Save as new** adds another file and leaves the previous one alone.
- **Open from Drive** lists the games in that folder with the name and the date they were last changed. Choosing one asks before it replaces the game on screen. **Delete** asks before it removes a file.
- **Sign out** drops the Google session in this tab. The game on screen stays, still saved in this browser.

The only Drive scope is `https://www.googleapis.com/auth/drive.file`. The app can only see files it created. `openid`, `userinfo.email`, and `userinfo.profile` are requested as well so the page can show the signed-in name and email. There is no backend and no client secret. If the access token expires, the next save or open asks Google for a new one.

### Turn on Google sign-in

The Client ID goes in `js/config.js`, on this line:

```javascript
export const GOOGLE_CLIENT_ID = '';
```

Paste the ID between the quotes. A Client ID is public and safe to commit. Do not create a client secret for this app.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project, or select one. The name can be anything, for example `Jeopardy Game`.
3. Open **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.
4. Open **APIs & Services → OAuth consent screen**.
   - Choose **External**.
   - Fill in the app name and a support email.
   - Leave the publishing status in **Testing**.
   - Under **Test users**, add the Google account you will sign in with. In testing mode, only those accounts can sign in.
   - If the screen asks for scopes, add `https://www.googleapis.com/auth/drive.file`, `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile`.
5. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, add:
     - `https://levydvm.github.io`
     - `http://localhost:8000`
   - You do not need a client secret, and you do not need redirect URIs for this token-based sign-in.
6. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) into `js/config.js`:

```javascript
export const GOOGLE_CLIENT_ID = 'your-id.apps.googleusercontent.com';
```

7. Save the file and, if the site is already published, push `main`. The origin must match exactly, including `https` and with no path. `https://levydvm.github.io/jeopardy/` is served from the origin `https://levydvm.github.io`.

While the consent screen stays in Testing, Google expires the grant after about seven days. Sign in again when that happens. Add each person who should sign in as a test user, or publish the app once you are ready for that.

## Phone buzzers

In play or present, choose **Buzzers**. The panel shows a four-letter room code, a QR code, and a join link such as `https://levydvm.github.io/jeopardy/buzz.html?room=ABCD`. Each phone picks its team and taps **Buzz**. The host presses **Open buzzing** (or the B key) once a clue is on screen. The first buzz the host receives wins. **Incorrect** locks that team out and opens buzzing again for the others. A Daily Double does not use the buzzers.

Timers follow the show unless you change them in the Buzzers panel: 5 seconds to buzz in, 5 seconds to answer, and 15 seconds on a Daily Double. If nobody buzzes, the window closes and you can reveal the answer with no score change. When an answer timer ends, that team is locked out and buzzing reopens; by default you still decide whether to mark them incorrect. Turn on “Mark incorrect when the answer timer ends” if the host should subtract the points automatically.

Buzzing while the clue is up, before the host opens the window, locks that phone for 0.25 seconds and shows **Too early**. Each early press before the window opens starts that 0.25 seconds again. Once buzzing is open, a press during the remaining lockout is ignored and does not add time. The phone keeps this clock so the button can react immediately, and the host also rejects a buzz from a team that is still locked, so an early press cannot win. Set the lockout to 0 to turn it off. These settings are saved with the game. Old saves that have no timer fields load with the defaults.

Phones talk to the host with WebRTC through PeerJS’s free public broker. No account or server of ours is involved. Some school or office networks block WebRTC, and the public broker is a best-effort service, so a phone may be unable to join. The score buttons on the host screen still work with no phones connected. Refreshing the host keeps the game and the room code; phones should reload the join link to reconnect.

## Local preview

The scripts are ES modules, so open the site through a static server rather than by double-clicking `index.html` (browsers block modules on `file://` URLs).

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`. Offline play works on any port. Google sign-in works only for origins listed on the OAuth client, so use port **8000** unless you add the port you are using.

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
- `js/config.js` — Google Client ID (`GOOGLE_CLIENT_ID`)
- `js/sample.js` — the built-in example questions
- `js/game.js` — rules and game state (add new actions here)
- `js/persist.js` — `localStorage` load and save
- `js/files.js` — file names and JSON checks for export, import, and Drive
- `js/drive.js` — Google Drive REST calls
- `js/google-auth.js` — Google sign-in token client
- `js/library.js` — Export, Import, and Drive buttons
- `js/ui.js` — rendering
- `js/main.js` — connects the controls to the game
- `buzz.html`, `buzz.css`, `js/buzz-phone.js` — the phone buzzer page
- `js/buzz-host.js`, `js/buzzer.js`, `js/room.js`, `js/timers.js` — host buzzer, rules, room connection, and clocks
- `vendor/peerjs.min.js` — PeerJS 1.5.4 (MIT, Michelle Bu and Eric Zhang)
- `vendor/qrcode.js` — QR Code Generator for JavaScript (MIT, Kazuhiko Arase)
- `tests/buzzer.test.mjs` — buzzer and timer rules (`node tests/buzzer.test.mjs`)
