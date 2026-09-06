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

For local Mi Fitness sync, set the MCP executable path if it differs from the
default Windows path:
```powershell
$env:MI_FITNESS_MCP_EXE="C:\Users\emmav\mi-fitness-mcp\.venv\Scripts\mi-fitness-mcp.exe"
npm start
```
Then open the Physiology tab and choose **Sync local Mi Fitness MCP**. The
bridge starts the MCP process only for the request, retrieves workouts and
workout heart-rate data, and stores the normalized results in the browser.
Credentials remain in the MCP's local keyring and are never sent to GitHub
Pages. The backend must be running on the same computer; this is intentionally
not a hosted sync service.

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

For a Render deployment, the repository includes `render.yaml`. Create a
Blueprint from that file; it uses `backend/` as the service root, runs
`npm install` then `npm start`, and checks `/api/health`. Set
`window.TRAINING_API_BASE` in the frontend to the resulting Render service URL
(without a trailing slash). The storage adapter then sends route/activity
records to that backend and keeps its browser-local fallback if the service is
unavailable. The backend currently enables CORS for the static GitHub Pages
frontend; if you deploy behind a restricted proxy, allow the Pages origin and
`GET/PUT/DELETE /api/kv` plus `GET /api/health`. The Free Render configuration
uses ephemeral SQLite storage, so redeploys or service replacement can lose
backend data; keep regular JSON exports or add a paid persistent disk/managed
database before treating it as the only copy. Do not put secrets
in the repository; Mi Fitness credentials remain local to the MCP setup.

The dashboard header shows the active site/domain and whether storage is using
the backend or this browser's local fallback. Browser storage is isolated by
browser and domain, so export a JSON backup before changing devices, browsers,
or GitHub Pages domains. Before imports and delete actions, the app also keeps
one automatic safety snapshot in the current browser; use **Export backup** for
a portable copy.

The Physiology tab also accepts TCX, GPX, and KML activity files. These are
parsed client-side, so route data and health metrics stay in the current
browser. The importer keeps date, activity type, duration, distance, pace,
heart rate, calories, cadence, and route-point metadata when present, reports
unavailable fields, and skips the same file/activity again using stable IDs.
JSON Mi Fitness import remains available as a separate action.

When GPS points are available, the same panel shows a private, client-side SVG
route view. Select one or more colored tracks with the checkboxes, filter by
activity type or date, and compare selected distance, duration, pace, and
elevation range. Files without GPS points still import their summary metrics
and show a clear no-route state; no map tiles or location data are sent to an
external service.

Imported activities also appear in an explicit association review. The app
suggests plan days and manual workouts using date, activity type, duration, and
distance, but never links or overwrites anything automatically. After choosing
**Link**, the imported source and richer metrics (including HR samples,
respiratory data when present, cadence, calories, elevation, pace, and route)
are attached to that existing record while its original notes and fields stay
intact. Missing breathing data is treated as unavailable, not as zero.

The Calendar view includes dated imported activities as clickable entries.
Selecting one opens its source, association, metrics, and a private SVG route
preview when GPS points are available; files without GPS data show a clear
no-route state.

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

## Mi Fitness sync limitations

The local bridge uses the installed unofficial `mi-fitness-mcp` executable.
It supports local workout and heart-rate synchronization without exposing
Xiaomi credentials. GitHub Pages cannot launch local programs, so `npm start`
must be running on the computer when the sync button is used. Breathing-rate
data is imported only if the MCP response contains it.
