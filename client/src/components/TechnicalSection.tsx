import { useQuery } from "@tanstack/react-query";



interface OkxData {
  price: number; ema21: number; ema50: number;
  frAvg: number; frCur: number; frPos: number; frTotal: number;
  rsi14: number; // weekly RSI14 for Formula v3
  oiList: { date: string; oi: number }[];
  oiChg: number; oiChgWeekly: number; // oiChgWeekly = WoW% for v3
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
  // ціна vs EMA: наскільки ціна вище/нижче EMA (узгоджено зі статусом ABOVE/BELOW)
  const pct = ((vs / value - 1) * 100);
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
      // ⚠️ Formula v3: weekly candles for EMA21 + RSI14, weekly OI for WoW change
      const [weeklyCandles, weeklyOiRaw, frRaw, dailyOiRaw] = await Promise.all([
        okxFetch("/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1W&limit=55"),
        okxFetch("/api/v5/rubik/stat/contracts/open-interest-history?ccy=BTC&period=1W&limit=3&instId=BTC-USDT-SWAP"),
        okxFetch("/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=21"),
        okxFetch("/api/v5/rubik/stat/contracts/open-interest-history?ccy=BTC&period=1D&limit=7&instId=BTC-USDT-SWAP"),
      ]);
      const wCloses = weeklyCandles.data.map((c: any) => parseFloat(c[4])).reverse();
      const emaFn = (prices: number[], p: number) => {
        const k = 2 / (p + 1); let e = prices[0];
        for (const v of prices.slice(1)) e = v * k + e * (1 - k);
        return e;
      };
      // RSI14 on weekly closes
      const rsi14Fn = (prices: number[]) => {
        const last15 = prices.slice(-15);
        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i < 15; i++) {
          const diff = last15[i] - last15[i-1];
          if (diff > 0) avgGain += diff; else avgLoss -= diff;
        }
        avgGain /= 14; avgLoss /= 14;
        const rs = avgLoss > 0 ? avgGain / avgLoss : 999;
        return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
      };
      const price = wCloses[wCloses.length - 1];
      const ema21 = emaFn(wCloses.slice(-21), 21);
      const ema50 = emaFn(wCloses.slice(-50), 50); // kept for price table display only
      const rsi14 = rsi14Fn(wCloses);
      // Weekly structure table — use last 9 weekly candles
      const weekly = weeklyCandles.data.slice(0, 9).map((c: any) => {
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
      // Daily OI list for sparkline display
      const oiList = dailyOiRaw.data.map((o: any) => ({
        date: new Date(parseInt(o[0])).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
        oi: parseFloat(o[1]),
      })).reverse();
      const oiCur = oiList[oiList.length - 1]?.oi || 0;
      const oiPrev7d = oiList[0]?.oi || 0;
      const oiChg = oiPrev7d > 0 ? ((oiCur / oiPrev7d - 1) * 100) : 0;
      // Weekly OI change for Formula v3 Tech Score
      const wOiList = weeklyOiRaw.data.map((o: any) => parseFloat(o[1])).reverse();
      const oiChgWeekly = wOiList.length >= 2 && wOiList[0] > 0
        ? ((wOiList[wOiList.length-1] / wOiList[0] - 1) * 100)
        : oiChg; // fallback to daily if weekly not available
      return { price, ema21, ema50, frAvg, frCur, frPos, frTotal: rates.length, rsi14, oiList, oiChg, oiChgWeekly, weekly };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Binance funding rate — public API, no key needed
  const { data: bnFR, isError: bnError } = useQuery<BinanceFR>({
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
  const rsi14Live = d?.rsi14 ?? report?.btc_rsi14 ?? 0;

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
              {ema21 > 0 && <PriceRow label="EMA21 (weekly)" value={ema21} vs={price} vsLabel="21-тижнева EMA" statusPos={price > ema21} />}
              {ema50 > 0 && <PriceRow label="EMA50 (weekly)" value={ema50} vs={price} vsLabel="50-тижнева EMA" statusPos={price > ema50} />}
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
                {!exch.data && <span className="text-[10px] text-[hsl(var(--muted-foreground))] ml-auto">{ei === 1 && bnError ? "⚠ недоступний (CORS/гео)" : "— завантаження..."}</span>}
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
        {(() => {
          const w0High = (report as any).btc_w0_high ?? 0;
          const w0Low  = (report as any).btc_w0_low  ?? 0;
          const w1High = (report as any).btc_w1_high ?? 0;
          const w1Low  = (report as any).btc_w1_low  ?? 0;
          const w2High = (report as any).btc_w2_high ?? 0;
          const w2Low  = (report as any).btc_w2_low  ?? 0;
          const structure: string = (report as any).btc_weekly_structure ?? '';
          const weekLabel: string = (report as any).week_label ?? '';

          // Determine structure label and color
          const isUptrend = structure.includes('HH/HL');
          const isDowntrend = structure.includes('LH/LL');
          const structureColor = isUptrend ? 'text-green-400' : isDowntrend ? 'text-red-400' : 'text-yellow-400';

          // Price range for bar display
          const minP = Math.min(price, w0Low, w1Low, w2Low, ema21 ?? price) * 0.99;
          const maxP = Math.max(price, w0High, w1High, w2High, ema21 ?? price) * 1.01;
          const barPct = (p: number) => maxP > minP ? Math.min(100, Math.max(2, ((p - minP) / (maxP - minP)) * 100)) : 50;

          const levels = [
            ...(w2High > 0 ? [{ label: "Resistance 2", price: w2High, type: "resistance", note: "Weekly High W-2" }] : []),
            ...(w1High > 0 ? [{ label: "Resistance 1", price: w1High, type: "resistance", note: "Weekly High W-1" }] : []),
            { label: "→ Ціна", price: price, type: "current", note: "BTC зараз" },
            ...(ema21 ? [{ label: "Support 1", price: ema21, type: "support", note: "EMA21 weekly" }] : []),
            ...(w1Low > 0 ? [{ label: "Support 2", price: w1Low, type: "support", note: "Weekly Low W-1" }] : []),
            ...(w2Low > 0 ? [{ label: "Major Support", price: w2Low, type: "major", note: "Weekly Low W-2 / структурна" }] : []),
          ].sort((a, b) => b.price - a.price);

          return (
            <>
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
                <span>🎯</span> Ключові рівні тижня
                {weekLabel && <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">{weekLabel}</span>}
                {structure && <span className={`text-[10px] font-normal ml-auto ${structureColor}`}>{structure}</span>}
              </h2>
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
                {levels.map((row, i) => {
                  const typeStyle = row.type === "resistance" ? "text-red-400 bg-red-500/10 border-red-500/20"
                    : row.type === "current" ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/20"
                    : row.type === "major" ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
                    : "text-green-400 bg-green-500/10 border-green-500/20";
                  return (
                    <div key={i} className={`flex items-center gap-4 px-4 py-2.5 border-b border-[hsl(var(--border))] last:border-0 ${row.type === "current" ? "bg-[hsl(var(--muted)/0.3)]" : ""}`}>
                      <div className="w-32 text-xs text-[hsl(var(--muted-foreground))]">{row.label}</div>
                      <div className={`num font-semibold text-sm ${row.type === "current" ? "text-cyan-400" : row.type === "resistance" ? "text-red-400" : "text-green-400"}`}>
                        ${row.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </div>
                      <div className="flex-1 mx-3">
                        <div className="h-1 bg-[hsl(var(--muted))] rounded-full">
                          <div className={`h-1 rounded-full ${row.type === "resistance" ? "bg-red-400" : row.type === "current" ? "bg-cyan-400" : "bg-green-400"}`}
                            style={{ width: `${barPct(row.price)}%` }} />
                        </div>
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))] w-48 text-right">{row.note}</div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {(() => {
          const p = report?.btc_price;
          const e21 = report?.btc_ema21;
          const rsi = report?.btc_rsi14;
          const fr = report?.btc_fr_cur;
          const oiChg = report?.btc_oi_chg_wow;
          if (!p || !e21) return null;
          const pctVsEma = ((p / e21 - 1) * 100);
          const aboveEma = p > e21;
          const frLabel = fr === undefined ? '' : fr > 0.01 ? 'перегрів лонгів' : fr < -0.005 ? 'тиск шортів' : 'нейтральний';
          const oiLabel = oiChg === undefined ? '' : oiChg > 5 ? 'OI ↑ зростає — нові позиції' : oiChg < -5 ? 'OI ↓ скорочується — делеверидж' : 'OI нейтральний';
          return (
            <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              💬 BTC{' '}
              <span className={aboveEma ? 'text-green-400' : 'text-red-400'}>
                {aboveEma ? 'вище' : 'нижче'} EMA21
              </span>{' '}
              (${e21.toFixed(0)}, {pctVsEma > 0 ? '+' : ''}{pctVsEma.toFixed(2)}%).{' '}
              {rsi !== undefined && <>RSI14: <span className={`num ${rsi >= 60 ? 'text-green-400' : rsi <= 40 ? 'text-red-400' : 'text-yellow-400'}`}>{rsi.toFixed(1)}</span>{rsi >= 70 ? ' — перекупленість' : rsi <= 30 ? ' — перепроданість' : ''}. </>}
              {fr !== undefined && <>FR: <span className={`num ${fr > 0.01 ? 'text-red-400' : fr < -0.005 ? 'text-green-400' : 'text-[hsl(var(--foreground))]'}`}>{fr > 0 ? '+' : ''}{fr.toFixed(4)}%</span> — {frLabel}. </>}
              {oiChg !== undefined && <>{oiLabel} ({oiChg > 0 ? '+' : ''}{oiChg.toFixed(2)}% WoW).</>}
            </div>
          );
        })()}
      </section>

      {/* ── TECH SCORE BREAKDOWN (Formula v3) ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span>⚙️</span> Tech Score — Formula v3
          <span className="text-xs px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 rounded font-mono">40% ваги</span>
          {report?.tech_score !== undefined && (
            <span className="ml-auto num text-lg font-bold text-[hsl(var(--foreground))]">{report.tech_score}/100</span>
          )}
        </h2>

        {/* Live tech score calculator */}
        {(() => {
          // ── Formula v3 live Tech Score ──
          const pr = d?.price ?? report?.btc_price ?? 0;
          const e21 = d?.ema21 ?? report?.btc_ema21 ?? 0;
          const rsi = d?.rsi14 ?? report?.btc_rsi14 ?? 0;
          const frC = d?.frCur ?? report?.btc_fr_cur ?? 0;
          // Use weekly OI change for v3 (from live fetch or saved)
          const oiC = d?.oiChgWeekly ?? report?.btc_oi_chg_wow ?? 0;

          if (!pr || !e21) return null;

          const pct21 = (pr / e21 - 1) * 100;

          // EMA21 adj (weekly price vs weekly EMA21)
          const ema21Adj = pct21 > 3 ? +10 : pct21 > 1 ? +6 : pct21 > 0 ? +3 : pct21 > -1 ? -5 : pct21 > -3 ? -8 : -12;
          // RSI14 weekly
          const rsiAdj = rsi >= 60 ? +7 : rsi >= 50 ? +3 : rsi >= 40 ? -3 : -7;
          // FR current (contrarian to longs)
          const frCurAdj = frC > 0.015 ? -5 : frC > 0.005 ? -2 : frC > 0 ? +1 : frC > -0.005 ? +3 : +5;
          // OI WoW change — CONTRARIAN (high OI = bearish)
          const oiAdj = oiC > 5 ? -6 : oiC > 2 ? -3 : oiC > -2 ? 0 : oiC > -5 ? +3 : oiC > -10 ? +5 : +6;
          const techLive = Math.max(0, Math.min(100, Math.round(50 + ema21Adj + rsiAdj + frCurAdj + oiAdj)));

          const rows = [
            { label: 'EMA21 (weekly)', value: `${pct21 >= 0 ? '+' : ''}${pct21.toFixed(2)}%`, adj: ema21Adj, hint: `Ціна ${pct21 >= 0 ? 'вище' : 'нижче'} weekly EMA21` },
            { label: 'RSI14 (weekly)', value: `${rsi.toFixed(2)}`, adj: rsiAdj, hint: `RSI14 тижневий: ${rsi >= 60 ? 'Перекупленість' : rsi >= 50 ? 'Бичачий' : rsi >= 40 ? 'Нейтральний' : 'Перепроданість'}` },
            { label: 'FR поточний', value: `${frC >= 0 ? '+' : ''}${frC.toFixed(4)}%`, adj: frCurAdj, hint: 'Поточний funding rate' },
            { label: 'OI WoW (контрар)', value: `${oiC >= 0 ? '+' : ''}${oiC.toFixed(2)}%`, adj: oiAdj, hint: `OI ${oiC >= 0 ? 'зріс' : 'скоротився'} WoW — контрарний сигнал` },
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
                      <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">50 {rows.map(r => `${r.adj >= 0 ? '+' : ''}${r.adj}`).join(' ')} = {techLive} · saved: {report?.tech_score ?? '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Composite preview */}
              {report?.macro_score_adj !== undefined && (report?.crypto_score !== undefined || report?.cot_score !== undefined) && (
                <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-cyan-400 font-semibold">🧮 Composite preview (Formula v3)</span>
                    <span className="text-[hsl(var(--muted-foreground))]">Macro×0.25 + Crypto×0.35 + Tech×0.40</span>
                  </div>
                  <div className="num text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">= </span>
                    <span className="text-[hsl(var(--foreground))]">{report.macro_score_adj}</span>
                    <span className="text-[hsl(var(--muted-foreground))]">×0.25</span>
                    <span className="text-[hsl(var(--muted-foreground))] mx-1">+</span>
                    <span className="text-[hsl(var(--foreground))]">{report.crypto_score}</span>
                    <span className="text-[hsl(var(--muted-foreground))]">×0.35</span>
                    <span className="text-[hsl(var(--muted-foreground))] mx-1">+</span>
                    <span className="text-cyan-400 font-bold">{techLive}</span>
                    <span className="text-[hsl(var(--muted-foreground))]">×0.40</span>
                    <span className="text-[hsl(var(--muted-foreground))] mx-2">=</span>
                    <span className={`font-bold text-base ${
                      (() => { const c = +(report.macro_score_adj * 0.25 + (report.crypto_score ?? report.cot_score) * 0.35 + techLive * 0.40).toFixed(1); return c >= 65 ? 'text-green-400' : c >= 53 ? 'text-yellow-400' : c >= 38 ? 'text-orange-400' : 'text-red-400'; })()
                    }`}>
                      {(report.macro_score_adj * 0.25 + (report.crypto_score ?? report.cot_score) * 0.35 + techLive * 0.40).toFixed(1)}
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
