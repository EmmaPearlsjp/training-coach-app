// Drop-in replacement for the Claude artifact's window.storage, backed by our own API.
// Same method signatures as the artifact version, so app.js (ported straight from the
// training_plan.html artifact) needs zero changes to its storage calls.
//
// Set window.TRAINING_API_BASE before this script loads to point at a non-default backend,
// e.g. <script>window.TRAINING_API_BASE = "https://your-api.onrender.com";</script>

(function () {
  const API_BASE = window.TRAINING_API_BASE || "http://localhost:3001";

  async function get(key, shared = false) {
    const res = await fetch(`${API_BASE}/api/kv/${encodeURIComponent(key)}?shared=${shared}`);
    if (res.status === 404) {
      // Match the artifact's behavior: accessing a missing key throws, not returns null.
      throw new Error("not_found");
    }
    if (!res.ok) throw new Error(`storage.get failed: ${res.status}`);
    return res.json();
  }

  async function set(key, value, shared = false) {
    const res = await fetch(`${API_BASE}/api/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, shared }),
    });
    if (!res.ok) throw new Error(`storage.set failed: ${res.status}`);
    return res.json();
  }

  async function list(prefix = "", shared = false) {
    const res = await fetch(`${API_BASE}/api/kv?prefix=${encodeURIComponent(prefix)}&shared=${shared}`);
    if (!res.ok) throw new Error(`storage.list failed: ${res.status}`);
    return res.json();
  }

  async function del(key, shared = false) {
    const res = await fetch(`${API_BASE}/api/kv/${encodeURIComponent(key)}?shared=${shared}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`storage.delete failed: ${res.status}`);
    return res.json();
  }

  window.storage = { get, set, list, delete: del };
})();
