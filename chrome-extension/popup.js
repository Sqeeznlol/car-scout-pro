const $ = (id) => document.getElementById(id);

function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `vor ${s}s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)}min`;
  return `vor ${Math.floor(s / 3600)}h`;
}

function shortUrl(u) {
  try {
    const id = /[?&]id=(\d+)/.exec(u || "")?.[1];
    return id ? `mobile.de #${id}` : (u || "").slice(0, 50);
  } catch { return u; }
}

function render(resp) {
  const running = resp?.running;
  const queue = resp?.queue ?? [];
  const current = resp?.current;
  const history = resp?.history ?? [];
  const stats = resp?.stats ?? {};

  $("s-queue").textContent = queue.length;
  $("s-proc").textContent = stats.processed ?? 0;
  $("s-err").textContent = stats.errors ?? 0;
  $("s-blk").textContent = stats.blocked ?? 0;
  $("s-hour").textContent = `${resp?.perHour ?? 0} / ${resp?.hourlyLimit ?? 50}`;
  $("s-day").textContent = `${resp?.perDay ?? 0} / ${resp?.dailyLimit ?? 250}`;
  const cd = resp?.blockedUntil ?? 0;
  if (cd > Date.now()) {
    $("s-cool").textContent = `⛔ ${Math.ceil((cd - Date.now()) / 60000)} min`;
    $("s-cool").style.color = "#ef4444";
  } else {
    $("s-cool").textContent = "—";
    $("s-cool").style.color = "";
  }
  $("qcount").textContent = queue.length;

  const status = $("status");
  if (cd > Date.now()) {
    status.className = "status idle";
    status.style.background = "#fee2e2"; status.style.color = "#991b1b";
    status.textContent = `🛑 Bot-Schutz erkannt — Cooldown läuft (${Math.ceil((cd - Date.now()) / 60000)}min)`;
  } else if (running) {
    status.className = "status run"; status.style.background = ""; status.style.color = "";
    status.textContent = current
      ? `🔄 Prüfe ${shortUrl(current.url)} …`
      : `🔄 Lade Warteschlange…`;
  } else if (stats.finishedAt && (stats.processed > 0 || stats.errors > 0)) {
    status.className = "status done"; status.style.background = ""; status.style.color = "";
    status.textContent = `✅ Fertig — ${stats.processed} ok, ${stats.errors} Fehler`;
  } else {
    status.className = "status idle"; status.style.background = ""; status.style.color = "";
    status.textContent = "Bereit.";
  }

  const btn = $("ctrlBtn");
  if (running) {
    btn.className = "btn-stop";
    btn.textContent = "■ Stoppen";
  } else {
    btn.className = "btn-start";
    btn.textContent = "▶ Start";
  }

  // Queue
  const qList = $("queueList");
  if (queue.length === 0 && !current) {
    qList.innerHTML = '<div class="empty">Warteschlange leer</div>';
  } else {
    qList.innerHTML =
      (current ? `<div class="list-item"><span class="dot curr"></span><a href="${current.url}" target="_blank">${shortUrl(current.url)}</a><span class="ts">aktiv</span></div>` : "") +
      queue
        .filter((q) => !current || q.url !== current.url)
        .map((q) => `<div class="list-item"><span class="dot" style="background:#d1d5db"></span><a href="${q.url}" target="_blank">${shortUrl(q.url)}</a></div>`)
        .join("");
  }

  // History
  const hList = $("historyList");
  if (history.length === 0) {
    hList.innerHTML = '<div class="empty">Noch kein Verlauf</div>';
  } else {
    hList.innerHTML = history
      .map(
        (h) =>
          `<div class="list-item" title="${(h.message ?? "").replace(/"/g, "'")}"><span class="dot ${h.ok ? "ok" : "err"}"></span><a href="${h.url}" target="_blank">${shortUrl(h.url)}</a><span class="ts">${timeAgo(h.ts)}</span></div>`,
      )
      .join("");
  }
}

function refresh() {
  chrome.runtime.sendMessage({ type: "worker-status" }, (resp) => render(resp || {}));
}

$("ctrlBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "worker-status" }, (resp) => {
    const type = resp?.running ? "worker-stop" : "worker-start";
    chrome.runtime.sendMessage({ type }, () => refresh());
  });
});

$("clearHist").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "worker-clear-history" }, () => refresh());
});

$("clearCooldown").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "worker-clear-cooldown" }, () => refresh());
});

refresh();
setInterval(refresh, 1500);
