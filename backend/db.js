// SQLite for now — file-based, zero external setup, good enough for a single-user app.
// To move to Postgres later: swap this file for a `pg` client with the same
// get/set/list/remove function signatures, and nothing else in the app needs to change.
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.db");
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT NOT NULL,
    shared INTEGER NOT NULL DEFAULT 0,
    owner TEXT NOT NULL DEFAULT 'default',
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (key, shared, owner)
  );
`);

function get(key, shared = false, owner = "default") {
  const row = db.prepare(
    "SELECT key, value FROM kv_store WHERE key = ? AND shared = ? AND owner = ?"
  ).get(key, shared ? 1 : 0, shared ? "shared" : owner);
  return row || null;
}

function set(key, value, shared = false, owner = "default") {
  db.prepare(`
    INSERT INTO kv_store (key, shared, owner, value, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key, shared, owner) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, shared ? 1 : 0, shared ? "shared" : owner, value);
  return { key, value, shared };
}

function list(prefix = "", shared = false, owner = "default") {
  const rows = db.prepare(
    "SELECT key FROM kv_store WHERE key LIKE ? AND shared = ? AND owner = ? ORDER BY key"
  ).all(`${prefix}%`, shared ? 1 : 0, shared ? "shared" : owner);
  return rows.map(r => r.key);
}

function remove(key, shared = false, owner = "default") {
  const info = db.prepare(
    "DELETE FROM kv_store WHERE key = ? AND shared = ? AND owner = ?"
  ).run(key, shared ? 1 : 0, shared ? "shared" : owner);
  return info.changes > 0;
}

module.exports = { get, set, list, remove };
