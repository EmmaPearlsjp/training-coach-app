// Minimal key-value API mirroring the Claude artifact's window.storage interface:
//   GET    /api/kv/:key?shared=true|false           -> { key, value, shared } | 404
//   PUT    /api/kv/:key   body { value, shared }     -> { key, value, shared }
//   DELETE /api/kv/:key?shared=true|false            -> { key, deleted, shared }
//   GET    /api/kv?prefix=xxx&shared=true|false      -> { keys: [...], prefix, shared }
//
// No auth yet (single-user, personal app). If you ever add multiple users,
// add an owner/session check here — db.js already threads an `owner` param through.

const express = require("express");
const cors = require("cors");
const store = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

function parseShared(q) {
  return q === "true" || q === "1";
}

app.get("/api/kv/:key", (req, res) => {
  const shared = parseShared(req.query.shared);
  const row = store.get(req.params.key, shared);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json({ key: row.key, value: row.value, shared });
});

app.put("/api/kv/:key", (req, res) => {
  const shared = req.body.shared === true;
  const { value } = req.body;
  if (typeof value !== "string") {
    return res.status(400).json({ error: "value must be a string" });
  }
  const result = store.set(req.params.key, value, shared);
  res.json(result);
});

app.delete("/api/kv/:key", (req, res) => {
  const shared = parseShared(req.query.shared);
  const deleted = store.remove(req.params.key, shared);
  res.json({ key: req.params.key, deleted, shared });
});

app.get("/api/kv", (req, res) => {
  const shared = parseShared(req.query.shared);
  const prefix = req.query.prefix || "";
  const keys = store.list(prefix, shared);
  res.json({ keys, prefix, shared });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`training-coach-backend listening on :${PORT}`);
});
