chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "sync-result") {
    chrome.storage.local.set({ last_sync: { ...msg.data, ts: Date.now() } });
  }
});
