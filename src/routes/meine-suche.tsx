import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchTelegramChatId, sendTestTelegram } from "@/lib/notifications.functions";
import { toast } from "sonner";
import { Bell, Eye, EyeOff, RefreshCw, Send, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_TOKEN = "8591751475:AAFzXRVhkKaLcBrnSBlj0nj_7pQj-KcdLjM";
const DEFAULT_CHAT_ID = "5162665016";

const COMMON_MAKES = ["BMW", "Mercedes-Benz", "Audi", "VW", "Porsche", "Skoda", "Toyota", "Ford", "Opel", "Renault"];
const FUELS = ["Diesel", "Benzin"];

interface Filter {
  id?: string;
  name: string;
  is_active: boolean;
  makes: string[];
  models: string[];
  max_mileage: number | null;
  max_price_eur: number | null;
  min_margin_chf: number | null;
  min_deal_score: number | null;
  fuel_types: string[];
  telegram_bot_token: string;
  telegram_chat_id: string;
}

const DEFAULT_FILTER: Filter = {
  name: "Meine Suche",
  is_active: true,
  makes: [],
  models: [],
  max_mileage: 120000,
  max_price_eur: 40000,
  min_margin_chf: 2500,
  min_deal_score: 65,
  fuel_types: ["Diesel", "Benzin", "Hybrid"],
  telegram_bot_token: DEFAULT_TOKEN,
  telegram_chat_id: DEFAULT_CHAT_ID,
};

export const Route = createFileRoute("/meine-suche")({ component: MeineSuche });

function MeineSuche() {
  const [f, setF] = useState<Filter>(DEFAULT_FILTER);
  const [modelInput, setModelInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fetchChat = useServerFn(fetchTelegramChatId);
  const sendTest = useServerFn(sendTestTelegram);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("notification_filters")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) setF({ ...DEFAULT_FILTER, ...(data as unknown as Filter) });
      setLoading(false);
    })();
  }, []);

  const toggleMake = (m: string) =>
    setF((p) => ({ ...p, makes: p.makes.includes(m) ? p.makes.filter((x) => x !== m) : [...p.makes, m] }));
  const toggleFuel = (m: string) =>
    setF((p) => ({ ...p, fuel_types: p.fuel_types.includes(m) ? p.fuel_types.filter((x) => x !== m) : [...p.fuel_types, m] }));
  const addModel = () => {
    const parts = modelInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      setF((p) => ({ ...p, models: Array.from(new Set([...p.models, ...parts])) }));
      setModelInput("");
    }
  };
  const removeModel = (m: string) => setF((p) => ({ ...p, models: p.models.filter((x) => x !== m) }));

  const save = async () => {
    setSaving(true);
    const payload = { ...f, updated_at: new Date().toISOString() };
    const { data, error } = f.id
      ? await supabase.from("notification_filters").update(payload).eq("id", f.id).select().single()
      : await supabase.from("notification_filters").insert(payload).select().single();
    setSaving(false);
    if (error) return toast.error("Fehler: " + error.message);
    setF({ ...DEFAULT_FILTER, ...(data as unknown as Filter) });
    toast.success("Suchabo gespeichert ✅");
  };

  const handleFetchChat = async () => {
    if (!f.telegram_bot_token) return toast.error("Bot-Token fehlt");
    const r = await fetchChat({ data: { token: f.telegram_bot_token } });
    if (r.ok) {
      setF((p) => ({ ...p, telegram_chat_id: r.chatId }));
      toast.success(`✅ Chat-ID abgerufen${r.name ? ` (${r.name})` : ""}`);
    } else {
      toast.warning("⚠️ " + r.error);
    }
  };

  const handleTest = async () => {
    if (!f.telegram_chat_id) return toast.error("Chat-ID fehlt");
    const r = await sendTest({ data: { filter: f } });
    if (r.ok) toast.success("Test-Nachricht gesendet 📨");
    else toast.error("Fehler: " + r.error);
  };

  

  if (loading) return <div className="p-8 text-muted-foreground">Lade…</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" /> Meine Wunsch-Benachrichtigung
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nur wenn ein neues Auto ALLE deine Kriterien erfüllt, bekommst du eine Telegram-Nachricht von @RohrGM_BOT.
        </p>
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <div className="font-medium">🔔 Benachrichtigung aktiv</div>
          <div className="text-xs text-muted-foreground">Schalte aus, um keine Nachrichten zu erhalten</div>
        </div>
        <button
          onClick={() => setF((p) => ({ ...p, is_active: !p.is_active }))}
          className={cn(
            "relative h-7 w-12 rounded-full transition",
            f.is_active ? "bg-primary" : "bg-muted",
          )}
        >
          <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white transition", f.is_active ? "left-5" : "left-0.5")} />
        </button>
      </div>

      {/* Marken */}
      <Card title="Marken">
        <div className="flex flex-wrap gap-2">
          {COMMON_MAKES.map((m) => (
            <Pill key={m} active={f.makes.includes(m)} onClick={() => toggleMake(m)}>{m}</Pill>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{f.makes.length === 0 ? "Alle Marken werden berücksichtigt" : `${f.makes.length} Marke(n) ausgewählt`}</p>
      </Card>

      {/* Modelle */}
      <Card title="Modelle">
        <div className="flex gap-2">
          <input
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModel())}
            placeholder="z.B. 320d, C220, A4 — kommagetrennt"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button onClick={addModel} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">+</button>
        </div>
        {f.models.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {f.models.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
                {m}
                <button onClick={() => removeModel(m)} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Sliders */}
      <Card title="Limits">
        <Slider label="Max. Kilometerstand" value={f.max_mileage ?? 0} onChange={(v) => setF((p) => ({ ...p, max_mileage: v }))}
          min={0} max={250000} step={5000} fmt={(v) => `${v.toLocaleString("de-CH")} km`} hint={(v) => `Nur Autos unter ${v.toLocaleString("de-CH")} km`} />
        <Slider label="Max. Preis (EUR)" value={f.max_price_eur ?? 0} onChange={(v) => setF((p) => ({ ...p, max_price_eur: v }))}
          min={5000} max={150000} step={1000} fmt={(v) => `${v.toLocaleString("de-CH")} €`} hint={(v) => `Nur Autos unter ${v.toLocaleString("de-CH")} €`} />
        <Slider label="Mindest-Marge (CHF)" value={f.min_margin_chf ?? 0} onChange={(v) => setF((p) => ({ ...p, min_margin_chf: v }))}
          min={0} max={10000} step={500} fmt={(v) => `CHF ${v.toLocaleString("de-CH")}`} hint={(v) => `Nur Autos mit Marge über CHF ${v.toLocaleString("de-CH")}`} hintColor="text-success" />
        <Slider label="Mindest Deal-Score" value={f.min_deal_score ?? 0} onChange={(v) => setF((p) => ({ ...p, min_deal_score: v }))}
          min={0} max={100} step={5} fmt={(v) => `${v}`} hint={(v) => `Nur Autos mit Score ${v} oder höher`}
          hintColor={f.min_deal_score && f.min_deal_score >= 80 ? "text-success" : f.min_deal_score && f.min_deal_score >= 65 ? "text-warning" : f.min_deal_score && f.min_deal_score >= 40 ? "text-amber-500" : "text-danger"} />
      </Card>

      {/* Treibstoff */}
      <Card title="Treibstoff">
        <div className="flex flex-wrap gap-2">
          {FUELS.map((m) => (
            <Pill key={m} active={f.fuel_types.includes(m)} onClick={() => toggleFuel(m)}>{m}</Pill>
          ))}
        </div>
      </Card>

      {/* Telegram */}
      <Card title="🤖 Telegram Bot: @RohrGM_BOT">
        <label className="text-xs text-muted-foreground">Bot Token</label>
        <div className="flex gap-2 mt-1">
          <input
            type={showToken ? "text" : "password"}
            value={f.telegram_bot_token}
            onChange={(e) => setF((p) => ({ ...p, telegram_bot_token: e.target.value }))}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <button onClick={() => setShowToken((s) => !s)} className="rounded-md border border-border px-3 hover:bg-accent">
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <label className="text-xs text-muted-foreground mt-4 block">Deine Chat-ID</label>
        <div className="flex gap-2 mt-1">
          <input
            value={f.telegram_chat_id}
            onChange={(e) => setF((p) => ({ ...p, telegram_chat_id: e.target.value }))}
            placeholder="z.B. 123456789"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <button onClick={handleFetchChat} className="inline-flex items-center gap-1 rounded-md border border-border px-3 hover:bg-accent text-sm">
            <RefreshCw className="h-4 w-4" /> Auto
          </button>
        </div>
        <div className="mt-3 rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
          💡 Falls Chat-ID leer:<br />1. Öffne Telegram<br />2. Schreib <span className="font-mono">@RohrGM_BOT</span> die Nachricht: „hallo"<br />3. Klick „Auto"
        </div>
      </Card>

      {/* Vorschau */}
      <Card title="Nachrichtenvorschau">
        <MessagePreview f={f} />
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 sticky bottom-20 lg:bottom-4">
        <button onClick={handleTest} className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm hover:bg-accent">
          <Send className="h-4 w-4" /> Test-Nachricht senden
        </button>
        <button onClick={save} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? "Speichert…" : "Speichern"}
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm border transition",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function Slider({
  label, value, onChange, min, max, step, fmt, hint, hintColor,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
  fmt: (v: number) => string; hint: (v: number) => string; hintColor?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm">{label}</span>
        <span className="text-sm font-mono">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
      <div className={cn("text-xs mt-1", hintColor ?? "text-muted-foreground")}>{hint(value)}</div>
    </div>
  );
}

