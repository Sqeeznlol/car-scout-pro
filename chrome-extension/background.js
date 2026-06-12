// ============================================================
// Autosnipe Manual Worker — Anti-Ban Edition
// - Zufällige Wartezeiten zwischen Inseraten (8-18s)
// - Lange Pause nach jedem Mini-Batch (60-120s alle 12 Inserate)
// - Harter Stundenlimit (max 50/h)
// - Tageslimit (max 250/Tag)
// - Bot-Schutz erkannt → sofortiger Stopp + 30min Cooldown
// - Immer nur 1 Tab gleichzeitig (sequenziell, nicht parallel)
// ============================================================

const QUEUE_URL = "https://autosnipe.shop/api/public/hooks/extension-queue";
const TAB_TIMEOUT_MS = 35000;

// --- Anti-Ban Konfiguration (per PC; mehrere PCs laufen parallel über FOR UPDATE SKIP LOCKED) ---
const GAP_MIN_MS = 6000;          // min Pause zwischen Inseraten
const GAP_MAX_MS = 14000;         // max Pause zwischen Inseraten
const MICRO_BATCH = 12;           // alle 12 Inserate eine lange Pause
const LONG_PAUSE_MIN_MS = 45_000; // 45s
const LONG_PAUSE_MAX_MS = 90_000; // 90s
const HOURLY_LIMIT = 60;
const DAILY_LIMIT = 400;
const BLOCKED_COOLDOWN_MS = 15 * 60_000; // 15 min nach Bot-Schutz
const FETCH_BATCH = 20;

const HISTORY_MAX = 100;

// ---- State ----
const pending = new Map(); // tabId -> { item, timeoutId, resolve }
const tabVehicleId = new Map(); // tabId -> vehicle_id (UUID aus queue)
let workerRunning = false;
let stopRequested = false;
let blockedUntil = 0; // timestamp
let currentQueue = [];
let currentItem = null;
let history = [];
let recentTimestamps = []; // für Rate-Limit (timestamps der letzten Anfragen)
let stats = { processed: 0, errors: 0, blocked: 0, startedAt: null, finishedAt: null };

let autoMode = true; // Vollautomatik: nach jedem Lauf neu starten

// ---- Bootstrap ----
(async () => {
  const stored = await chrome.storage.local.get(["worker_history", "worker_stats", "worker_timestamps", "blocked_until", "auto_mode"]);
  history = stored.worker_history ?? [];
  stats = stored.worker_stats ?? stats;
  recentTimestamps = stored.worker_timestamps ?? [];
  blockedUntil = stored.blocked_until ?? 0;
  autoMode = stored.auto_mode !== false; // default ON
  scheduleNextRun(1000); // direkt nach Bootstrap loslegen
})();

// Auto-Start bei Chrome-Start / Install / Update
chrome.runtime.onStartup?.addListener(() => scheduleNextRun(1000));
chrome.runtime.onInstalled?.addListener(() => scheduleNextRun(1000));

// Alarm-basierter Heartbeat — überlebt Service-Worker-Sleep
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "autosnipe-worker-tick") return;
  if (!autoMode) return;
  if (workerRunning) return;
  if (now() < blockedUntil) {
    scheduleNextRun(blockedUntil - now() + 1000);
    return;
  }
  runWorker().catch((e) => console.warn("[Autosnipe] tick", e));
});

function scheduleNextRun(delayMs) {
  if (!autoMode) return;
  const minutes = Math.max(0.1, delayMs / 60000);
  try { chrome.alarms.create("autosnipe-worker-tick", { delayInMinutes: minutes }); } catch (_) {}
}

// ---- Helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));
const now = () => Date.now();

function pruneTimestamps() {
  const cutoff = now() - 24 * 60 * 60_000;
  recentTimestamps = recentTimestamps.filter((t) => t > cutoff);
}
function countInLastMs(ms) {
  const cutoff = now() - ms;
  return recentTimestamps.filter((t) => t > cutoff).length;
}
function rateLimitWaitMs() {
  pruneTimestamps();
  const perHour = countInLastMs(3600_000);
  const perDay = countInLastMs(24 * 3600_000);
  if (perDay >= DAILY_LIMIT) {
    // warte bis ältester Tages-Timestamp aus dem Fenster fällt
    const oldest = recentTimestamps[recentTimestamps.length - DAILY_LIMIT] ?? now();
    return Math.max(60_000, oldest + 24 * 3600_000 - now());
  }
  if (perHour >= HOURLY_LIMIT) {
    const oldest = recentTimestamps[recentTimestamps.length - HOURLY_LIMIT] ?? now();
    return Math.max(60_000, oldest + 3600_000 - now());
  }
  return 0;
}

