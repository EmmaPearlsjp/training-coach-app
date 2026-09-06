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

app.post("/api/nutrition/chat", async (req, res) => {
  const { message, profile, foodLog } = req.body || {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "Nutrition Coach is not configured yet. Add ANTHROPIC_API_KEY to the backend environment." });
  }

  const context = JSON.stringify({ profile: profile || {}, foodLog: foodLog || [] });
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
      max_tokens: 700,
      system: "You are Nutrition Coach, a careful nutrition-support assistant for a recreational runner. Use the supplied profile and food log. Give practical estimates, clearly label uncertainty, never diagnose or prescribe, and flag allergies, eating-disorder concerns, pregnancy, diabetes, or other medical needs for a qualified professional. Ask for missing portion sizes instead of inventing precision.",
      messages: [{ role: "user", content: `${message.trim()}\n\nCurrent app context:\n${context}` }]
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Anthropic nutrition request failed:", detail);
    return res.status(502).json({ error: "Nutrition Coach could not respond right now." });
  }
  const data = await response.json();
  const text = (data.content || []).filter(part => part.type === "text").map(part => part.text).join("\n");
  res.json({ text });
});

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