function MessagePreview({ f }: { f: Filter }) {
  const sample = {
    make: "BMW", model: "320d", year: 2021,
    mileage: "87'000 km", fuel: "Diesel", transmission: "Automatik",
    price: "27'500 €", cost: "CHF 34'200", margin: "CHF 4'800", score: 82,
    location: "München", distance: "330 km",
    seller: "BMW Autohaus München", sellerType: "Händler",
    image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=900&q=80",
  };
  const criteria: { label: string; value: string }[] = [];
  if (f.makes.length > 0) criteria.push({ label: "Marke", value: sample.make });
  if (f.max_mileage != null) criteria.push({ label: "Laufleistung", value: `${sample.mileage} (max ${f.max_mileage.toLocaleString("de-CH")} km)` });
  if (f.max_price_eur != null) criteria.push({ label: "Preis", value: `${sample.price} (max ${f.max_price_eur.toLocaleString("de-CH")} €)` });
  if (f.min_margin_chf != null) criteria.push({ label: "Marge", value: `${sample.margin} (min CHF ${f.min_margin_chf.toLocaleString("de-CH")})` });
  if (f.min_deal_score != null) criteria.push({ label: "Score", value: `${sample.score}/100 (min ${f.min_deal_score})` });
  if (f.fuel_types.length > 0) criteria.push({ label: "Treibstoff", value: sample.fuel });

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden max-w-md">
      <div className="relative">
        <img src={sample.image} alt={`${sample.make} ${sample.model}`} className="w-full aspect-[16/10] object-cover" />
        <span className="absolute top-2 left-2 rounded bg-background/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-border">
          Beispiel · echtes Inseratbild folgt
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="font-semibold text-base">{sample.make} {sample.model} · {sample.year}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{sample.mileage} · {sample.fuel} · {sample.transmission}</div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Row label="Preis" value={sample.price} />
          <Row label="Einstand CH" value={sample.cost} />
          <Row label="Marge" value={sample.margin} bold />
          <Row label="Deal Score" value={`${sample.score}/100`} bold />
        </div>
        <div className="text-xs text-muted-foreground border-t border-border pt-2 space-y-1">
          <div>{sample.location} → Kloten {sample.distance}</div>
          <div>{sample.sellerType} · {sample.seller}</div>
        </div>
        {criteria.length > 0 && (
          <div className="border-t border-border pt-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Kriterien</div>
            <ul className="space-y-1 text-xs">
              {criteria.map((c) => (
                <li key={c.label} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-mono text-right">{c.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <a className="block text-xs text-primary hover:underline pt-1" href="#">Inserat öffnen →</a>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-mono", bold && "font-semibold")}>{value}</span>
    </>
  );
}
