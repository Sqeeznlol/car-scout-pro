const $ = (id) => document.getElementById(id);

async function refresh() {
  const { worker_enabled, worker_interval_min, worker_stats } = await chrome.storage.local.get([
    "worker_enabled",
    "worker_interval_min",
    "worker_stats",
  ]);

  const enabled = worker_enabled !== false;
  $("toggle").classList.toggle("on", enabled);
  $("interval").value = String(worker_interval_min ?? 2);

  const s = worker_stats || { runs: 0, processed: 0, errors: 0, lastRun: null, lastBatch: 0 };
  $("s-runs").textContent = s.runs;
  $("s-proc").textContent = s.processed;
  $("s-err").textContent = s.errors;
  $("s-batch").textContent = s.lastBatch ?? "—";
  $("s-last").textContent = s.lastRun ? timeAgo(s.lastRun) : "—";

  chrome.runtime.sendMessage({ type: "worker-status" }, (resp) => {
    const status = $("status");
    if (!enabled) {
      status.className = "status idle";
      status.textContent = "⏸ Auto-Worker ist deaktiviert.";
    } else if (resp?.running) {
      status.className = "status run";
      status.textContent = `🔄 Lauf aktiv — ${resp.pending} Tab(s) offen`;
    } else {
      status.className = "status ok";
      status.textContent = `✅ Aktiv — wartet auf nächsten Lauf (alle ${worker_interval_min ?? 2} min)`;
    }
  });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `vor ${s}s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)}min`;
  return `vor ${Math.floor(s / 3600)}h`;
}

$("toggle").addEventListener("click", async () => {
  const { worker_enabled } = await chrome.storage.local.get("worker_enabled");
  const next = worker_enabled === false;
  await chrome.storage.local.set({ worker_enabled: next });
  refresh();
});

$("interval").addEventListener("change", async (e) => {
  const min = parseInt(e.target.value, 10);
  await chrome.storage.local.set({ worker_interval_min: min });
  chrome.runtime.sendMessage({ type: "worker-set-interval", intervalMin: min }, () => refresh());
});

$("runNow").addEventListener("click", () => {
  $("runNow").disabled = true;
  $("runNow").textContent = "Starte…";
  chrome.runtime.sendMessage({ type: "worker-trigger" }, () => {
    setTimeout(() => {
      $("runNow").disabled = false;
      $("runNow").textContent = "▶ Jetzt einen Lauf starten";
      refresh();
    }, 800);
  });
});

refresh();
setInterval(refresh, 2000);
