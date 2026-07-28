import { useQuery } from "@tanstack/react-query";



interface OkxData {
  price: number; ema21: number; ema50: number;
  frAvg: number; frCur: number; frPos: number; frTotal: number;
  oiList: { date: string; oi: number }[];
  oiChg: number;
  weekly: { t: string; dateRange: string; o: number; h: number; l: number; c: number }[];
}
interface BinanceFR {
  frAvg: number; frCur: number; frPos: number; frTotal: number;
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const chars = "▁▂▃▄▅▆▇█";
  return (
    <span className="num tracking-wider text-cyan-400">
      {values.map((v, i) => chars[Math.round(((v - min) / range) * 7)]).join("")}
    </span>
  );
}

function PriceRow({ label, value, vs, vsLabel, statusPos }: {
  label: string; value: number; vs: number; vsLabel: string; statusPos: boolean;
}) {
  const pct = ((value / vs - 1) * 100);
  return (
    <tr className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{label}</td>
      <td className="px-4 py-3 text-right num font-semibold text-[hsl(var(--foreground))]">
        ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusPos ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
          {statusPos ? "✅ ABOVE" : "❌ BELOW"}
        </span>
      </td>
      <td className={`px-4 py-3 text-right num ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
      </td>
      <td className="px-4 py-3 text-right text-xs text-[hsl(var(--muted-foreground))]">{vsLabel}</td>
    </tr>
  );
}

function FRBadge({ val }: { val: number }) {
  if (val > 0.008) return <span className="text-xs px-2 py-0.5 rounded bg-red-500/15 text-red-400">🔴 Перегрів лонгів</span>;
  if (val < -0.005) return <span className="text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-400">🟢 Panic shorts</span>;
  if (val > 0.003) return <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-400">🟡 Помірно бичачий</span>;
  return <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">🟡 Нейтральний</span>;
}

export default function TechnicalSection({ report }: { report: any }) {
  const { data: okx, isLoading, error } = useQuery<OkxData>({
    queryKey: ["/api/okx/btc"],
    queryFn: async () => {
      const BASE = "https://www.okx.com";
      // Try direct fetch first (works in most browsers), fallback to CORS proxy
      async function okxFetch(path: string) {
        try {
          const r = await fetch(`${BASE}${path}`, { mode: "cors" });
          if (r.ok) return r.json();
        } catch {}
        // Fallback: corsproxy.io
        try {
          const r = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(BASE + path)}`);
          if (r.ok) return r.json();
        } catch {}
        // Fallback 2: allorigins
        const r2 = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(BASE + path)}`);
        return r2.json();
      }
      const [dailyRaw, weeklyRaw, frRaw, oiRaw] = await Promise.all([
        okxFetch("/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1D&limit=55"),
        okxFetch("/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1W&limit=9"),
        okxFetch("/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=21"),
        okxFetch("/api/v5/rubik/stat/contracts/open-interest-history?ccy=BTC&period=1D&limit=7&instId=BTC-USDT-SWAP"),
      ]);
      const closes = dailyRaw.data.map((c: any) => parseFloat(c[4])).reverse();
      const emaFn = (prices: number[], p: number) => {
        const k = 2 / (p + 1); let e = prices[0];
        for (const v of prices.slice(1)) e = v * k + e * (1 - k);
        return e;
      };
      const price = closes[closes.length - 1];
      const ema21 = emaFn(closes.slice(-21), 21);
      const ema50 = emaFn(closes, 50);
      const weekly = weeklyRaw.data.map((c: any) => {
        const openTs = parseInt(c[0]);
        const openDate = new Date(openTs);
        const closeDate = new Date(openTs + 6 * 24 * 60 * 60 * 1000);
        const fmt = (d: Date) => d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
        return {
          t: fmt(openDate),
          dateRange: `${fmt(openDate)}–${fmt(closeDate)}`,
          o: parseFloat(c[1]), h: parseFloat(c[2]), l: parseFloat(c[3]), c: parseFloat(c[4]),
        };
      }).reverse();
      const rates = frRaw.data.map((f: any) => parseFloat(f.fundingRate) * 100);
      const frAvg = rates.reduce((a: number, b: number) => a + b, 0) / rates.length;
      const frCur = rates[0];
      const frPos = rates.filter((r: number) => r > 0).length;
      const oiList = oiRaw.data.map((o: any) => ({
        date: new Date(parseInt(o[0])).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
        oi: parseFloat(o[1]),
      })).reverse();
      const oiCur = oiList[oiList.length - 1]?.oi || 0;
      const oiPrev = oiList[0]?.oi || 0;
      const oiChg = oiPrev > 0 ? ((oiCur / oiPrev - 1) * 100) : 0;
      return { price, ema21, ema50, frAvg, frCur, frPos, frTotal: rates.length, oiList, oiChg, weekly };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Binance funding rate — public API, no key needed
  const { data: bnFR } = useQuery<BinanceFR>({
    queryKey: ["/binance/fr"],
    queryFn: async () => {
      async function bnFetch(path: string) {
        const url = `https://fapi.binance.com${path}`;
        try { const r = await fetch(url, { mode: "cors" }); if (r.ok) return r.json(); } catch {}
        try { const r = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`); if (r.ok) return r.json(); } catch {}
        const r2 = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`); return r2.json();
      }
      const data: any[] = await bnFetch("/fapi/v1/fundingRate?symbol=BTCUSDT&limit=21");
      const rates = data.map((d: any) => parseFloat(d.fundingRate) * 100);
      return {
        frAvg: rates.reduce((a, b) => a + b, 0) / rates.length,
        frCur: rates[0],
        frPos: rates.filter(r => r > 0).length,
        frTotal: rates.length,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Always fall back to state.json data if OKX fails or is loading
  const d = okx;
  const price = d?.price ?? report?.btc_price ?? 0;
  const ema21 = d?.ema21 ?? report?.btc_ema21 ?? 0;
  const ema50 = d?.ema50 ?? report?.btc_ema50 ?? 0;

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        {isLoading ? (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">⏳ Завантажую live дані OKX...</span>
        ) : error ? (
          <span className="text-xs text-yellow-400">⚠ OKX недоступний — показуються збережені дані</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live · OKX BTC-USDT-SWAP
          </span>
        )}
      </div>

      {/* ── PRICE & EMAs ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span>💰</span> Ціна та EMAs
        </h2>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Метрика</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Значення</th>
                <th className="text-center px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Статус</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">vs EMA</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Орієнтир</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.5)]">
                <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">Ціна BTC</td>
                <td className="px-4 py-3 text-right num text-xl font-bold text-[hsl(var(--foreground))]">
                  ${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-center">—</td>
                <td className="px-4 py-3 text-right num text-[hsl(var(--muted-foreground))]">—</td>
                <td className="px-4 py-3 text-right text-xs text-[hsl(var(--muted-foreground))]">BTC-USDT-SWAP</td>
              </tr>
              {ema21 > 0 && <PriceRow label="EMA21 (daily)" value={ema21} vs={price} vsLabel="21-денна EMA" statusPos={price > ema21} />}
              {ema50 > 0 && <PriceRow label="EMA50 (daily)" value={ema50} vs={price} vsLabel="50-денна EMA" statusPos={price > ema50} />}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── WEEKLY STRUCTURE ── */}
      {d?.weekly && d.weekly.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
            <span>📊</span> Weekly Market Structure
            <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">(останні {Math.min(5, d.weekly.length)} тижнів)</span>
          </h2>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {["Тиждень","Open","High","Low","Close","WoW%","Структура"].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium ${h === "Тиждень" || h === "Структура" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.weekly.slice(-5).map((w, i, arr) => {
                  const chg = ((w.c - w.o) / w.o) * 100;
                  const prev = arr[i - 1];
                  const hh = prev ? (w.h > prev.h ? "HH ✅" : "LH") : "—";
                  const hl = prev ? (w.l > prev.l ? "HL ✅" : "LL") : "—";
                  const label = i === arr.length - 1 ? "W-0 (cur)" : `W-${arr.length - 1 - i}`;
                  return (
                    <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                      <td className="px-3 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{label}</td>
                      <td className="px-3 py-2.5 text-right num text-xs">${w.o.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                      <td className="px-3 py-2.5 text-right num text-xs text-green-400">${w.h.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                      <td className="px-3 py-2.5 text-right num text-xs text-red-400">${w.l.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                      <td className="px-3 py-2.5 text-right num text-xs font-medium">${w.c.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                      <td className={`px-3 py-2.5 text-right num text-xs font-semibold ${chg >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-left text-xs">
                        <span className={hh.includes("✅") ? "text-green-400" : "text-red-400"}>{hh}</span>
                        <span className="text-[hsl(var(--muted-foreground))] mx-1">/</span>
                        <span className={hl.includes("✅") ? "text-green-400" : "text-red-400"}>{hl}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── FUNDING RATE ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span>🔥</span> Funding Rate
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">7d (21 period по 8 год)</span>
        </h2>

        {/* OKX + Binance side-by-side */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { name: "🟠 OKX", sub: "BTC-USDT-SWAP", data: d ? { avg: d.frAvg, cur: d.frCur, pos: d.frPos, total: d.frTotal } : null, fallbackAvg: report.btc_fr_avg_7d },
            { name: "🟡 Binance", sub: "BTCUSDT PERP", data: bnFR ? { avg: bnFR.frAvg, cur: bnFR.frCur, pos: bnFR.frPos, total: bnFR.frTotal } : null, fallbackAvg: null },
          ].map((exch, ei) => (
            <div key={ei} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-[hsl(var(--foreground))]">{exch.name}</span>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{exch.sub}</span>
                {!exch.data && <span className="text-[10px] text-[hsl(var(--muted-foreground))] ml-auto">— завантаження...</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "7d середній", value: exch.data ? `${exch.data.avg >= 0 ? "+" : ""}${exch.data.avg.toFixed(4)}%` : exch.fallbackAvg != null ? `${exch.fallbackAvg >= 0 ? "+" : ""}${exch.fallbackAvg.toFixed(4)}%` : "н/д" },
                  { label: "Поточний", value: exch.data ? `${exch.data.cur >= 0 ? "+" : ""}${exch.data.cur.toFixed(4)}%` : "н/д" },
                  { label: "Позитивних", value: exch.data ? `${Math.round(exch.data.pos / exch.data.total * 100)}%` : "н/д" },
                ].map((c, i) => (
                  <div key={i}>
                    <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-0.5">{c.label}</div>
                    <div className="num text-sm font-semibold text-[hsl(var(--foreground))]">{c.value}</div>
                  </div>
                ))}
              </div>
              {exch.data && <FRBadge val={exch.data.avg} />}
            </div>
          ))}
        </div>

        {/* Divergence alert */}
        {d && bnFR && Math.abs(d.frAvg - bnFR.frAvg) > 0.002 && (
          <div className="flex items-center gap-2 p-3 mb-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
            ⚠️ Дивергенція OKX vs Binance: {Math.abs(d.frAvg - bnFR.frAvg).toFixed(4)}% — можливий арбітраж між біржами
          </div>
        )}

        {(d || bnFR) && (
          <div className="flex items-center gap-3 p-3 bg-[hsl(var(--muted))] rounded-lg">
            <FRBadge val={(d?.frAvg ?? bnFR?.frAvg ?? 0)} />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {(d?.frAvg ?? bnFR?.frAvg ?? 0) > 0.008 ? "Перегрів лонгів — підвищений ризик корекції вниз."
                : (d?.frAvg ?? bnFR?.frAvg ?? 0) < -0.005 ? "Панічні шорти — можливий шорт-сквіз."
                : "Нейтральний фандинг — немає ознак перегріву лонгів або панічних шортів. Простір для руху вгору є."}
            </span>
          </div>
        )}
      </section>

      {/* ── OPEN INTEREST ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span>📈</span> Open Interest
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">OKX BTC-USDT-SWAP · 7d</span>
          {d && (
            <span className={`num text-xs font-medium ${d.oiChg >= 0 ? "text-green-400" : "text-red-400"}`}>
              WoW: {d.oiChg >= 0 ? "+" : ""}{d.oiChg.toFixed(2)}%
            </span>
          )}
        </h2>
        {d?.oiList && (
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Дата</th>
                  <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">OI (контракти)</th>
                  <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Δ</th>
                  <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {d.oiList.map((row, i) => {
                  const prev = i > 0 ? d.oiList[i - 1].oi : null;
                  const chg = prev ? ((row.oi / prev - 1) * 100) : null;
                  return (
                    <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                      <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{row.date}</td>
                      <td className="px-4 py-2.5 text-right num text-xs">{row.oi.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className={`px-4 py-2.5 text-right num text-xs ${chg == null ? "" : chg >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {chg != null && <Sparkline values={[0, chg > 0 ? 1 : -1, chg]} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── KEY LEVELS ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span>🎯</span> Ключові рівні тижня
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">28.07–01.08</span>
        </h2>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
          {[
            { label: "Resistance 2", price: 66928, type: "resistance", note: "Weekly High W-1" },
            { label: "Resistance 1", price: 65740, type: "resistance", note: "Weekly High W-0 (поточний)" },
            { label: "→ Ціна", price: price, type: "current", note: "BTC зараз" },
            { label: "Support 1", price: ema21, type: "support", note: "EMA21 daily" },
            { label: "Support 2", price: ema50, type: "support", note: "EMA50 daily" },
            { label: "Support 3", price: 63700, type: "support", note: "Weekly Low W-1" },
            { label: "Major Support", price: 61800, type: "major", note: "Weekly Low W-2 / структурна" },
          ].map((row, i) => {
            const typeStyle = row.type === "resistance" ? "text-red-400 bg-red-500/10 border-red-500/20"
              : row.type === "current" ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/20"
              : row.type === "major" ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
              : "text-green-400 bg-green-500/10 border-green-500/20";
            const barPct = price > 0 ? Math.min(100, Math.max(0, ((row.price - 55000) / (75000 - 55000)) * 100)) : 50;
            return (
              <div key={i} className={`flex items-center gap-4 px-4 py-2.5 border-b border-[hsl(var(--border))] last:border-0 ${row.type === "current" ? "bg-[hsl(var(--muted)/0.3)]" : ""}`}>
                <div className="w-32 text-xs text-[hsl(var(--muted-foreground))]">{row.label}</div>
                <div className={`num font-semibold text-sm ${row.type === "current" ? "text-cyan-400" : row.type === "resistance" ? "text-red-400" : "text-green-400"}`}>
                  ${row.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
                <div className="flex-1 mx-3">
                  <div className="h-1 bg-[hsl(var(--muted))] rounded-full">
                    <div className={`h-1 rounded-full ${row.type === "resistance" ? "bg-red-400" : row.type === "current" ? "bg-cyan-400" : "bg-green-400"}`}
                      style={{ width: `${barPct}%` }} />
                  </div>
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] w-48 text-right">{row.note}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 BTC утримує висхідну weekly структуру (HH/HL, 4 тижні поспіль) вище обох EMAs. Funding rate нейтральний. OI -1.35% WoW при зростанні ціни = ринок росте на закритті позицій. Ключові рівні: <span className="text-green-400">$64,572</span> (EMA21, Support) та <span className="text-red-400">$66,928</span> (W-1 High, Resistance) визначатимуть напрямок після FOMC 30.07.
        </div>
      </section>

      {/* ── TECH SCORE BREAKDOWN (Formula C) ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span>⚙️</span> Tech Score — Formula C
          <span className="text-xs px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 rounded font-mono">40% ваги</span>
          {report?.tech_score !== undefined && (
            <span className="ml-auto num text-lg font-bold text-[hsl(var(--foreground))]">{report.tech_score}/100</span>
          )}
        </h2>

        {/* Live tech score calculator */}
        {(() => {
          const pr = d?.price ?? report?.btc_price ?? 0;
          const e21 = d?.ema21 ?? report?.btc_ema21 ?? 0;
          const e50 = d?.ema50 ?? report?.btc_ema50 ?? 0;
          const frA = d?.frAvg ?? report?.btc_fr_avg_7d ?? 0;
          const frC = d?.frCur ?? report?.btc_fr_cur ?? 0;
          const oiC = report?.btc_oi_chg_wow ?? 0;

          if (!pr || !e21 || !e50) return null;

          const pct21 = (pr / e21 - 1) * 100;
          const pct50 = (pr / e50 - 1) * 100;

          const ema21Adj = pct21 > 3 ? +10 : pct21 > 1 ? +6 : pct21 > 0 ? +3 : pct21 > -1 ? -5 : pct21 > -3 ? -8 : -12;
          const ema50Adj = pct50 > 2 ? +8 : pct50 > 0.5 ? +4 : pct50 > 0 ? +2 : pct50 > -1 ? -4 : pct50 > -2.5 ? -6 : -8;
          const frAvgAdj = frA > 0.020 ? -6 : frA > 0.010 ? -2 : frA > 0.003 ? +3 : frA > -0.003 ? 0 : frA > -0.010 ? +5 : +6;
          const frCurAdj = frC > 0.015 ? -5 : frC > 0.005 ? -2 : frC > 0 ? +1 : frC > -0.005 ? +3 : +5;
          const oiAdj = oiC > 5 ? +6 : oiC > 2 ? +3 : oiC > -2 ? 0 : oiC > -5 ? -3 : oiC > -10 ? -5 : -6;
          const techLive = Math.max(0, Math.min(100, Math.round(50 + ema21Adj + ema50Adj + frAvgAdj + frCurAdj + oiAdj)));

          const rows = [
            { label: 'EMA21', value: `${pct21 >= 0 ? '+' : ''}${pct21.toFixed(2)}%`, adj: ema21Adj, hint: `Ціна ${pct21 >= 0 ? 'вище' : 'нижче'} EMA21` },
            { label: 'EMA50', value: `${pct50 >= 0 ? '+' : ''}${pct50.toFixed(2)}%`, adj: ema50Adj, hint: `Ціна ${pct50 >= 0 ? 'вище' : 'нижче'} EMA50` },
            { label: 'FR avg 21d', value: `${frA >= 0 ? '+' : ''}${frA.toFixed(4)}%`, adj: frAvgAdj, hint: 'Середній фандинг 21d' },
            { label: 'FR поточний', value: `${frC >= 0 ? '+' : ''}${frC.toFixed(4)}%`, adj: frCurAdj, hint: 'Поточний FR' },
            { label: 'OI 7d', value: `${oiC >= 0 ? '+' : ''}${oiC.toFixed(2)}%`, adj: oiAdj, hint: 'Зміна Open Interest' },
          ];

          return (
            <div>
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden mb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))]">
                      <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Компонент</th>
                      <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Значення</th>
                      <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Score adj</th>
                      <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Інтерпретація</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                      <td className="px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">База</td>
                      <td className="px-4 py-2 text-right num text-xs">—</td>
                      <td className="px-4 py-2 text-right num text-xs text-[hsl(var(--muted-foreground))]">50</td>
                      <td className="px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">Нейтральна база</td>
                    </tr>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                        <td className="px-4 py-2.5 text-xs text-[hsl(var(--foreground))] font-medium">{row.label}</td>
                        <td className="px-4 py-2.5 text-right num text-xs text-[hsl(var(--foreground))]">{row.value}</td>
                        <td className={`px-4 py-2.5 text-right num text-xs font-bold ${
                          row.adj > 0 ? 'text-green-400' : row.adj < 0 ? 'text-red-400' : 'text-[hsl(var(--muted-foreground))]'
                        }`}>
                          {row.adj > 0 ? '+' : ''}{row.adj}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{row.hint}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]">
                      <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-[hsl(var(--foreground))]">Tech Score (live)</td>
                      <td className={`px-4 py-2.5 text-right num text-lg font-bold ${
                        techLive >= 60 ? 'text-green-400' : techLive >= 40 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{techLive}</td>
                      <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">50 {rows.map(r => `${r.adj >= 0 ? '+' : ''}${r.adj}`).join(' ')} = {techLive}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Composite preview */}
              {report?.macro_score_adj !== undefined && report?.cot_score !== undefined && (
                <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-cyan-400 font-semibold">🧮 Composite preview (Formula C)</span>
                    <span className="text-[hsl(var(--muted-foreground))]">Macro×0.25 + COT×0.35 + Tech×0.40</span>
                  </div>
                  <div className="num text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">= </span>
                    <span className="text-[hsl(var(--foreground))]">{report.macro_score_adj}</span>
                    <span className="text-[hsl(var(--muted-foreground))]">×0.25</span>
                    <span className="text-[hsl(var(--muted-foreground))] mx-1">+</span>
                    <span className="text-[hsl(var(--foreground))]">{report.cot_score}</span>
                    <span className="text-[hsl(var(--muted-foreground))]">×0.35</span>
                    <span className="text-[hsl(var(--muted-foreground))] mx-1">+</span>
                    <span className="text-cyan-400 font-bold">{techLive}</span>
                    <span className="text-[hsl(var(--muted-foreground))]">×0.40</span>
                    <span className="text-[hsl(var(--muted-foreground))] mx-2">=</span>
                    <span className={`font-bold text-base ${
                      (() => { const c = +(report.macro_score_adj * 0.25 + report.cot_score * 0.35 + techLive * 0.40).toFixed(1); return c >= 60 ? 'text-green-400' : c >= 48 ? 'text-yellow-400' : c >= 38 ? 'text-orange-400' : 'text-red-400'; })()
                    }`}>
                      {(report.macro_score_adj * 0.25 + report.cot_score * 0.35 + techLive * 0.40).toFixed(1)}
                    </span>
                    <span className="text-[hsl(var(--muted-foreground))] ml-1 text-[10px]">(saved: {report.composite_score})</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
