(function () {
  "use strict";

  const API_URL = "https://autosnipe.shop/api/public/hooks/extension-ingest";

  const cleanText = (s) => (s || "").replace(/\s+/g, " ").trim();
  const parseInt2 = (s) => {
    if (!s) return null;
    const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  function getListingId() {
    const u = new URL(location.href);
    return u.searchParams.get("id") || null;
  }

  function findByLabel(labels) {
    const all = document.querySelectorAll(
      "[data-testid], dt, dd, div, span, p, li, td, th"
    );
    for (const el of all) {
      const text = cleanText(el.textContent);
      for (const lbl of labels) {
        if (text === lbl || text === lbl + ":") {
          let val =
            el.nextElementSibling?.textContent ||
            el.parentElement?.querySelector("dd, .value")?.textContent ||
            "";
          val = cleanText(val);
          if (val && val !== text) return val;
        }
      }
    }
    const body = document.body.innerText;
    for (const lbl of labels) {
      const re = new RegExp(
        lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:.]?\\s*([^\\n]{1,80})",
        "i"
      );
      const m = re.exec(body);
      if (m && m[1]) return cleanText(m[1]);
    }
    return null;
  }

  function parse() {
    const id = getListingId();
    if (!id) return null;

    const data = {
      mobile_de_id: id,
      url: location.href.split("?")[0] + "?id=" + id,
      title: cleanText(document.querySelector("h1")?.textContent || document.title),
      country_code: "DE",
    };

    const bodyText = document.body.innerText;

    const priceEl = document.querySelector('[data-testid*="prime-price"], [data-testid*="price"], .price-block, h2');
    let priceMatch = priceEl ? /([\d.]+)\s*€/.exec(priceEl.textContent) : null;
    if (!priceMatch) priceMatch = /([\d.]+)\s*€\s*(?:Sehr guter Preis|Guter Preis|Ohne Bewertung|Hoher Preis)/.exec(bodyText);
    if (priceMatch) data.price_eur = parseInt2(priceMatch[1]);

    const nettoMatch = /([\d.]+(?:[,.]\d{2})?)\s*€\s*\(Netto\)(?:[,\s]*\d+\s*%\s*MwSt)?/i.exec(bodyText);
    if (nettoMatch) {
      data.price_eur_netto = parseInt2(nettoMatch[1]);
      data.seller_has_mwst = true;
    } else if (/zzgl\.?\s*\d+\s*%?\s*MwSt|MwSt\.?\s*ausweisbar|MwSt\.?\s*ausgewiesen|Nettopreis/i.test(bodyText)) {
      data.seller_has_mwst = true;
    } else if (/§\s*25\s*a|Differenzbesteu/i.test(bodyText)) {
      data.seller_has_mwst = false;
    } else {
      data.seller_has_mwst = false;
    }

    data.mileage_km = parseInt2(findByLabel(["Kilometerstand", "km", "Laufleistung"]));

    const regDate = findByLabel(["Erstzulassung", "EZ"]);
    if (regDate) {
      const rm = /(\d{1,2})[\/.](\d{4})/.exec(regDate);
      if (rm) {
        data.registration_month = parseInt(rm[1], 10);
        data.year = parseInt(rm[2], 10);
      } else {
        const ym = /(\d{4})/.exec(regDate);
        if (ym) data.year = parseInt(ym[1], 10);
      }
    }

    const powerStr = findByLabel(["Leistung"]);
    if (powerStr) {
      const pm = /(\d+)\s*kW(?:\s*\((\d+)\s*PS\))?/.exec(powerStr);
      if (pm) {
        data.power_kw = parseInt(pm[1], 10);
        if (pm[2]) data.power_ps = parseInt(pm[2], 10);
      }
    }

    const fuelStr = findByLabel(["Kraftstoffart", "Kraftstoff"]);
    if (fuelStr) data.fuel = fuelStr;

    const transStr = findByLabel(["Getriebe"]);
    if (transStr) data.transmission = transStr;

    data.consumption = findByLabel(["Verbrauch (komb.)", "Verbrauch komb"]);

    const co2Str = findByLabel(["CO2 Emissionen", "CO₂ Emissionen"]);
    if (co2Str) data.co2_gkm = parseInt2(co2Str);

    data.emission_class = findByLabel(["CO2-Klasse", "CO₂-Klasse", "Schadstoffklasse"]);

    data.color = findByLabel(["Außenfarbe", "Farbe"]);
    data.interior_color = findByLabel(["Innenausstattung", "Innenfarbe"]);
    data.body_type = findByLabel(["Karosserie", "Fahrzeugart"]);
    data.doors = parseInt2(findByLabel(["Türen"]));
    data.seats = parseInt2(findByLabel(["Sitzplätze"]));

    const ownerStr = findByLabel(["Anzahl der Fahrzeughalter", "Halter"]);
    if (ownerStr) data.owner_count = parseInt2(ownerStr);

    data.hu_until = findByLabel(["HU"]);

    const dealerEl = document.querySelector(
      '[data-testid*="dealer"], [data-testid*="seller"], [class*="dealer"], [class*="seller-info"], aside'
    );
    const dealerText = dealerEl ? cleanText(dealerEl.textContent) : bodyText;

    const addrMatch = /(DE|AT|CH|IT|FR|NL|BE|LU|PL|CZ|ES|PT|HU)-(\d{4,5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-\s]{2,40}?)(?=\s*$|\s*[,\n]|\s+Tel|\s{2,})/.exec(dealerText);
    if (addrMatch) {
      data.country_code = addrMatch[1];
      data.location = `${addrMatch[2]} ${addrMatch[3].trim()}`.replace(/\s+/g, " ");
      data.seller_address = `${addrMatch[1]}-${addrMatch[2]} ${addrMatch[3].trim()}`;
    }

    const nameCandidates = dealerEl ? dealerEl.querySelectorAll("h2, h3, h4, a") : [];
    for (const el of nameCandidates) {
      const t = cleanText(el.textContent);
      if (t && t.length > 3 && t.length < 80 && !/\d+[,.]\d+ Sterne|Bewertungen?|DE-\d/.test(t)) {
        data.seller_name = t;
        break;
      }
    }
    if (!data.seller_name) {
      const nameMatch = /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß&.\-\s]{3,60}?)\s*\d+[,.]\d+\s*Sterne/.exec(dealerText);
      if (nameMatch) data.seller_name = cleanText(nameMatch[1]);
    }

    data.seller_type = /\bPrivatperson\b|\bPrivat\b/i.test(bodyText) ? "Private" : "Dealer";

    const phoneMatch = /(?:Tel\.?|Telefon)[:\s]*(\+?[\d\s().\/-]{6,25}\d)/i.exec(bodyText)
      || /(\+49[\s\d().\/-]{8,20}\d)/.exec(bodyText);
    if (phoneMatch) data.seller_phone = cleanText(phoneMatch[1]);

    const websiteEl = document.querySelector('a[href^="http"]:not([href*="mobile.de"]):not([href*="ebay"]):not([href*="facebook"]):not([href*="twitter"])');
    if (websiteEl) data.seller_website = websiteEl.href;

    const imgs = Array.from(
      document.querySelectorAll('img[src*="mo-prod"], img[src*="classistatic"], img[srcset*="mo-prod"], img[srcset*="classistatic"]')
    );
    const urls = new Set();
    for (const img of imgs) {
      let url = img.src;
      if (img.srcset) {
        const last = img.srcset.split(",").map((s) => s.trim().split(" ")[0]).pop();
        if (last) url = last;
      }
      if (url) urls.add(url);
    }
    data.image_urls = Array.from(urls).slice(0, 30);
    data.image_url = data.image_urls[0] || null;

    const eqEl = document.querySelector(
      '[data-testid*="equipment"], [data-testid*="features"], [class*="equipment"], [class*="features-list"]'
    );
    if (eqEl) {
      const items = eqEl.querySelectorAll("li, span, div");
      const eq = new Set();
      for (const it of items) {
        const t = cleanText(it.textContent);
        if (t && t.length > 2 && t.length < 80 && !/^[€\d.,\s%]+$/.test(t)) eq.add(t);
      }
      data.equipment = Array.from(eq).slice(0, 200);
    }

    const descEl = document.querySelector(
      '[data-testid*="description"], [class*="description"], [class*="ad-description"]'
    );
    if (descEl) data.description = cleanText(descEl.textContent).slice(0, 5000);

    return data;
  }

  async function send(data) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.ok) {
        showBanner(
          json.archived
            ? `📦 Archiviert (${json.reason || "non-DE"})`
            : `✅ Synced — Marge: ${json.analysis?.expected_margin_chf?.toFixed(0) ?? "?"} CHF · Score: ${json.analysis?.deal_score?.toFixed(0) ?? "?"}`,
          json.archived ? "warn" : "ok"
        );
        chrome.runtime.sendMessage({ type: "sync-result", data: json });
      } else {
        showBanner(`❌ Fehler: ${json.error}`, "err");
      }
      return json;
    } catch (e) {
      showBanner(`❌ Verbindung fehlgeschlagen: ${e.message}`, "err");
      return { ok: false, error: e.message };
    }
  }

  function showBanner(msg, kind = "ok") {
    let banner = document.getElementById("autosnipe-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "autosnipe-banner";
      banner.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 999999;
        padding: 14px 20px; border-radius: 8px; font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px; font-weight: 500; box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        color: white; max-width: 360px; cursor: pointer;
      `;
      banner.onclick = () => banner.remove();
      document.body.appendChild(banner);
    }
    banner.style.background = kind === "ok" ? "#10b981" : kind === "warn" ? "#f59e0b" : "#ef4444";
    banner.textContent = msg;
    setTimeout(() => { if (banner) banner.style.opacity = "0.6"; }, 5000);
  }

  function addReSyncButton() {
    if (document.getElementById("autosnipe-resync-btn")) return;
    const btn = document.createElement("button");
    btn.id = "autosnipe-resync-btn";
    btn.textContent = "🔄 Autosnipe Re-Sync";
    btn.style.cssText = `
      position: fixed; bottom: 20px; left: 20px; z-index: 999998;
      padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer;
      background: #6366f1; color: white; font-weight: 600; font-size: 13px;
      box-shadow: 0 2px 8px rgba(99,102,241,0.4);
    `;
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Sende...";
      const data = parse();
      if (!data) {
        showBanner("❌ Keine Inserat-Daten gefunden", "err");
      } else {
        await send(data);
      }
      btn.disabled = false;
      btn.textContent = "🔄 Autosnipe Re-Sync";
    };
    document.body.appendChild(btn);
  }

  const UNAVAILABLE_API = "https://autosnipe.shop/api/public/hooks/extension-unavailable";

  function detectUnavailable() {
    const txt = (document.body.innerText || "").toLowerCase();
    const patterns = [
      "ist nicht mehr verfügbar",
      "fahrzeug ist nicht mehr verfügbar",
      "dieses inserat ist nicht mehr verfügbar",
      "inserat wurde gelöscht",
      "anzeige ist nicht mehr verfügbar",
    ];
    return patterns.some((p) => txt.includes(p));
  }

  // Erkennt Bot-Schutz / Captcha / Rate-Limit Seiten von mobile.de
  function detectBlocked() {
    const txt = (document.body.innerText || "").toLowerCase();
    const title = (document.title || "").toLowerCase();
    const hasCaptchaEl =
      !!document.querySelector(
        'iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="datadome"], #px-captcha, [class*="captcha"]'
      );
    const patterns = [
      "zugriff verweigert",
      "access denied",
      "ungewöhnliche aktivität",
      "unusual traffic",
      "bitte bestätigen sie, dass sie kein roboter",
      "please verify you are a human",
      "are you a robot",
      "too many requests",
      "rate limit",
      "blocked",
      "ihre anfrage konnte nicht verarbeitet werden",
    ];
    return hasCaptchaEl || patterns.some((p) => txt.includes(p) || title.includes(p));
  }

  async function reportUnavailable(id) {
    try {
      const res = await fetch(UNAVAILABLE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile_de_id: id, url: location.href }),
      });
      const json = await res.json().catch(() => ({}));
      showBanner("📦 Nicht mehr verfügbar → archiviert", "warn");
      chrome.runtime.sendMessage({ type: "sync-result", data: { ok: true, archived: true, reason: "unavailable", ...json } });
    } catch (e) {
      showBanner(`❌ ${e.message}`, "err");
    }
  }

  function init() {
    // 1) Bot-Schutz erkannt → Worker stoppen, KEIN weiterer Request
    if (detectBlocked()) {
      showBanner("🛑 Bot-Schutz erkannt — Worker pausiert", "err");
      chrome.runtime.sendMessage({ type: "blocked-detected", url: location.href });
      return;
    }
    const id = getListingId();
    if (id && detectUnavailable()) {
      reportUnavailable(id);
      return;
    }
    const data = parse();
    if (!data) {
      // Fallback: ohne Daten trotzdem ingest pingen, damit das Inserat
      // aus der Queue rauskommt und nicht endlos wiederholt wird.
      send({ mobile_de_id: id, url: location.href, country_code: "DE" });
      return;
    }
    send(data);
    addReSyncButton();
  }

  // Zufällige Wartezeit (1.5-3s) bevor wir anfangen — wirkt menschlicher
  setTimeout(init, 1500 + Math.random() * 1500);
})();

