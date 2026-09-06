// Drop-in replacement for the Claude artifact's window.storage, backed by our own API.
// Same method signatures as the artifact version, so app.js (ported straight from the
// training_plan.html artifact) needs zero changes to its storage calls.
//
// Set window.TRAINING_API_BASE before this script loads to point at a non-default backend,
// e.g. <script>window.TRAINING_API_BASE = "https://your-api.onrender.com";</script>

(function () {
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const API_BASE = window.TRAINING_API_BASE || (isLocalHost ? "http://localhost:3001" : "");
  const LOCAL_PREFIX = "training-coach:";
  let storageMode = API_BASE ? "checking" : "browser";
  let lastStorageError = "";

  function localKey(key, shared) {
    return `${LOCAL_PREFIX}${shared ? "shared:" : "private:"}${key}`;
  }

  function useLocalStorage(error) {
    storageMode = "browser";
    lastStorageError = error.message;
    console.warn("Training API unavailable; using this browser's local storage.", error);
  }

  function markApiAvailable() {
    storageMode = "backend";
    lastStorageError = "";
  }

  async function get(key, shared = false) {
    try {
      const res = await fetch(`${API_BASE}/api/kv/${encodeURIComponent(key)}?shared=${shared}`);
      if (res.status === 404) throw new Error("not_found");
      if (!res.ok) throw new Error(`storage.get failed: ${res.status}`);
      markApiAvailable();
      return res.json();
    } catch (error) {
      if (error.message === "not_found") {
        const value = localStorage.getItem(localKey(key, shared));
        if (value === null) throw error;
        return { key, value, shared };
      }
      useLocalStorage(error);
      const value = localStorage.getItem(localKey(key, shared));
      if (value === null) throw new Error("not_found");
      return { key, value, shared };
    }
  }

  async function set(key, value, shared = false) {
    try {
      const res = await fetch(`${API_BASE}/api/kv/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, shared }),
      });
      if (!res.ok) throw new Error(`storage.set failed: ${res.status}`);
      markApiAvailable();
      return res.json();
    } catch (error) {
      useLocalStorage(error);
      localStorage.setItem(localKey(key, shared), value);
      return { key, value, shared };
    }
  }

  async function list(prefix = "", shared = false) {
    try {
      const res = await fetch(`${API_BASE}/api/kv?prefix=${encodeURIComponent(prefix)}&shared=${shared}`);
      if (!res.ok) throw new Error(`storage.list failed: ${res.status}`);
      markApiAvailable();
      return res.json();
    } catch (error) {
      useLocalStorage(error);
      const keyPrefix = localKey(prefix, shared);
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const storedKey = localStorage.key(i);
        if (storedKey && storedKey.startsWith(keyPrefix)) keys.push(storedKey.slice(`${LOCAL_PREFIX}${shared ? "shared:" : "private:"}`.length));
      }
      return { keys, prefix, shared };
    }
  }

  async function del(key, shared = false) {
    try {
      const res = await fetch(`${API_BASE}/api/kv/${encodeURIComponent(key)}?shared=${shared}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`storage.delete failed: ${res.status}`);
      markApiAvailable();
      return res.json();
    } catch (error) {
      useLocalStorage(error);
      const deleted = localStorage.removeItem(localKey(key, shared));
      return { key, deleted, shared };
    }
  }

  window.storage = {
    get, set, list, delete: del,
    getStatus: () => ({ mode: storageMode, apiBase: API_BASE, lastError: lastStorageError })
  };
})();
