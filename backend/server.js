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
const { spawn } = require("child_process");
const store = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const MI_FITNESS_MCP_EXE = process.env.MI_FITNESS_MCP_EXE ||
  "C:\\Users\\emmav\\mi-fitness-mcp\\.venv\\Scripts\\mi-fitness-mcp.exe";

function callMiFitnessMcp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(MI_FITNESS_MCP_EXE, ["serve"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let buffer = "";
    let settled = false;
    let nextId = 1;
    const timer = setTimeout(() => finish(new Error("Mi Fitness MCP timed out")), 30000);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      error ? reject(error) : resolve(result);
    };
    const send = (id, requestMethod, requestParams) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: requestMethod, params: requestParams })}\n`);
    };
    const readResponse = (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== 2) return;
      if (message.error) return finish(new Error(message.error.message || "MCP request failed"));
      const content = message.result && message.result.content;
      const text = Array.isArray(content) ? content.find(item => item.type === "text")?.text : null;
      if (!text) return finish(new Error("Mi Fitness MCP returned no data"));
      try { finish(null, JSON.parse(text)); } catch { finish(null, { text }); }
    };
    child.stdout.on("data", chunk => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      lines.forEach(readResponse);
    });
    child.stderr.on("data", chunk => console.warn("Mi Fitness MCP:", chunk.toString().trim()));
    child.on("error", error => finish(error));
    child.on("exit", code => { if (!settled && code !== 0) finish(new Error(`Mi Fitness MCP exited with code ${code}`)); });
    send(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "training-coach-local-bridge", version: "1.0" }
    });
    child.stdout.once("data", () => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
      send(2, method, params);
    });
  });
}

function mcpDate(value, fallback) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : fallback;
}

app.get("/api/mi-fitness/status", async (req, res) => {
  try {
    const data = await callMiFitnessMcp("tools/call", { name: "get_connection_status", arguments: {} });
    res.json(data);
  } catch (error) {
    res.status(503).json({ error: "Local Mi Fitness MCP is unavailable.", detail: error.message });
  }
});

app.post("/api/mi-fitness/sync", async (req, res) => {
  const endDate = mcpDate(req.body?.endDate, new Date().toISOString().slice(0, 10));
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 90);
  const startDate = mcpDate(req.body?.startDate, start.toISOString().slice(0, 10));
  try {
    await callMiFitnessMcp("tools/call", {
      name: "sync_data",
      arguments: { data_types: ["daily_activity", "heart_rate", "body_measurements", "workouts"], start_date: startDate, end_date: endDate }
    });
    const workouts = await callMiFitnessMcp("tools/call", {
      name: "query_workouts",
      arguments: { start_date: startDate, end_date: endDate }
    });
    const heartRate = await callMiFitnessMcp("tools/call", {
      name: "query_heart_rate",
      arguments: { start_date: startDate, end_date: endDate, sample_type: "workout", limit: 500 }
    });
    res.json({ startDate, endDate, workouts, heartRate });
  } catch (error) {
    res.status(503).json({ error: "Local Mi Fitness sync failed.", detail: error.message });
  }
});

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
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`training-coach-backend listening on ${HOST}:${PORT}`);
});
