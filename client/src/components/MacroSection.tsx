import type { Report } from "@shared/schema";
import MstrBlock from "./MstrBlock";

function Sparkline({ values, colors }: { values: (number | null)[]; colors?: string[] }) {
  const valid = values.filter(v => v !== null) as number[];
  if (valid.length < 2) return <span className="text-[hsl(var(--muted-foreground))] text-xs">н/д</span>;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const chars = "▁▂▃▄▅▆▇█";
  return (
    <span className="num tracking-wider text-[hsl(var(--cyan,199_80%_52%))]">
      {values.map((v, i) => {
        if (v === null) return <span key={i} className="text-[hsl(var(--muted-foreground))]">·</span>;
        const idx = Math.round(((v - min) / range) * 7);
        const color = colors?.[i];
        return <span key={i} style={color ? { color } : {}}>{chars[idx]}</span>;
      })}
    </span>
  );
}

function Delta({ now, prev }: { now?: number | null; prev?: number | null }) {
  if (now == null || prev == null) return <span className="text-[hsl(var(--muted-foreground))]">—</span>;
  const d = now - prev;
  // Зростання реальних ставок = поганий сигнал для BTC → червоний
  const cls = d > 0 ? "text-red-400" : d < 0 ? "text-green-400" : "text-[hsl(var(--muted-foreground))]";
  const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "";
  return <span className={`num ${cls}`}>{arrow}{d > 0 ? "+" : ""}{d.toFixed(2)} б.п.</span>;
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
      <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{label}</div>
      <div className={`num text-xl font-semibold ${color || "text-[hsl(var(--foreground))]"}`}>{value}</div>
      {sub && <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{sub}</div>}
    </div>
  );
}

function ImpactBadge({ val }: { val: number | null | undefined }) {
  if (val == null) return <span className="text-[hsl(var(--muted-foreground))]">—</span>;
  if (val > 0) return <span className="text-green-400">🟢</span>;
  if (val < 0) return <span className="text-red-400">🔴</span>;
  return <span className="text-yellow-400">🟡</span>;
}

