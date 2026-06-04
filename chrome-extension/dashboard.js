const $ = (id) => document.getElementById(id);

function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `vor ${s}s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)}min`;
  return `vor ${Math.floor(s / 3600)}h`;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function shortUrl(u) {
  try {
    const id = /[?&]id=(\d+)/.exec(u || "")?.[1];
    return id ? `mobile.de #${id}` : (u || "").slice(0, 80);
  } catch { return u; }
}

function render(resp) {
  const running = resp?.running;
  const queue = resp?.queue ?? [];
  const current = resp?.current;
  const history = resp?.history ?? [];
  const stats = resp?.stats ?? {};
  const cd = resp?.blockedUntil ?? 0;
  const cooldownActive = cd > Date.now();

  $("s-queue").textContent = queue.length;
  $("s-proc").textContent = stats.processed ?? 0;
  $("s-err").textContent = stats.errors ?? 0;
  $("s-blk").textContent = stats.blocked ?? 0;
  $("s-hour").textContent = `${resp?.perHour ?? 0} / ${resp?.hourlyLimit ?? 50}`;
  $("s-day").textContent = `${resp?.perDay ?? 0} / ${resp?.dailyLimit ?? 250}`;
  if (cooldownActive) {
    $("s-cool").textContent = `⛔ ${Math.ceil((cd - Date.now()) / 60000)} min`;
    $("s-cool").style.color = "#fca5a5";
  } else {
    $("s-cool").textContent = "—";
    $("s-cool").style.color = "";
  }
  $("qcount").textContent = queue.length;

  // Pulse + Title
  const pulse = $("pulse");
  pulse.className = "pulse" + (cooldownActive ? " err" : running ? " run" : "");
  document.title = (running ? "● " : cooldownActive ? "⛔ " : "") + `Autosnipe (${queue.length})`;

  // Status
  const status = $("status");
  if (cooldownActive) {
    status.className = "status err";
    status.textContent = `🛑 Bot-Schutz erkannt — Cooldown läuft (${Math.ceil((cd - Date.now()) / 60000)} min). Du kannst ihn manuell aufheben.`;
  } else if (running) {
    status.className = "status run";
    status.textContent = current
      ? `🔄 Verarbeite ${shortUrl(current.url)} …`
      : `🔄 Lade Warteschlange vom Server …`;
  } else if (stats.finishedAt && (stats.processed > 0 || stats.errors > 0)) {
    status.className = "status done";
    const autoTxt = resp?.autoMode ? " · Vollautomatik aktiv — nächster Lauf folgt automatisch" : "";
    status.textContent = `✅ Letzter Lauf fertig — ${stats.processed} ok, ${stats.errors} Fehler, ${stats.blocked ?? 0} Blocks${autoTxt}`;
  } else {
    status.className = "status";
    status.textContent = resp?.autoMode
      ? "⏳ Vollautomatik aktiv — Worker startet automatisch sobald Inserate da sind."
      : "Bereit. Klick auf Start — oder Vollautomatik einschalten.";
  }

  // Auto-Toggle State
  const auto = $("autoToggle");
  if (auto && auto.checked !== !!resp?.autoMode) auto.checked = !!resp?.autoMode;

  // Aktuell-Karte
  const now = $("now");
  if (current) {
    now.className = "now";
    $("now-url").innerHTML = `<a href="${current.url}" target="_blank" style="color:#fff;text-decoration:underline">${current.url}</a>`;
    $("now-step").textContent = `Schritt: ${current.step ?? (running ? "lädt …" : "—")}`;
    $("now-elapsed").textContent = `Dauer: ${fmtDuration(Date.now() - (current.startedAt ?? Date.now()))}`;
  } else {
    now.className = "now idle";
    $("now-url").textContent = running ? "— warte auf nächstes Inserat —" : "— nichts aktiv —";
    $("now-step").textContent = "Schritt: —";
    $("now-elapsed").textContent = "Dauer: —";
  }

  // Button
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
    qList.innerHTML = '<div class="empty">Warteschlange leer — Server hat aktuell keine Inserate.</div>';
  } else {
    qList.innerHTML =
      (current ? `<div class="list-item"><span class="dot curr"></span><a href="${current.url}" target="_blank">${shortUrl(current.url)}</a><span class="ts">aktiv</span></div>` : "") +
      queue
        .filter((q) => !current || q.url !== current.url)
        .map((q) => `<div class="list-item"><span class="dot wait"></span><a href="${q.url}" target="_blank">${shortUrl(q.url)}</a></div>`)
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

$("autoToggle")?.addEventListener("change", (e) => {
  chrome.runtime.sendMessage({ type: "worker-set-auto", value: e.target.checked }, () => refresh());
});

refresh();
// Tab bleibt offen — schneller Poll, damit du alles live siehst
setInterval(refresh, 1000);
