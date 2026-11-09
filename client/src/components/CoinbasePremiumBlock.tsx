// ─────────────────────────────────────────────────────────────────────────
// БЛОК 2.1 — COINBASE PREMIUM (попит американського споту)
// ─────────────────────────────────────────────────────────────────────────
// Інформаційна метрика: НЕ входить у composite / trade_signal.
// premium = Coinbase BTC-USD / (OKX BTC-USDT × USDT-USD) − 1. Рахує scripts/coinbase_premium.py (daily cron).

type Hist = { d: string; v: number };

const LABELS: Record<string, { text: string; cls: string }> = {
  strong:  { text: "🟢 Попит США сильний",    cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  neutral: { text: "🟡 Попит США нейтральний", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  weak:    { text: "🔴 Попит США слабкий",     cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

function pct(v: number | null | undefined, digits = 3) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function tone(v: number | null | undefined, weak: number, strong: number) {
  if (v == null) return "text-[hsl(var(--foreground))]";
  if (v >= strong) return "text-green-400";
  if (v <= weak) return "text-red-400";
  return "text-yellow-400";
}

function Bars({ hist, weak, strong }: { hist: Hist[]; weak: number; strong: number }) {
  if (!hist || hist.length < 2) {
    return <div className="text-xs text-[hsl(var(--muted-foreground))]">Історія ще накопичується</div>;
  }
  const W = 600, H = 120, pad = 8;
  const vals = hist.map(h => h.v);
  const hi = Math.max(0, strong, ...vals), lo = Math.min(0, weak, ...vals);
  const span = (hi - lo) || 0.01;
  const y = (v: number) => pad + ((hi - v) / span) * (H - pad * 2);
  const bw = (W - pad * 2) / hist.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-32" role="img" aria-label="Coinbase Premium, денні середні за 30 днів">
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="hsl(var(--border))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1={pad} x2={W - pad} y1={y(strong)} y2={y(strong)} className="text-green-400" stroke="currentColor" strokeOpacity="0.5" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1={pad} x2={W - pad} y1={y(weak)} y2={y(weak)} className="text-red-400" stroke="currentColor" strokeOpacity="0.5" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {hist.map((h, i) => {
        const top = Math.min(y(0), y(h.v));
        const height = Math.max(1, Math.abs(y(h.v) - y(0)));
        return (
          <rect key={h.d} x={pad + i * bw + bw * 0.15} y={top} width={bw * 0.7} height={height} rx="1"
            className={h.v >= 0 ? "text-green-400" : "text-red-400"} fill="currentColor" fillOpacity={0.85}>
            <title>{`${h.d}: ${pct(h.v)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export default function CoinbasePremiumBlock({ report }: { report: any }) {
  const r = report ?? {};
  const has = r.cb_premium_7d != null;
  const th = r.cb_premium_thresholds ?? { weak: -0.009, strong: 0.003, calibrated: "2026-11-09" };
  const label = LABELS[r.cb_premium_label] ?? null;
  const status: string = r.cb_premium_status ?? "";
  const stale = status && !status.startsWith("ok");
  const hist: Hist[] = Array.isArray(r.cb_premium_history) ? r.cb_premium_history : [];
  const first = hist[0]?.d, last = hist[hist.length - 1]?.d;

  return (
    <section>
      <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex flex-wrap items-center gap-2">
        <span className="text-blue-400">🇺🇸</span> БЛОК 2.1 — COINBASE PREMIUM
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
          інформаційно · не в composite
        </span>
        {label && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${label.cls}`}>{label.text}</span>
        )}
        {stale && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
            ⏳ дані неповні
          </span>
        )}
      </h2>

      {!has ? (
        <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))]">
          Coinbase Premium з'явиться після найближчого щоденного оновлення.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Середня за 7 днів</div>
              <div className={`num text-xl font-semibold ${tone(r.cb_premium_7d, th.weak, th.strong)}`}>{pct(r.cb_premium_7d)}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {r.cb_premium_pctile != null ? `перцентиль за рік ≈ ${r.cb_premium_pctile}%` : "основний сигнал"}
              </div>
            </div>
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Середня за 24 год</div>
              <div className={`num text-xl font-semibold ${tone(r.cb_premium_24h, th.weak, th.strong)}`}>{pct(r.cb_premium_24h)}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">остання година {pct(r.cb_premium_pct)}</div>
            </div>
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Години з премією &gt; 0</div>
              <div className="num text-xl font-semibold text-[hsl(var(--foreground))]">
                {r.cb_premium_pos_hours_7d ?? "—"}<span className="text-sm text-[hsl(var(--muted-foreground))]">/{r.cb_premium_hours_7d ?? 168}</span>
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">за 7 днів</div>
            </div>
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Пороги (7 днів)</div>
              <div className="num text-xs md:text-sm font-semibold mt-1 leading-snug whitespace-nowrap">
                <div className="text-green-400">сильний ≥ {pct(th.strong)}</div>
                <div className="text-red-400">слабкий ≤ {pct(th.weak)}</div>
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">калібровано {th.calibrated}</div>
            </div>
          </div>

          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3 mb-3">
            <div className="flex flex-wrap justify-between gap-x-3 text-xs text-[hsl(var(--muted-foreground))] mb-2">
              <span>Денна середня премія, 30 днів · пунктир — пороги</span>
              <span className="text-[11px]">{first && last ? `${first} → ${last}` : ""}</span>
            </div>
            <Bars hist={hist} weak={th.weak} strong={th.strong} />
          </div>

          <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
            💬 Премія = Coinbase BTC-USD до OKX BTC-USDT з поправкою на курс USDT. Плюс — американський спот купує активніше
            за решту ринку, мінус — продає або стоїть осторонь. За рік: коли 7-денна середня була ≥ {pct(th.strong)}, BTC за
            наступний тиждень у середньому ріс на ~1.1–1.3%; коли ≤ {pct(th.weak)} — падав на ~1.8%. Сигнал слабкий
            (кореляція ≈ 0.15), тому дивимось разом із потоками ETF; ETF-покупки через Coinbase Prime сюди не потрапляють.
          </div>
        </>
      )}

      <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))] text-right">
        {r.cb_premium_updated && <>Оновлено: {String(r.cb_premium_updated).replace("T", " ").replace(":00Z", " UTC")} · </>}
        Джерела: {r.cb_premium_source ?? "Coinbase · OKX"} · без API-ключа
      </div>
    </section>
  );
}
