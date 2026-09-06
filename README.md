# Training Coach App

A 10K training plan tracker (Runna schedule + badminton/hiking/etc. cross-training,
weekly coach notes, Mi Fitness physiology reports) — originally built as a Claude
artifact, restructured here into a real repo with its own backend.

## How this differs from the Claude artifact version

The artifact used `window.storage`, an API that only exists inside Claude.ai. This
repo replaces it with a tiny Express + SQLite API, behind a drop-in adapter
(`frontend/storage-adapter.js`) that exposes the same `get`/`set`/`list`/`delete`
interface — so `frontend/app.js` (ported straight from the artifact) needed no
logic changes, just a different storage backend underneath it.

```
frontend/            static site — HTML/CSS/JS, no build step
  index.html
  style.css
  app.js                 (the app's logic — unchanged from the artifact)
  storage-adapter.js      (window.storage, backed by fetch() calls)
backend/             tiny API + database
  server.js               (Express routes)
  db.js                   (SQLite via better-sqlite3)
  package.json
```

## Running locally

**Backend:**
```bash
cd backend
npm install
npm start          # listens on :3001, creates backend/data.db on first run
```

**Frontend:** just open `frontend/index.html` in a browser, or serve it:
```bash
cd frontend
npx serve .         # or: python3 -m http.server 8080
```

By default the frontend talks to `http://localhost:3001`. To point it at a
deployed backend, edit the inline `<script>` in `frontend/index.html`:
```html
<script>
  window.TRAINING_API_BASE = "https://your-api.onrender.com";
</script>
```

## Deploying

**Frontend (GitHub Pages):** GitHub Pages only serves static files, which is all
`frontend/` is. In your repo settings, enable Pages and point it at the
`frontend/` folder (or set up the included GitHub Actions workflow to publish it
automatically on push — see `.github/workflows/pages.yml`).

**Backend (needs an actual server, Pages can't run this):** Render, Railway, and
Fly.io all have free/cheap tiers that work for a small Express app like this.
General steps for any of them:
1. Push this repo to GitHub.
2. Connect the repo, set the root directory to `backend/`.
3. Build command: `npm install`. Start command: `npm start`.
4. Note the URL it gives you, and set that as `TRAINING_API_BASE` in the frontend.

SQLite writes to a local file (`backend/data.db`), so make sure your host's disk
persists between deploys — Render's free tier disk is ephemeral on redeploy, so
if you outgrow that, this is the point to swap `backend/db.js` for a real Postgres
connection (the function signatures — `get`/`set`/`list`/`remove` — are the only
thing that needs to change; nothing else in the app touches the database directly).

## Data model

Everything is a flat key-value store, matching what the artifact version used:

| Key pattern | What it holds |
|---|---|
| `done:{week}:{day}` | "1"/"0" — session completion checkbox |
| `activities:week{n}` | JSON array of extra activities (badminton, hiking, etc.) |
| `swaps:week{n}` | JSON array of auto-moved sessions (Legs & Core / Upper Body only) |
| `feel:week{n}` | "Easy" / "Right" / "Tough" — weekly self-report |
| `weight:{timestamp}` | JSON `{ value, date }` |
| `meal:{timestamp}` | JSON `{ text, date }` |
| `physiology-report:{date}` | JSON snapshot of a Mi Fitness pull, dated |

## Known limitation carried over from the artifact

There's still no live Mi Fitness sync — Xiaomi doesn't offer a public consumer
API. Syncing still means asking Claude to pull fresh data and update the
`ACTUAL_WORKOUTS` / `PAST_ACTIVITIES` constants in `app.js`, then committing that
change. A real backend doesn't remove this step, it just gives the rest of the
app (weight log, completions, activities) a proper multi-session home instead of
being stuck to one browser's local storage.
