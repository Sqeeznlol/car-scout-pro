// ============================================================
// Autosnipe Manual Worker
// Kein Intervall. User klickt "Start" → wir holen alle offenen
// Inserate aus dem Backend, arbeiten sie Stück für Stück ab
// (versteckte Tabs), führen Verlauf + Live-Queue.
// ============================================================

const QUEUE_URL = "https://autosnipe.shop/api/public/hooks/extension-queue";
const TAB_TIMEOUT_MS = 35000;
const GAP_BETWEEN_MS = 1500;
const HISTORY_MAX = 100;
const FETCH_BATCH = 50; // pro Backend-Aufruf

// ---- State ----
const pending = new Map(); // tabId -> { item, timeoutId, resolve }
let workerRunning = false;
let stopRequested = false;
let currentQueue = []; // [{url, id, title?}]
let currentItem = null;
let history = []; // [{url, ok, ts, message?}]
let stats = { processed: 0, errors: 0, startedAt: null, finishedAt: null };

// ---- Bootstrap ----
(async () => {
  const stored = await chrome.storage.local.get(["worker_history", "worker_stats"]);
  history = stored.worker_history ?? [];
  stats = stored.worker_stats ?? stats;
})();

// ---- Message bus ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "sync-result") {
    chrome.storage.local.set({ last_sync: { ...msg.data, ts: Date.now() } });
    const tabId = sender.tab?.id;
    if (tabId && pending.has(tabId)) {
      finishTab(tabId, true, "ok");
    }
  } else if (msg.type === "worker-status") {
    sendResponse({
      running: workerRunning,
      stopRequested,
      queue: currentQueue,
      current: currentItem,
      history,
      stats,
      pending: pending.size,
    });
    return true;
  } else if (msg.type === "worker-start") {
    if (!workerRunning) runWorker().catch((e) => console.warn("[Autosnipe]", e));
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === "worker-stop") {
    stopRequested = true;
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === "worker-clear-history") {
    history = [];
    chrome.storage.local.set({ worker_history: history });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (pending.has(tabId)) {
    const p = pending.get(tabId);
    clearTimeout(p.timeoutId);
    pending.delete(tabId);
    p.resolve?.(false);
  }
});

// ---- Worker core ----
async function runWorker() {
  workerRunning = true;
  stopRequested = false;
  stats = { processed: 0, errors: 0, startedAt: Date.now(), finishedAt: null };
  await persist();

  try {
    while (!stopRequested) {
      // Hole nächsten Batch
      const items = await fetchQueue(FETCH_BATCH);
      currentQueue = items;
      await persist();

      if (items.length === 0) break;

      for (const item of items) {
        if (stopRequested) break;
        currentItem = item;
        await persist();

        const result = await processOne(item);
        if (result.ok) stats.processed++;
        else stats.errors++;

        pushHistory({ url: item.url, ok: result.ok, ts: Date.now(), message: result.message });
        currentQueue = currentQueue.filter((x) => x.url !== item.url);
        currentItem = null;
        await persist();
        await sleep(GAP_BETWEEN_MS);
      }
    }
  } catch (e) {
    console.warn("[Autosnipe] runWorker error", e);
  } finally {
    workerRunning = false;
    currentItem = null;
    stats.finishedAt = Date.now();
    await persist();
  }
}

async function fetchQueue(limit) {
  try {
    const res = await fetch(`${QUEUE_URL}?limit=${limit}`, { cache: "no-store" });
    const json = await res.json();
    return (json?.items ?? []).map((x) => ({ id: x.id, url: x.url }));
  } catch (e) {
    console.warn("[Autosnipe] queue fetch failed", e);
    return [];
  }
}

function processOne(item) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: item.url, active: false, pinned: true }, (tab) => {
      if (!tab?.id) return resolve({ ok: false, message: "Tab konnte nicht geöffnet werden" });
      const tabId = tab.id;
      const timeoutId = setTimeout(() => finishTab(tabId, false, "Timeout (Bot-Schutz / Login / langsam)"), TAB_TIMEOUT_MS);
      pending.set(tabId, { item, timeoutId, resolve });
    });
  });
}

function finishTab(tabId, success, message) {
  const p = pending.get(tabId);
  if (!p) return;
  clearTimeout(p.timeoutId);
  pending.delete(tabId);
  if (!success) reportError(p.item.url, message);
  try { chrome.tabs.remove(tabId, () => void chrome.runtime.lastError); } catch (_) {}
  p.resolve?.({ ok: success, message });
}

function reportError(url, message) {
  try {
    const idMatch = /[?&]id=(\d+)/.exec(url || "");
    fetch("https://autosnipe.shop/api/public/hooks/extension-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        mobile_de_id: idMatch?.[1] ?? null,
        error_message: message,
        context: { source: "worker" },
      }),
    }).catch(() => {});
  } catch (_) {}
}

function pushHistory(entry) {
  history.unshift(entry);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
}

async function persist() {
  await chrome.storage.local.set({
    worker_history: history,
    worker_stats: stats,
    worker_queue: currentQueue,
    worker_current: currentItem,
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
