// ============================================================
// Autosnipe Auto-Worker
// Läuft im Hintergrund, holt alle X Minuten eine Liste von
// mobile.de-URLs vom Backend, öffnet sie nacheinander in
// versteckten Tabs, lässt content.js scrapen+senden,
// schließt die Tabs wieder.
// ============================================================

const QUEUE_URL = "https://autosnipe.shop/api/public/hooks/extension-queue";
const ALARM_NAME = "autosnipe-worker";
const DEFAULT_INTERVAL_MIN = 2;
const BATCH_SIZE = 5;          // wie viele URLs pro Lauf
const TAB_TIMEOUT_MS = 35000;  // max Zeit pro Inserat bevor wir den Tab killen
const GAP_BETWEEN_MS = 2500;   // Pause zwischen Tabs (entspannt mobile.de)

// ---- State ----
const pending = new Map(); // tabId -> { url, timeoutId, resolve }
let workerRunning = false;
let stats = { runs: 0, processed: 0, errors: 0, lastRun: null, lastBatch: 0 };

// ---- Init ----
chrome.runtime.onInstalled.addListener(async () => {
  const { worker_enabled, worker_interval_min } = await chrome.storage.local.get([
    "worker_enabled",
    "worker_interval_min",
  ]);
  if (worker_enabled === undefined) {
    await chrome.storage.local.set({ worker_enabled: true, worker_interval_min: DEFAULT_INTERVAL_MIN });
  }
  setupAlarm(worker_interval_min ?? DEFAULT_INTERVAL_MIN);
});

chrome.runtime.onStartup.addListener(async () => {
  const { worker_interval_min } = await chrome.storage.local.get("worker_interval_min");
  setupAlarm(worker_interval_min ?? DEFAULT_INTERVAL_MIN);
});

function setupAlarm(intervalMin) {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: Math.max(1, intervalMin),
    });
  });
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== ALARM_NAME) return;
  const { worker_enabled } = await chrome.storage.local.get("worker_enabled");
  if (worker_enabled === false) return;
  runWorker().catch((e) => console.warn("[Autosnipe] worker error", e));
});

// ---- Message bus ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "sync-result") {
    chrome.storage.local.set({ last_sync: { ...msg.data, ts: Date.now() } });
    // Wenn dieser Tab vom Worker geöffnet wurde -> schließen
    const tabId = sender.tab?.id;
    if (tabId && pending.has(tabId)) {
      finishTab(tabId, true);
    }
  } else if (msg.type === "worker-status") {
    sendResponse({ running: workerRunning, stats, pending: pending.size });
    return true;
  } else if (msg.type === "worker-trigger") {
    runWorker().catch(() => {});
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === "worker-set-interval") {
    setupAlarm(msg.intervalMin || DEFAULT_INTERVAL_MIN);
    sendResponse({ ok: true });
    return true;
  }
});

// Cleanup falls Tab manuell geschlossen wird
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
  if (workerRunning) return;
  workerRunning = true;
  stats.runs++;
  stats.lastRun = Date.now();
  await persistStats();

  try {
    const res = await fetch(`${QUEUE_URL}?limit=${BATCH_SIZE}`, { cache: "no-store" });
    const json = await res.json();
    const items = json?.items ?? [];
    stats.lastBatch = items.length;
    await persistStats();

    if (items.length === 0) {
      workerRunning = false;
      return;
    }

    for (const it of items) {
      const ok = await processOne(it.url);
      if (ok) stats.processed++;
      else stats.errors++;
      await persistStats();
      await sleep(GAP_BETWEEN_MS);
    }
  } catch (e) {
    console.warn("[Autosnipe] runWorker", e);
    stats.errors++;
    await persistStats();
  } finally {
    workerRunning = false;
  }
}

function processOne(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false, pinned: true }, (tab) => {
      if (!tab?.id) return resolve(false);
      const tabId = tab.id;
      const timeoutId = setTimeout(() => finishTab(tabId, false), TAB_TIMEOUT_MS);
      pending.set(tabId, { url, timeoutId, resolve });
    });
  });
}

function finishTab(tabId, success) {
  const p = pending.get(tabId);
  if (!p) return;
  clearTimeout(p.timeoutId);
  pending.delete(tabId);
  try { chrome.tabs.remove(tabId, () => void chrome.runtime.lastError); } catch (_) {}
  p.resolve?.(success);
}

async function persistStats() {
  await chrome.storage.local.set({ worker_stats: stats });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