// ---- Message bus ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get-vehicle-id") {
    const tabId = sender.tab?.id;
    sendResponse({ vehicle_id: tabId ? tabVehicleId.get(tabId) ?? null : null });
    return true;
  }
  if (msg.type === "sync-result") {
    chrome.storage.local.set({ last_sync: { ...msg.data, ts: now() } });
    const tabId = sender.tab?.id;
    if (tabId && pending.has(tabId)) finishTab(tabId, true, "ok");
  } else if (msg.type === "blocked-detected") {
    // Bot-Schutz! Sofort stoppen.
    blockedUntil = now() + BLOCKED_COOLDOWN_MS;
    stopRequested = true;
    stats.blocked = (stats.blocked || 0) + 1;
    chrome.storage.local.set({ blocked_until: blockedUntil });
    pushHistory({ url: msg.url, ok: false, ts: now(), message: "🛑 Bot-Schutz erkannt — 30min Cooldown" });
    const tabId = sender.tab?.id;
    if (tabId && pending.has(tabId)) finishTab(tabId, false, "blocked");
    persist();
  } else if (msg.type === "worker-status") {
    pruneTimestamps();
    sendResponse({
      running: workerRunning,
      stopRequested,
      blockedUntil,
      autoMode,
      perHour: countInLastMs(3600_000),
      perDay: countInLastMs(24 * 3600_000),
      hourlyLimit: HOURLY_LIMIT,
      dailyLimit: DAILY_LIMIT,
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
  } else if (msg.type === "worker-set-auto") {
    autoMode = !!msg.value;
    chrome.storage.local.set({ auto_mode: autoMode });
    if (autoMode && !workerRunning) scheduleNextRun(1000);
    else if (!autoMode) { try { chrome.alarms.clear("autosnipe-worker-tick"); } catch (_) {} }
    sendResponse({ ok: true, autoMode });
    return true;
  } else if (msg.type === "worker-clear-history") {
    history = [];
    chrome.storage.local.set({ worker_history: history });
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === "worker-clear-cooldown") {
    blockedUntil = 0;
    chrome.storage.local.set({ blocked_until: 0 });
    if (autoMode && !workerRunning) scheduleNextRun(1000);
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabVehicleId.delete(tabId);
  if (pending.has(tabId)) {
    const p = pending.get(tabId);
    clearTimeout(p.timeoutId);
    pending.delete(tabId);
    p.resolve?.({ ok: false, message: "Tab geschlossen" });
  }
});

// ---- Worker core ----
async function runWorker() {
  if (now() < blockedUntil) {
    const minLeft = Math.ceil((blockedUntil - now()) / 60_000);
    pushHistory({ url: "", ok: false, ts: now(), message: `⏸ Cooldown noch ${minLeft} min` });
    await persist();
    return;
  }
  workerRunning = true;
  stopRequested = false;
  stats = { processed: 0, errors: 0, blocked: 0, startedAt: now(), finishedAt: null };
  await persist();

  let sinceLongPause = 0;

  try {
    while (!stopRequested) {
      // Rate-Limit Check
      const waitMs = rateLimitWaitMs();
      if (waitMs > 0) {
        pushHistory({ url: "", ok: false, ts: now(), message: `⏸ Limit erreicht — warte ${Math.ceil(waitMs / 60_000)}min` });
        await persist();
        break;
      }

      const items = await fetchQueue(FETCH_BATCH);
      currentQueue = items;
      await persist();
      if (items.length === 0) break;

      for (const item of items) {
        if (stopRequested) break;
        if (now() < blockedUntil) { stopRequested = true; break; }
        if (rateLimitWaitMs() > 0) { stopRequested = true; break; }

        currentItem = item;
        await persist();

        const result = await processOne(item);
        recentTimestamps.push(now());
        chrome.storage.local.set({ worker_timestamps: recentTimestamps });

        if (result.ok) stats.processed++;
        else stats.errors++;

        pushHistory({ url: item.url, ok: result.ok, ts: now(), message: result.message });
        currentQueue = currentQueue.filter((x) => x.url !== item.url);
        currentItem = null;
        sinceLongPause++;
        await persist();

        if (stopRequested) break;

        // Lange Pause alle MICRO_BATCH Inserate (wirkt menschlich)
        if (sinceLongPause >= MICRO_BATCH) {
          const pause = rand(LONG_PAUSE_MIN_MS, LONG_PAUSE_MAX_MS);
          pushHistory({ url: "", ok: true, ts: now(), message: `☕ Pause ${Math.round(pause / 1000)}s` });
          await persist();
          await sleep(pause);
          sinceLongPause = 0;
        } else {
          await sleep(rand(GAP_MIN_MS, GAP_MAX_MS));
        }
      }
    }
  } catch (e) {
    console.warn("[Autosnipe] runWorker error", e);
  } finally {
    workerRunning = false;
    currentItem = null;
    stats.finishedAt = now();
    await persist();
    // Auto-Mode: nächsten Lauf einplanen
    if (autoMode) {
      let nextMs;
      if (now() < blockedUntil) {
        nextMs = blockedUntil - now() + 1000; // nach Cooldown
      } else {
        const waitMs = rateLimitWaitMs();
        if (waitMs > 0) nextMs = waitMs + 1000;
        else nextMs = 3 * 60_000; // Queue war leer → in 3 min nochmal probieren
      }
      scheduleNextRun(nextMs);
    }
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
      if (item.id) tabVehicleId.set(tabId, item.id);
      const timeoutId = setTimeout(() => finishTab(tabId, false, "Timeout (Bot-Schutz / langsam)"), TAB_TIMEOUT_MS);
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
  tabVehicleId.delete(tabId);
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

// === Dashboard-Tab: Icon-Klick öffnet/fokussiert dashboard.html ===
chrome.action.onClicked.addListener(async () => {
  const dashUrl = chrome.runtime.getURL("dashboard.html");
  const tabs = await chrome.tabs.query({ url: dashUrl });
  if (tabs && tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) {
      try { await chrome.windows.update(tabs[0].windowId, { focused: true }); } catch (_) {}
    }
  } else {
    await chrome.tabs.create({ url: dashUrl });
  }
});
