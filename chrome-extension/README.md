# Autosnipe Auto-Worker (Chrome Extension v2)

Läuft als **Hintergrund-Arbeiter** auf deinem Laptop. Holt automatisch alle paar Minuten unbearbeitete Inserate vom Autosnipe-Backend, öffnet sie in versteckten Tabs, scraped MwSt + Standort + Preise + Bilder + Ausstattung, sendet alles zurück und schließt die Tabs wieder.

Komplett gratis. Komplett automatisch. Läuft solange Chrome offen ist.

## Installation

1. **`chrome-extension/` Ordner herunterladen** (z. B. via ZIP-Download)
2. **`chrome://extensions/`** in Chrome öffnen
3. **Entwicklermodus** aktivieren (Toggle oben rechts)
4. **"Entpackte Erweiterung laden"** → Ordner `chrome-extension/` auswählen
5. Auf das Autosnipe-Icon in der Toolbar klicken → der Worker läuft sofort los

## Wie es funktioniert

- Alle 2 Minuten (einstellbar): Worker fragt `autosnipe.shop/api/public/hooks/extension-queue` nach unbearbeiteten Inseraten
- Für jedes Inserat: versteckter, angepinnter Tab öffnet sich, content.js scraped automatisch + sendet an `extension-ingest`, Tab schließt sich nach ~3 Sekunden
- Pause zwischen Tabs: 2,5 Sekunden (entlastet mobile.de)
- Pro Lauf: 5 Inserate

Da die Requests **von deinem Laptop / deiner Wohnungs-IP** kommen, blockiert mobile.de **nicht** — anders als Server-Scraping.

## Popup-Steuerung

- **Auto-Worker an/aus** (Toggle)
- **Intervall**: 1 / 2 / 5 / 10 / 30 Minuten
- **Statistik**: Anzahl Läufe, verarbeitet, Fehler, letzter Lauf
- **▶ Jetzt einen Lauf starten** für sofortigen Sync

## Manuell ein einzelnes Inserat synchronisieren

Wenn du ein mobile.de Inserat selbst öffnest, läuft der Content-Script automatisch und du siehst unten rechts ein grünes Banner mit Marge + Score. Unten links findest du den 🔄 Re-Sync Button.

## Was wird erfasst

- Preis (Brutto + Netto)
- MwSt-Status (ausweisbar / §25a)
- Standort (PLZ + Stadt) + Land
- Eckdaten (km, EZ, Leistung, Kraftstoff, Getriebe)
- Verbrauch, CO2, Emissionsklasse
- Händler (Name, Telefon, Adresse, Website)
- Alle Bilder
- Komplette Ausstattung
- Beschreibung
- Halter, HU, Farbe, Karosserie, Türen, Sitze