export default function MacroSection({ report }: { report: Report }) {
  const pw = (report as any).prior_week;

  // ETF flow color
  const etfFlow = report.etf_weekly_flow ?? 0;
  const etfColor = etfFlow >= 0 ? "text-green-400" : "text-red-400";
  const etfSign = etfFlow >= 0 ? "+" : "";

  // Composite score data
  const compScore   = (report as any).composite_score as number | undefined;
  const macroScore  = (report as any).macro_score  as number | undefined;
  const cotScore    = (report as any).cot_score    as number | undefined;
  const techScore   = (report as any).tech_score   as number | undefined;
  const confidence  = (report as any).confidence   as number | undefined;
  const bias        = (report as any).bias_text    as string | undefined;
  const oversold    = (report as any).oversold_bounce as boolean | undefined;
  // MSTR signals
  const macroAdj    = (report as any).macro_score_adj  as number | undefined;
  const mstrAdj     = (report as any).mstr_macro_adj   as number | undefined;
  const mstrMnav    = (report as any).mstr_mnav_cur    as number | undefined;
  const mstrMnavWow = (report as any).mstr_mnav_wow    as number | undefined;
  const mstrBought  = (report as any).mstr_btc_purchased_week as number | undefined;

  return (
    <div className="p-6 space-y-8 max-w-5xl">

      {/* ── COMPOSITE SCORE ── */}
      {compScore !== undefined && (
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] flex items-center gap-2">
              🧮 COMPOSITE SCORE
            </h2>
            <div className="flex items-center gap-3">
              {oversold && (
                <span className="text-xs px-2 py-0.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 rounded-full">
                  ⚠️ OVERSOLD BOUNCE POSSIBLE
                </span>
              )}
              <span className="num text-2xl font-bold text-[hsl(var(--foreground))]">{compScore}/100</span>
              {confidence !== undefined && (
                <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                  confidence >= 60 ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' :
                  confidence >= 30 ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' :
                                     'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]'
                }`}>
                  {confidence >= 60 ? 'High' : confidence >= 30 ? 'Medium' : 'Low'} · {confidence}%
                </span>
              )}
            </div>
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {([
              { label: 'Macro', score: macroScore, scoreAdj: macroAdj, weight: '40%', icon: '📊' },
              { label: 'COT',   score: cotScore,   scoreAdj: undefined, weight: '30%', icon: '📐' },
              { label: 'Tech',  score: techScore,  scoreAdj: undefined, weight: '30%', icon: '⚙️' },
            ] as const).map(({ label, score: s, scoreAdj, weight, icon }) => (
              <div key={label} className="rounded p-3 bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{icon} {label}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{weight}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="num text-lg font-bold text-[hsl(var(--foreground))]">{s ?? '—'}</div>
                  {scoreAdj !== undefined && s !== undefined && scoreAdj !== s && (
                    <div className={`num text-xs font-medium ${
                      scoreAdj > s ? 'text-green-400' : 'text-red-400'
                    }`}>
                      → {scoreAdj}
                      <span className="ml-0.5">
                        ({scoreAdj > s ? '+' : ''}{scoreAdj - s})
                      </span>
                    </div>
                  )}
                </div>
                {s !== undefined && (
                  <div className="mt-2 h-1.5 rounded-full bg-[hsl(var(--border))] relative">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        (scoreAdj ?? s) >= 60 ? 'bg-green-500' : (scoreAdj ?? s) >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${scoreAdj ?? s}%` }}
                    />
                    {scoreAdj !== undefined && scoreAdj !== s && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white/40"
                        style={{ left: `${s}%` }}
                        title={`Raw macro: ${s}`}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* MSTR adjustment row */}
          {mstrAdj !== undefined && (
            <div className="flex items-center gap-3 p-2.5 mb-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border))]">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">🟧 MSTR корекція macro:</span>
              <span className={`num text-sm font-bold ${
                mstrAdj > 0 ? 'text-green-400' : mstrAdj < 0 ? 'text-red-400' : 'text-[hsl(var(--muted-foreground))]'
              }`}>
                {mstrAdj > 0 ? '+' : ''}{mstrAdj}
              </span>
              <span className="text-xs text-[hsl(var(--muted-foreground))] mx-1">·</span>
              {mstrMnav !== undefined && (
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  mNAV {mstrMnav.toFixed(2)}x
                  {mstrMnavWow !== undefined && (
                    <span className={`ml-1 ${
                      mstrMnavWow > 0.1 ? 'text-red-400' : mstrMnavWow < -0.1 ? 'text-green-400' : 'text-[hsl(var(--muted-foreground))]'
                    }`}>
                      ({mstrMnavWow > 0 ? '+' : ''}{mstrMnavWow.toFixed(3)} WoW)
                    </span>
                  )}
                </span>
              )}
              <span className="text-xs text-[hsl(var(--muted-foreground))] mx-1">·</span>
              {mstrBought !== undefined && (
                <span className={`text-xs font-medium ${
                  mstrBought > 0 ? 'text-green-400' : 'text-[hsl(var(--muted-foreground))]'
                }`}>
                  {mstrBought > 0
                    ? `✅ Купили ${mstrBought.toLocaleString()} BTC`
                    : '⏸️ Пауза в купівлях'}
                </span>
              )}
            </div>
          )}

          {/* Score scale */}
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="text-red-400">🔴 &lt;42</span>
            <span className="mx-1">·</span>
            <span className="text-orange-400">🟡↓ 42–51</span>
            <span className="mx-1">·</span>
            <span className="text-yellow-400">🟡↑ 52–64</span>
            <span className="mx-1">·</span>
            <span className="text-green-400">🟢 ≥65</span>
            {bias && <span className="ml-auto italic">Bias: {bias}</span>}
          </div>
        </section>
      )}

      {/* ── BLOCK 1: TIPS ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span className="text-blue-400">🔷</span> БЛОК 1 — TIPS / РЕАЛЬНІ ДОХІДНОСТІ
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">FRED CSV · {report.date}</span>
        </h2>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard label="5Y TIPS" value={`${report.tips_5y?.toFixed(2)}%`}
            sub="реальна дохідність" color="text-red-400" />
          <KpiCard label="10Y TIPS" value={`${report.tips_10y?.toFixed(2)}%`}
            sub="реальна дохідність" color="text-red-400" />
          <KpiCard label="10Y Breakeven" value={`${report.breakeven_10y?.toFixed(2)}%`}
            sub="інфляційні очікування" color="text-[hsl(var(--foreground))]" />
          <KpiCard label="UST 10Y" value={`${report.ust_10y?.toFixed(2)}%`}
            sub="номінальна" color="text-[hsl(var(--foreground))]" />
        </div>

        {/* Comparison table */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium w-48">Показник</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Сьогодні</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Тиждень тому</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Зміна</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Тренд</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "5Y TIPS", now: report.tips_5y, prev: 2.04 },
                { label: "10Y TIPS", now: report.tips_10y, prev: 2.35 },
                { label: "10Y Breakeven", now: report.breakeven_10y, prev: 2.24 },
                { label: "UST 10Y", now: report.ust_10y, prev: 4.55 },
              ].map((row, i) => (
                <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)] transition-colors">
                  <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))] text-xs">{row.label}</td>
                  <td className="px-4 py-2.5 text-right num font-medium text-[hsl(var(--foreground))]">{row.now?.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 text-right num text-[hsl(var(--muted-foreground))]">{row.prev?.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 text-right"><Delta now={row.now != null ? row.now * 100 : null} prev={row.prev * 100} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Sparkline values={[row.prev, row.prev, row.prev * 0.98, row.now]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 Реальні дохідності продовжують зростати — 10Y TIPS {report.tips_10y?.toFixed(2)}% є максимумом за рік. Breakeven {report.breakeven_10y?.toFixed(2)}% стабільний. Структурний тиск на BTC максимальний з початку 2024.
        </div>
      </section>

      {/* ── BLOCK 2: ETF ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span className="text-orange-400">🔶</span> БЛОК 2 — BTC SPOT ETF ПОТОКИ
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">Farside · тиждень {report.week_label}</span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard
            label="Тижневий потік"
            value={`${etfSign}$${Math.abs(etfFlow).toFixed(3)}B`}
            sub="Пн–Чт (Пт н/д)"
            color={etfColor}
          />
          <KpiCard label="AUM загальний" value={`$${report.etf_aum?.toFixed(1)}B`} sub="всі фонди" />
          <KpiCard label="Cumulative" value={`$${report.etf_cumulative?.toFixed(1)}B`} sub="all-time inflow" color="text-green-400" />
          <KpiCard
            label="IBIT домінація"
            value="~55%"
            sub="тижневий потік"
          />
        </div>

        {/* ETF daily table */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Дата</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">IBIT</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">FBTC</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">GBTC</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Нетто</th>
              </tr>
            </thead>
            <tbody>
              {[
                { date: "Пн 21.07", ibit: 163.9, fbtc: 23.1, gbtc: 0, net: 203.2 },
                { date: "Вт 22.07", ibit: 38.8, fbtc: 21.5, gbtc: -38.3, net: 69.1 },
                { date: "Ср 23.07", ibit: -202.5, fbtc: -5.6, gbtc: 0, net: -225.1 },
                { date: "Чт 24.07", ibit: -212.2, fbtc: -27.9, gbtc: 0, net: -240.1 },
                { date: "Пт 25.07", ibit: null, fbtc: null, gbtc: null, net: null },
              ].map((row, i) => {
                const netColor = row.net == null ? "" : row.net > 0 ? "text-green-400" : "text-red-400";
                const fmt = (v: number | null) => v == null ? <span className="text-[hsl(var(--muted-foreground))]">н/д</span>
                  : <span className={`num ${v >= 0 ? "text-green-400" : "text-red-400"}`}>{v >= 0 ? "+" : ""}{v.toFixed(1)}M</span>;
                return (
                  <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                    <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{row.date}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(row.ibit)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(row.fbtc)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(row.gbtc)}</td>
                    <td className={`px-4 py-2.5 text-right num font-semibold ${netColor}`}>
                      {row.net == null ? <span className="text-[hsl(var(--muted-foreground))]">н/д</span>
                        : `${row.net >= 0 ? "+" : ""}${row.net.toFixed(1)}M`}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[hsl(var(--muted)/0.5)]">
                <td className="px-4 py-2.5 text-xs font-semibold text-[hsl(var(--foreground))]">Разом Пн–Чт</td>
                <td colSpan={3} />
                <td className="px-4 py-2.5 text-right num font-bold text-red-400">-192.9M</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 V-патерн тижня: приплив Пн+Вт (+$272M), різкий розворот Ср+Чт (-$465M). Інституціонали відкрили позиції на початку тижня, потім ліквідували після PMI-цінового шоку (24.07). Підтверджує вразливість ETF попиту до hawkish сигналів.
        </div>
      </section>

      {/* ── BLOCK 3: MACRO ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span className="text-amber-400">🔸</span> БЛОК 3 — МАКРО-ДАНІ ТИЖНЯ
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">21–25.07.2026</span>
        </h2>

        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Дата</th>
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Індикатор</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Факт</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Прогноз</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Попер.</th>
                <th className="text-center px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Вплив</th>
              </tr>
            </thead>
            <tbody>
              {[
                { date: "24.07", name: "Jobless Claims", actual: "187K", forecast: "215K", prev: "209K", impact: -1, note: "⚠ Сильний ринок праці — hawkish для ФРС" },
                { date: "24.07", name: "Flash Composite PMI", actual: "53.6", forecast: "52.2", prev: "51.9", impact: -1, note: "⚠ Сильніше прогнозу — hawkish" },
                { date: "24.07", name: "Flash Services PMI", actual: "53.6", forecast: "51.5", prev: "51.2", impact: -1, note: "⚠ 8-місячний максимум" },
                { date: "24.07", name: "Flash Mfg PMI", actual: "53.8", forecast: "54.3", prev: "53.9", impact: 0, note: "Нижче прогнозу — нейтрально" },
                { date: "24.07", name: "PMI Input Prices", actual: "14M-max", forecast: "—", prev: "—", impact: -1, note: "⚠ Inflation re-acceleration" },
                { date: "24.07", name: "PMI Selling Prices", actual: "Aug'22-max", forecast: "—", prev: "—", impact: -1 },
              ].map((row, i) => (
                <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                  <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">{row.date}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className="text-[hsl(var(--foreground))]">{row.name}</span>
                    {row.note && <span className="block text-[10px] text-yellow-400 mt-0.5">{row.note}</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right num font-semibold ${row.impact > 0 ? "text-green-400" : row.impact < 0 ? "text-red-400" : "text-[hsl(var(--foreground))]"}`}>
                    {row.actual}
                  </td>
                  <td className="px-4 py-2.5 text-right num text-[hsl(var(--muted-foreground))]">{row.forecast}</td>
                  <td className="px-4 py-2.5 text-right num text-[hsl(var(--muted-foreground))]">{row.prev}</td>
                  <td className="px-4 py-2.5 text-center">
                    {row.impact > 0 ? "🟢" : row.impact < 0 ? "🔴" : "🟡"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 Hawkish картина для крипти: Jobless Claims 187K (57-річний мінімум, нижче прогнозу 215K) + PMI Composite 53.6 (8-місячний максимум) = ФРС не має підстав різати ставки. PMI ціни прискорились до 14-місячного максимуму → stagflation ризик. Сильна економіка = менше ймовірність rate cuts = структурний тиск на BTC/ризик-активи. FOMC 30.07 — Market очікує паузу (UST10Y specs 19-й percentile підтверджує ставку на dovish риторику Пауелла, але не rate cut).
        </div>
      </section>

      {/* ── BLOCK 4: EQUITY / SECTOR ETF ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span className="text-blue-400">🔹</span> БЛОК 4 — EQUITY / SECTOR ETF
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">тиждень 21–25.07.2026</span>
        </h2>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard
            label="SPY"
            value={`$${report.spy_close?.toFixed(2) ?? '746.00'}`}
            sub="S&P 500 ETF · тижн. +0.35%"
            color="text-green-400"
          />
          <KpiCard
            label="QQQ"
            value={`$${report.qqq_close?.toFixed(2) ?? '700.00'}`}
            sub="Nasdaq-100 ETF · тижн. +0.67%"
            color="text-green-400"
          />
          <KpiCard
            label="VIX"
            value={`${report.vix?.toFixed(2) ?? '18.58'}`}
            sub={`${(report.vix ?? 18.58) < 20 ? '😌 Низька волатильність' : (report.vix ?? 18.58) < 30 ? '😐 Помірна' : '😱 Страх'}`}
            color={(report.vix ?? 18.58) < 20 ? 'text-green-400' : (report.vix ?? 18.58) < 30 ? 'text-yellow-400' : 'text-red-400'}
          />
          <KpiCard
            label="Fear & Greed"
            value="54 / 100"
            sub="Neutral → Greed"
            color="text-yellow-400"
          />
        </div>

        {/* ETF comparison table */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">ETF</th>
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Назва</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Ціна</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Тижн. зміна</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Місяць тому</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Місяч. зміна</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">BTC корел.</th>
              </tr>
            </thead>
            <tbody>
              {[
                { ticker: 'SPY',  name: 'S&P 500',       price: report.spy_close ?? 746.00, prevWeek: 743.29, prevMonth: 728.99, corr: '+0.72', corrColor: 'text-green-400' },
                { ticker: 'QQQ',  name: 'Nasdaq-100',    price: report.qqq_close ?? 700.00, prevWeek: 695.33, prevMonth: 706.52, corr: '+0.81', corrColor: 'text-green-400' },
                { ticker: 'XLK',  name: 'Tech Sector',   price: 245.80, prevWeek: 243.10, prevMonth: 238.50, corr: '+0.77', corrColor: 'text-green-400' },
                { ticker: 'XLE',  name: 'Energy Sector', price: 89.20,  prevWeek: 91.40,  prevMonth: 87.30,  corr: '-0.18', corrColor: 'text-red-400' },
                { ticker: 'XLF',  name: 'Financials',    price: 48.90,  prevWeek: 48.20,  prevMonth: 46.80,  corr: '+0.45', corrColor: 'text-yellow-400' },
                { ticker: 'GLD',  name: 'Gold ETF',      price: 243.50, prevWeek: 241.80, prevMonth: 235.20, corr: '+0.38', corrColor: 'text-yellow-400' },
              ].map((row, i) => {
                const wChg = ((row.price / row.prevWeek - 1) * 100);
                const mChg = ((row.price / row.prevMonth - 1) * 100);
                return (
                  <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                    <td className="px-4 py-2.5 num font-semibold text-xs text-[hsl(var(--foreground))]">{row.ticker}</td>
                    <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{row.name}</td>
                    <td className="px-4 py-2.5 text-right num font-medium text-[hsl(var(--foreground))]">{'$'}{row.price.toFixed(2)}</td>
                    <td className={`px-4 py-2.5 text-right num font-semibold ${wChg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {wChg >= 0 ? '+' : ''}{wChg.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right num text-[hsl(var(--muted-foreground))]">${row.prevMonth.toFixed(2)}</td>
                    <td className={`px-4 py-2.5 text-right num ${mChg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {mChg >= 0 ? '+' : ''}{mChg.toFixed(2)}%
                    </td>
                    <td className={`px-4 py-2.5 text-right num text-xs ${row.corrColor}`}>{row.corr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sector heatmap row */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
          {[
            { label: 'XLK Tech',      chg: +1.11, top: true },
            { label: 'XLF Finance',   chg: +1.45, top: true },
            { label: 'XLV Health',    chg: +0.82, top: false },
            { label: 'XLI Industrl',  chg: +0.55, top: false },
            { label: 'XLE Energy',    chg: -2.40, top: false },
            { label: 'XLP Staples',   chg: -0.31, top: false },
          ].map((s, i) => (
            <div key={i} className={`rounded p-2.5 text-center border ${
              s.chg > 1.2 ? 'bg-green-500/15 border-green-500/25' :
              s.chg > 0   ? 'bg-green-500/8 border-green-500/15' :
              s.chg > -1  ? 'bg-red-500/8 border-red-500/15' :
                            'bg-red-500/15 border-red-500/25'
            }`}>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{s.label}</div>
              <div className={`num text-sm font-semibold ${
                s.chg >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>{s.chg >= 0 ? '+' : ''}{s.chg.toFixed(2)}%</div>
              {s.top && <div className="text-[9px] text-green-400 mt-0.5">🏅 топ</div>}
              {s.label.includes('Energy') && <div className="text-[9px] text-red-400 mt-0.5">💀 аутсайдер</div>}
            </div>
          ))}
        </div>

        <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 Equity ринок зростає попри hawkish макро: SPY +0.35%, QQQ +0.67% WoW. Лідери — Financials (+1.45%) та Tech (+1.11%). Аутсайдер — Energy (-2.40%) на фоні падіння нафти. VIX 18.58 = низька волатильність, ринок не закладає стресу перед FOMC. Висока кореляція QQQ/BTC (+0.81) — якщо tech розпродається після FOMC, BTC під тиском.
        </div>
      </section>

      {/* ── BLOCK 5: COT ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span className="text-red-400">🔻</span> БЛОК 5 — COT / ІНСТИТУЦІЙНЕ ПОЗИЦІОНУВАННЯ
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">
            Equilibriumm · CFTC {report.cot_date}
          </span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard
            label="BTC Percentile"
            value={`${report.cot_btc_percentile}-й`}
            sub="Large Spec (screener)"
            color={report.cot_btc_percentile && report.cot_btc_percentile > 80 ? "text-red-400" : report.cot_btc_percentile && report.cot_btc_percentile > 60 ? "text-yellow-400" : "text-green-400"}
          />
          <KpiCard label="BTC Z-Score" value={`+${report.cot_btc_zscore?.toFixed(2)}`} sub="Large Spec" color="text-yellow-400" />
          <KpiCard
            label="TOP-4 Long"
            value={`${report.cot_btc_top4_long?.toFixed(1)}%`}
            sub="Concentration ⚠ DANGEROUS"
            color="text-red-400"
          />
          <KpiCard label="BTC OI" value={`${(report.cot_btc_oi || 0).toLocaleString()}`} sub="контрактів CME" />
        </div>

        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Інструмент</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Net Pos</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Percentile</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Z-Score</th>
                <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">WoW Δ</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "BTC CME", net: -7949, pct: report.cot_btc_percentile, z: report.cot_btc_zscore, wow: -458 },
                { name: "E-Mini S&P 500", net: -322865, pct: report.cot_sp500_percentile, z: 0.48, wow: 42137 },
                { name: "Micro NQ-100", net: -158974, pct: 28, z: -0.59, wow: 2629 },
                { name: "UST 10Y", net: -879706, pct: report.cot_ust10y_percentile, z: -0.88, wow: -48031 },
                { name: "Gold", net: 124831, pct: report.cot_gold_percentile, z: -0.06, wow: 4052 },
              ].map((row, i) => {
                const pctColor = row.pct == null ? "" : row.pct > 80 ? "text-red-400" : row.pct > 60 ? "text-yellow-400" : row.pct > 40 ? "text-[hsl(var(--foreground))]" : "text-green-400";
                return (
                  <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                    <td className="px-4 py-2.5 text-xs text-[hsl(var(--foreground))]">{row.name}</td>
                    <td className={`px-4 py-2.5 text-right num text-xs ${row.net < 0 ? "text-red-400" : "text-green-400"}`}>
                      {row.net.toLocaleString()}
                    </td>
                    <td className={`px-4 py-2.5 text-right num font-semibold ${pctColor}`}>
                      {row.pct != null ? `${row.pct}-й` : "н/д"}
                    </td>
                    <td className={`px-4 py-2.5 text-right num ${row.z && row.z > 0 ? "text-yellow-400" : "text-green-400"}`}>
                      {row.z != null ? (row.z > 0 ? `+${row.z.toFixed(2)}` : row.z.toFixed(2)) : "н/д"}
                    </td>
                    <td className={`px-4 py-2.5 text-right num ${row.wow > 0 ? "text-green-400" : "text-red-400"}`}>
                      {row.wow > 0 ? `▲ +${row.wow.toLocaleString()}` : `▼ ${row.wow.toLocaleString()}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 BTC percentile знижується 3-й тиждень (99→82→78) — структурно позитивне очищення. UST 10Y specs різко збільшили net short (19-й percentile, -48K) = ставка на голубиний FOMC. S&P specs нарощують лонги (68-й, +42K) = equity оптимізм. OI +5.6% WoW = накопичення ліквідності перед FOMC.
        </div>
      </section>

      {/* ── BLOCK 6: MSTR / STRATEGY ── */}
      <MstrBlock />
    </div>
  );
}
