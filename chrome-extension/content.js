(function () {
  "use strict";

  const API_URL = "https://autosnipe.shop/api/public/hooks/extension-ingest";

  const cleanText = (s) => (s || "").replace(/\s+/g, " ").trim();
  const parseInt2 = (s) => {
    if (!s) return null;
    const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  // Robust number parser for prices encoded as number / string / cent-amount
  function parseNumberAny(raw) {
    if (raw == null) return null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      // Heuristik: > 10M ist sehr wahrscheinlich Cent
      if (raw > 10_000_000) return Math.round(raw / 100);
      return raw;
    }
    const s = String(raw).trim();
    if (!s) return null;
    // Versuche reine Zahl
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 10_000_000) return Math.round(n / 100);
      return n;
    }
    // Formatiert "39.900,00 €" oder "39 900" oder "39'900"
    const cleaned = s.replace(/[€$\s'’]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
    const norm = cleaned.replace(",", ".");
    const n = parseFloat(norm);
    if (!Number.isFinite(n)) return null;
    if (n > 10_000_000) return Math.round(n / 100);
    return n;
  }

  const inRange = (v, brutto) =>
    typeof v === "number" && v >= 500 && v <= 10_000_000 && (!brutto || v < brutto);

  // ---------- STUFE 1: JSON-LD ----------
  function extractFromJsonLd(brutto) {
    const out = { netto: null, gross: null, hasMwst: null };
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      // offers / priceSpecification
      const offers = node.offers ?? node.Offers;
      if (offers) {
        const arr = Array.isArray(offers) ? offers : [offers];
        for (const o of arr) visit(o);
      }
      const ps = node.priceSpecification ?? node.PriceSpecification;
      if (ps) {
        const arr = Array.isArray(ps) ? ps : [ps];
        for (const p of arr) {
          const price = parseNumberAny(p.price);
          if (typeof p.valueAddedTaxIncluded === "boolean") {
            if (p.valueAddedTaxIncluded === false && inRange(price, brutto)) {
              out.netto = price;
              out.hasMwst = true;
            } else if (p.valueAddedTaxIncluded === true && inRange(price, null)) {
              out.gross = price;
            }
          }
        }
      }
      if (node.price != null && typeof node.valueAddedTaxIncluded === "boolean") {
        const price = parseNumberAny(node.price);
        if (node.valueAddedTaxIncluded === false && inRange(price, brutto)) {
          out.netto = price;
          out.hasMwst = true;
        }
      }
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === "object") visit(v);
      }
    };
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent || "null");
        visit(parsed);
        // @graph support
        if (parsed && parsed["@graph"]) visit(parsed["@graph"]);
      } catch (_) {
        /* ignore broken json-ld */
      }
    }
    return out;
  }

  // ---------- STUFE 2: Eingebettetes State-JSON in <script> ----------
  function extractFromInlineJson(brutto) {
    const out = { netto: null, gross: null, hasMwst: null, vatRate: null };
    const scripts = document.querySelectorAll("script:not([src])");
    const keyPatterns = [
      // key": value (zahl oder string)
      /"(netPrice|priceNet|net_price|nettoPrice|priceNetto)"\s*:\s*("?[\d.,'’\s€]+"?|\d+)/gi,
      /"(grossPrice|priceGross|brutto|bruttoPrice)"\s*:\s*("?[\d.,'’\s€]+"?|\d+)/gi,
      /"(vatRate|mwst|vat)"\s*:\s*("?\d+(?:[.,]\d+)?"?|\d+)/gi,
      /"(vatDeductible)"\s*:\s*(true|false)/gi,
      /"(priceVatType)"\s*:\s*"(NETTO|NET|GROSS|BRUTTO)"/gi,
    ];
    for (const sc of scripts) {
      const text = sc.textContent || "";
      if (text.length < 30 || text.length > 2_000_000) continue;
      // Schneller Filter
      if (!/net[A-Z_]?[Pp]rice|priceVatType|vatDeductible|nettoPrice|priceNetto|grossPrice|priceGross|vatRate/.test(text)) continue;
      for (const re of keyPatterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          const key = m[1].toLowerCase();
          const raw = m[2].replace(/^"|"$/g, "");
          if (key === "vatdeductible") {
            if (raw === "true") out.hasMwst = true;
            continue;
          }
          if (key === "pricevattype") {
            if (/NETTO|NET/i.test(raw)) out.hasMwst = true;
            continue;
          }
          if (key === "vatrate" || key === "vat" || key === "mwst") {
            const r = parseFloat(raw.replace(",", "."));
            if (Number.isFinite(r)) out.vatRate = r;
            continue;
          }
          const n = parseNumberAny(raw);
          if (/grossprice|pricegross|brutto/i.test(key)) {
            if (inRange(n, null)) out.gross = n;
          } else if (inRange(n, brutto)) {
            out.netto = n;
          }
        }
      }
      if (out.netto) break;
    }
    if (out.netto && out.gross) {
      const ratio = out.gross / out.netto;
      if (ratio >= 1.17 && ratio <= 1.21) out.hasMwst = true;
    }
    return out;
  }

  // ---------- STUFE 3: DOM/Text Fallback ----------
  function extractNettoFromText(text, brutto) {
    const patterns = [
      /([\d.'’\s]+(?:[,.]\d{2})?)\s*€\s*\(\s*Netto\s*\)(?:[,\s]*\d+\s*%\s*MwSt)?/i,
      /([\d.'’\s]+(?:[,.]\d{2})?)\s*€[^\n]{0,80}\bNetto\b/i,
      /\bNetto\b[^\n\d]{0,40}([\d.'’\s]+(?:[,.]\d{2})?)\s*€?/i,
      /(?:Netto(?:preis)?|Preis\s*\(\s*Netto\s*\)|Netto\s*:)\s*[:\-]?\s*([\d.'’\s]+(?:[,.]\d{2})?)\s*€?/i,
      /([\d.'’\s]+(?:[,.]\d{2})?)\s*€\s*netto\b/i,
    ];
    const values = [];
    for (const re of patterns) {
      const m = re.exec(text || "");
      const value = m ? parseInt2(m[1]) : null;
      if (inRange(value, brutto)) values.push(value);
    }
    return values.length ? Math.max(...values) : null;
  }

  function extractNettoFromDom(brutto) {
    const candidates = Array.from(document.querySelectorAll("[data-testid], [class], div, span, p, section"));
    const texts = [];
    for (const el of candidates) {
      const attr = `${el.getAttribute("data-testid") || ""} ${el.getAttribute("class") || ""}`;
      const ownText = cleanText(el.textContent);
      if (!/netto|net[-_]?price|price[-_]?net/i.test(attr + " " + ownText)) continue;
      const context = cleanText([
        ownText,
        el.previousElementSibling?.textContent || "",
        el.nextElementSibling?.textContent || "",
        el.parentElement?.textContent || "",
      ].join("\n"));
      if (/Erhöhter Preis|Fairer Preis|Günstiger Preis|Sehr guter Preis|Preisbewertung|Marktpreis|Preisanalyse/i.test(context)) continue;
      texts.push(context);
    }
    for (const text of texts.sort((a, b) => a.length - b.length)) {
      const value = extractNettoFromText(text, brutto);
      if (value) return value;
    }
    return null;
  }

  // ---------- Master ----------
  function extractMwstInfo(brutto, bodyText) {
    const out = { netto: null, hasMwst: null, derived: false };

    // Stufe 1
    const jl = extractFromJsonLd(brutto);
    if (jl.netto) { out.netto = jl.netto; out.hasMwst = true; return out; }
    if (jl.hasMwst === true) out.hasMwst = true;

    // Stufe 2
    const inl = extractFromInlineJson(brutto);
    if (inl.netto) { out.netto = inl.netto; out.hasMwst = true; return out; }
    if (inl.hasMwst === true) out.hasMwst = true;

    // Stufe 3 — DOM
    const dom = extractNettoFromDom(brutto);
    if (dom) { out.netto = dom; out.hasMwst = true; return out; }
    const txt = extractNettoFromText(bodyText, brutto);
    if (txt) { out.netto = txt; out.hasMwst = true; return out; }

    // Differenzbesteuerung → explizit kein MwSt-Ausweis
    if (/§\s*25\s*a|Differenzbesteu/i.test(bodyText)) {
      out.hasMwst = false;
      return out;
    }

    // MwSt-Indikator ohne expliziten Netto → Stufe 4: ableiten
    const mwstKeywords = /MwSt\.?\s*ausweisbar|MwSt\.?\s*ausgewiesen|zzgl\.?\s*\d+\s*%?\s*MwSt|exkl\.?\s*MwSt|Nettopreis|netto\s*(?:zzgl|exkl|\+)/i;
    if (out.hasMwst === true || mwstKeywords.test(bodyText) || inl.vatRate === 19) {
      out.hasMwst = true;
      if (brutto && brutto > 0) {
        out.netto = Math.round(brutto / 1.19);
        out.derived = true;
      }
    }
    return out;
  }

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

    const priceEl = document.querySelector('[data-testid*="prime-price"], [data-testid*="vip-price"], [data-testid*="price-block"], .price-block, h2');
    let priceMatch = priceEl ? /([\d.]+)\s*€/.exec(priceEl.textContent) : null;
    if (!priceMatch) priceMatch = /([\d.]+)\s*€\s*(?:Sehr guter Preis|Guter Preis|Ohne Bewertung|Hoher Preis)/.exec(bodyText);
    if (priceMatch) data.price_eur = parseInt2(priceMatch[1]);

    const mwst = extractMwstInfo(data.price_eur, bodyText);
    if (mwst.netto) {
      data.price_eur_netto = mwst.netto;
      data.seller_has_mwst = true;
      if (mwst.derived) data.netto_derived = true;
    } else if (mwst.hasMwst === true) {
      data.seller_has_mwst = true;
    } else if (mwst.hasMwst === false) {
      data.seller_has_mwst = false;
    }
    // sonst: Feld weglassen (null/unknown) — Backend entscheidet

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
    const dealerText = dealerEl ? cleanText(dealerEl.textContent) : "";

    const ADDR_RE = /\b(DE|AT|CH|IT|FR|NL|BE|LU|PL|CZ|ES|PT|HU|DK|SE|NO|FI|SK|SI|HR)-(\d{4,5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-\s]{2,40}?)(?=\s*$|\s*[,\n<•|·]|\s+Tel|\s{2,}|\s+\d)/;
    let addrMatch = dealerText ? ADDR_RE.exec(dealerText) : null;
    if (!addrMatch) addrMatch = ADDR_RE.exec(bodyText);
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

    const galleryRoot =
      document.querySelector(
        '[data-testid*="gallery"], [data-testid*="image"], [class*="gallery"], [class*="Gallery"], [class*="image-gallery"], [class*="ImageGallery"], section[aria-label*="ilder" i], section[aria-label*="oto" i]'
      ) || document;
    const imgs = Array.from(
      galleryRoot.querySelectorAll('img[src*="mo-prod"], img[src*="classistatic"], img[srcset*="mo-prod"], img[srcset*="classistatic"]')
    );
    const isBadImg = (u, alt) => {
      const s = (u || "").toLowerCase();
      const a = (alt || "").toLowerCase();
      if (/logo|avatar|profile|placeholder|stock|dealer|haendler|händler|user|seller/.test(s)) return true;
      if (/logo|avatar|profil|platzhalter|stock|händler|haendler|verkäufer/.test(a)) return true;
      return false;
    };
    const urls = new Set();
    for (const img of imgs) {
      let url = img.src;
      if (img.srcset) {
        const last = img.srcset.split(",").map((s) => s.trim().split(" ")[0]).pop();
        if (last) url = last;
      }
      if (!url) continue;
      if (isBadImg(url, img.alt)) continue;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w && w < 200) continue;
      if (h && h < 150) continue;
      urls.add(url);
    }
    if (urls.size === 0) {
      const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
      if (og && !isBadImg(og, "")) urls.add(og);
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

  function getVehicleId() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "get-vehicle-id" }, (resp) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(resp?.vehicle_id ?? null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function init() {
    if (detectBlocked()) {
      showBanner("🛑 Bot-Schutz erkannt — Worker pausiert", "err");
      chrome.runtime.sendMessage({ type: "blocked-detected", url: location.href });
      return;
    }
    const vehicle_id = await getVehicleId();
    const id = getListingId();
    if (id && detectUnavailable()) {
      reportUnavailable(id);
      return;
    }
    const data = parse();
    if (!data) {
      send({ vehicle_id, mobile_de_id: id, url: location.href, country_code: "DE" });
      return;
    }
    if (vehicle_id) data.vehicle_id = vehicle_id;
    send(data);
    addReSyncButton();
  }

  setTimeout(init, 1500 + Math.random() * 1500);
})();
