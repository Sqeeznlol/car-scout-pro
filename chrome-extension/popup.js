chrome.storage.local.get("last_sync", ({ last_sync }) => {
  const status = document.getElementById("status");
  const details = document.getElementById("details");
  if (!last_sync) return;

  const age = Math.floor((Date.now() - last_sync.ts) / 1000);
  const ageStr = age < 60 ? `vor ${age}s` : age < 3600 ? `vor ${Math.floor(age / 60)}min` : `vor ${Math.floor(age / 3600)}h`;

  if (last_sync.ok) {
    status.className = "status ok";
    if (last_sync.archived) {
      status.textContent = `📦 Letztes Inserat archiviert (${last_sync.reason}) — ${ageStr}`;
    } else {
      status.textContent = `✅ Letztes Inserat synced — ${ageStr}`;
      if (last_sync.analysis) {
        const a = last_sync.analysis;
        details.innerHTML = `
          <div class="row"><span class="label">Einstand</span><span class="value">${a.total_cost_chf?.toFixed(0)} CHF</span></div>
          <div class="row"><span class="label">Marge</span><span class="value" style="color: ${a.expected_margin_chf >= 0 ? '#059669' : '#dc2626'}">${a.expected_margin_chf?.toFixed(0)} CHF</span></div>
          <div class="row"><span class="label">Deal Score</span><span class="value">${a.deal_score?.toFixed(0)}/100</span></div>
        `;
      }
      if (last_sync.queue_url) {
        details.innerHTML += `<div class="footer" style="margin-top: 12px;"><a href="https://autosnipe.shop${last_sync.queue_url}" target="_blank">→ Im Tool öffnen</a></div>`;
      }
    }
  } else {
    status.className = "status empty";
    status.style.background = "#fee2e2";
    status.style.color = "#991b1b";
    status.textContent = `❌ ${last_sync.error}`;
  }
});
