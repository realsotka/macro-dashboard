import { useQuery } from "@tanstack/react-query";



interface OkxData {
  price: number; ema21: number; ema50: number;
  frAvg: number; frCur: number; frPos: number; frTotal: number;
  oiList: { date: string; oi: number }[];
  oiChg: number;
  weekly: { t: string; o: number; h: number; l: number; c: number }[];
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
      // Use allorigins CORS proxy to avoid CORS block on GitHub Pages
      const proxyUrl = (url: string) =>
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const BASE = "https://www.okx.com";
      const [dailyRaw, weeklyRaw, frRaw, oiRaw] = await Promise.all([
        fetch(proxyUrl(`${BASE}/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1D&limit=55`)).then(r => r.json()),
        fetch(proxyUrl(`${BASE}/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1W&limit=9`)).then(r => r.json()),
        fetch(proxyUrl(`${BASE}/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=21`)).then(r => r.json()),
        fetch(proxyUrl(`${BASE}/api/v5/rubik/stat/contracts/open-interest-history?ccy=BTC&period=1D&limit=7&instId=BTC-USDT-SWAP`)).then(r => r.json()),
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
      const weekly = weeklyRaw.data.map((c: any) => ({
        t: new Date(parseInt(c[0])).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
        o: parseFloat(c[1]), h: parseFloat(c[2]), l: parseFloat(c[3]), c: parseFloat(c[4]),
      })).reverse();
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
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">OKX · 7d (21 period по 8 год)</span>
        </h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "7d середній", value: d ? `${d.frAvg >= 0 ? "+" : ""}${d.frAvg.toFixed(4)}%` : `${(report.btc_fr_avg_7d || 0) >= 0 ? "+" : ""}${(report.btc_fr_avg_7d || 0).toFixed(4)}%`, sub: "avg 8h periods" },
            { label: "Поточний", value: d ? `${d.frCur >= 0 ? "+" : ""}${d.frCur.toFixed(4)}%` : "н/д", sub: "остання 8h" },
            { label: "Позитивних", value: d ? `${Math.round(d.frPos / d.frTotal * 100)}% (${d.frPos}/${d.frTotal})` : "н/д", sub: "bullish periods" },
          ].map((c, i) => (
            <div key={i} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{c.label}</div>
              <div className="num text-lg font-semibold text-[hsl(var(--foreground))]">{c.value}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{c.sub}</div>
            </div>
          ))}
        </div>
        {d && (
          <div className="flex items-center gap-3 p-3 bg-[hsl(var(--muted))] rounded-lg">
            <FRBadge val={d.frAvg} />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Funding нейтральний — немає ознак перегріву лонгів (&gt;0.01%) або панічних шортів (&lt;-0.005%). Простір для руху вгору є.
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
    </div>
  );
}
