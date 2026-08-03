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
  const cryptoScore = (report as any).crypto_score as number | undefined;
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
  // MVRV SHORT filter
  const mvrvVal      = (report as any).mvrv        as number | undefined;
  const tradeSignal  = (report as any).trade_signal as string | undefined;
  const mvrvActive   = mvrvVal !== undefined && mvrvVal < 1.3;
  const composite    = (report as any).composite_score as number | undefined;

  return (
    <div className="p-6 space-y-8 max-w-5xl">

      {/* ── COMPOSITE SCORE ── */}
      {compScore !== undefined && (
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] flex items-center gap-2">
              🧮 COMPOSITE SCORE
              <span className="text-xs px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 rounded font-mono">Formula v3</span>
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
              { label: 'Macro',  score: macroScore,  scoreAdj: macroAdj, weight: '25%', icon: '📊' },
              { label: 'CRYPTO', score: cryptoScore ?? cotScore, scoreAdj: undefined, weight: '35%', icon: '🪙' },
              { label: 'Tech',   score: techScore,  scoreAdj: undefined, weight: '40%', icon: '⚙️' },
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

          {/* MVRV SHORT filter row */}
          {mvrvVal !== undefined && (
            <div className="flex items-center gap-3 p-2.5 mb-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border))]">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">🔍 MVRV Short-фільтр:</span>
              <span className={`text-xs font-bold num ${
                mvrvActive ? 'text-yellow-400' : 'text-[hsl(var(--muted-foreground))]'
              }`}>
                {mvrvVal.toFixed(3)}
              </span>
              <span className="text-xs text-[hsl(var(--muted-foreground))] mx-1">·</span>
              <span className={`text-xs font-semibold ${
                mvrvActive ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {mvrvActive ? '🔴 ACTIVE (< 1.3) — SHORT блоковано' : '🟢 INACTIVE (≥ 1.3)'}
              </span>
              {tradeSignal === 'FLAT_MVRV_FILTER' && composite !== undefined && composite < 38 && (
                <span className="text-xs text-yellow-300 ml-1">· risk-off → FLAT</span>
              )}
            </div>
          )}

          {/* Score scale */}
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] mb-3">
            <span className="text-red-400">🔴 &lt;38</span>
            <span className="mx-1">·</span>
            <span className="text-orange-400">🟡↓ 38–49</span>
            <span className="mx-1">·</span>
            <span className="text-yellow-400">🟡↑ 50–64</span>
            <span className="mx-1">·</span>
            <span className="text-green-400">🟢 ≥65</span>
            {bias && <span className="ml-auto italic">Bias: {bias}</span>}
          </div>

          {/* Live composite formula calc row */}
          {macroAdj !== undefined && (cryptoScore ?? cotScore) !== undefined && techScore !== undefined && compScore !== undefined && (
            <div className="p-3 rounded-lg bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))] text-xs">
              <div className="text-[hsl(var(--muted-foreground))] mb-1.5 font-medium">Formula v3 (Macro×0.25 + CRYPTO×0.35 + Tech×0.40):</div>
              <div className="num flex items-baseline gap-1 flex-wrap">
                <span className="text-[hsl(var(--foreground))] font-medium">{macroAdj}</span>
                <span className="text-[hsl(var(--muted-foreground))]">(макро)</span>
                <span className="text-[hsl(var(--muted-foreground))]">×0.25</span>
                <span className="text-[hsl(var(--muted-foreground))] mx-0.5">+</span>
                <span className="text-yellow-400 font-medium">{cryptoScore ?? cotScore}</span>
                <span className="text-[hsl(var(--muted-foreground))]">(crypto)</span>
                <span className="text-[hsl(var(--muted-foreground))]">×0.35</span>
                <span className="text-[hsl(var(--muted-foreground))] mx-0.5">+</span>
                <span className="text-cyan-400 font-medium">{techScore}</span>
                <span className="text-[hsl(var(--muted-foreground))]">(tech)</span>
                <span className="text-[hsl(var(--muted-foreground))]">×0.40</span>
                <span className="text-[hsl(var(--muted-foreground))] mx-1">=</span>
                <span className={`font-bold text-base ${
                  compScore >= 65 ? 'text-green-400' : compScore >= 50 ? 'text-yellow-400' : compScore >= 38 ? 'text-orange-400' : 'text-red-400'
                }`}>{compScore}</span>
                <span className="text-[hsl(var(--muted-foreground))] text-[10px]">
                  = {(macroAdj * 0.25).toFixed(1)} + {((cryptoScore ?? cotScore ?? 50) * 0.35).toFixed(1)} + {(techScore * 0.40).toFixed(1)}
                </span>
              </div>
            </div>
          )}
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

        {/* BTC vs ETH ETF comparison */}
        {(() => {
          const r = report as any;
          const btcFlow = report.etf_weekly_flow ?? 0; // вже в $B
          const ethFlow = r.eth_etf_weekly_flow as number | undefined; // в $M
          const ethCum  = r.eth_etf_cumulative  as number | undefined;
          const ratio   = r.btc_eth_flow_ratio  as number | undefined;

          const btcM = btcFlow * 1000; // конвертуємо в $M для порівняння
          const totalCryptoFlow = ethFlow != null ? btcM + ethFlow : null;

          // Сигнал: якщо ETH > BTC flow → ротація в ETH (слабший сигнал для BTC)
          const rotationSignal = ethFlow != null
            ? ethFlow > btcM ? '⚠️ Ротація ETH>BTC' : btcM > 0 && ethFlow > 0 ? '✅ Обидва позитивні' : btcM < 0 && ethFlow > 0 ? '⚡ ETH strong / BTC weak' : '🔴 Обидва негативні'
            : null;

          return (
            <div className="mt-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[hsl(var(--border))] text-xs font-medium text-[hsl(var(--muted-foreground))]">BTC vs ETH ETF — тижневий порівняння</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    <th className="text-left px-4 py-2 text-xs text-[hsl(var(--muted-foreground))] font-medium">ETF</th>
                    <th className="text-right px-4 py-2 text-xs text-[hsl(var(--muted-foreground))] font-medium">Тижневий потік</th>
                    <th className="text-right px-4 py-2 text-xs text-[hsl(var(--muted-foreground))] font-medium">Кумулятив</th>
                    <th className="text-left px-4 py-2 text-xs text-[hsl(var(--muted-foreground))] font-medium">Контекст</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[hsl(var(--border))]">
                    <td className="px-4 py-2.5 text-xs font-semibold text-[hsl(var(--foreground))]">BTC ETF</td>
                    <td className={`px-4 py-2.5 text-right num font-bold ${btcM >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {btcM >= 0 ? '+' : ''}{btcM.toFixed(1)}M
                    </td>
                    <td className="px-4 py-2.5 text-right num text-xs text-[hsl(var(--muted-foreground))]">
                      ${((report.etf_cumulative ?? 0)).toFixed(1)}B
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">Bitcoin spot ETFs</td>
                  </tr>
                  <tr className="border-b border-[hsl(var(--border))]">
                    <td className="px-4 py-2.5 text-xs font-semibold text-[hsl(var(--foreground))]">ETH ETF</td>
                    <td className={`px-4 py-2.5 text-right num font-bold ${ethFlow == null ? '' : ethFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ethFlow == null ? '—' : `${ethFlow >= 0 ? '+' : ''}${ethFlow.toFixed(1)}M`}
                    </td>
                    <td className="px-4 py-2.5 text-right num text-xs text-[hsl(var(--muted-foreground))]">
                      {ethCum != null ? `$${(ethCum / 1000).toFixed(2)}B` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">Ethereum spot ETFs</td>
                  </tr>
                  {totalCryptoFlow != null && (
                    <tr className="bg-[hsl(var(--muted)/0.5)]">
                      <td className="px-4 py-2.5 text-xs font-semibold text-[hsl(var(--foreground))]">Разом крипто</td>
                      <td className={`px-4 py-2.5 text-right num font-bold ${totalCryptoFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {totalCryptoFlow >= 0 ? '+' : ''}{totalCryptoFlow.toFixed(1)}M
                      </td>
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5 text-xs font-medium text-yellow-400">{rotationSignal}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })()}

      </section>

      {/* ── BLOCK 3: MACRO EVENTS (dynamic from state.json) ── */}
      <section>
        {(() => {
          const events: any[] = (report as any).macro_events ?? [];
          const comment: string = (report as any).macro_comment ?? '';
          const eventsWeek: string = (report as any).macro_events_week ?? report.week_label ?? '';

          if (events.length === 0) return (
            <div className="p-4 rounded-lg bg-[hsl(var(--muted))] text-xs text-[hsl(var(--muted-foreground))]">
              ⏳ Макро-події тижня будуть доступні після наступного понеділкового оновлення.
            </div>
          );

          return (
            <>
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
                <span className="text-amber-400">🔸</span> БЛОК 3 — МАКРО-ДАНІ ТИЖНЯ
                <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">{eventsWeek}</span>
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
                    {events.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                        <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">{row.date}</td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="text-[hsl(var(--foreground))]">{row.name}</span>
                          {row.note && <span className="block text-[10px] text-yellow-400 mt-0.5">{row.note}</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right num font-semibold ${
                          row.impact > 0 ? 'text-green-400' : row.impact < 0 ? 'text-red-400' : 'text-[hsl(var(--foreground))]'
                        }`}>{row.actual}</td>
                        <td className="px-4 py-2.5 text-right num text-[hsl(var(--muted-foreground))]">{row.forecast ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right num text-[hsl(var(--muted-foreground))]">{row.prev ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          {row.impact > 0 ? '🟢' : row.impact < 0 ? '🔴' : '🟡'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {comment && (
                <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                  💬 {comment}
                </div>
              )}
            </>
          );
        })()}
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

      {/* ── BLOCK 5: CRYPTO SCORE ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span className="text-yellow-400">🪙</span> БЛОК 5 — CRYPTO SCORE (ETF + COT + MVRV)
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">
            Formula v3 · ваги 50/30/20
          </span>
        </h2>

        {/* CRYPTO Score summary */}
        {(() => {
          const r = report as any;
          const cs = r.crypto_score as number | undefined;
          const etfM = (r.etf_weekly_flow ?? 0) * 1000;
          const etf4wM = r.etf_4w_avg_m as number | undefined;
          const pct = r.cot_btc_percentile as number | undefined;
          const mv = r.mvrv as number | undefined;

          const csColor = cs == null ? '' : cs >= 60 ? 'text-green-400' : cs >= 45 ? 'text-yellow-400' : 'text-red-400';

          return (
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">🤗 Composite CRYPTO блок (замість COT у формулі)</span>
                {cs != null && <span className={`num text-xl font-bold ${csColor}`}>{cs}<span className="text-sm font-normal text-[hsl(var(--muted-foreground))] ml-1">/100</span></span>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded p-2.5 bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">ETF BTC 4w MA <span className="opacity-60">(50%)</span></div>
                  <div className={`num font-bold text-sm ${etfM > 30 ? 'text-green-400' : etfM < -30 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {etf4wM != null ? `${etf4wM.toFixed(0)}M` : `${etfM.toFixed(0)}M`}
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-70 mt-0.5">
                    {etf4wM != null ? '4-тижневий MA' : 'weekly (MA недост.)'}
                  </div>
                </div>
                <div className="rounded p-2.5 bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">COT contrarian <span className="opacity-60">(30%)</span></div>
                  <div className={`num font-bold text-sm ${pct != null && pct > 75 ? 'text-green-400' : pct != null && pct < 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                    pct {pct != null ? `${pct}%` : '—'}
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-70 mt-0.5">Lev Funds &middot; &gt;75%=ведмежий short=bullish</div>
                </div>
                <div className="rounded p-2.5 bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">MVRV filter <span className="opacity-60">(20%)</span></div>
                  <div className={`num font-bold text-sm ${mv != null && mv > 2.5 ? 'text-red-400' : mv != null && mv < 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {mv != null ? mv.toFixed(3) : '—'}
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-70 mt-0.5">&lt;1.0=OB filter · &gt;3.5=top filter</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))] opacity-60">
                CRYPTO score = ETF×0.50 + COT_contrarian×0.30 + MVRV×0.20
              </div>
            </div>
          );
        })()}

        {/* COT detail subheader */}
        <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-3 mt-1 uppercase tracking-wide">
          COT деталі · CFTC Direct · TFF Futures Only · {(report as any).cot_date ?? 'н/д'}
        </div>

        {/* Top KPI row */}
        {(() => {
          const r = report as any;
          const pct = r.cot_btc_percentile as number | undefined;
          const z   = r.cot_btc_zscore   as number | undefined;
          const wci = r.cot_wci_26w       as number | undefined;
          const sig = r.cot_8signal       as string | undefined;
          const pctColor = pct == null ? '' : pct > 80 ? 'text-red-400' : pct > 60 ? 'text-yellow-400' : pct > 40 ? 'text-[hsl(var(--foreground))]' : 'text-green-400';
          const wciColor = wci == null ? '' : wci < 20 ? 'text-green-400' : wci > 80 ? 'text-red-400' : 'text-yellow-400';
          const sigColor = sig === 'Strong Bullish' || sig === 'Accumulation' ? 'text-green-400'
            : sig === 'Strong Bearish' || sig === 'Distribution' ? 'text-red-400'
            : 'text-yellow-400';
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <KpiCard
                label="Lev Funds Percentile"
                value={pct != null ? `${pct}%` : '—'}
                sub="52w · >80=ведмежа зона"
                color={pctColor}
              />
              <KpiCard
                label="COT Score"
                value={r.cot_score != null ? `${r.cot_score}/100` : '—'}
                sub={z != null ? `z-score ${z > 0 ? '+' : ''}${z.toFixed(3)}` : 'Lev Funds z-score'}
                color={r.cot_score >= 60 ? 'text-green-400' : r.cot_score >= 40 ? 'text-yellow-400' : 'text-red-400'}
              />
              <KpiCard
                label="WCI 26w"
                value={wci != null ? `${wci}%` : '—'}
                sub="<20=бичачий, >80=ведмежий"
                color={wciColor}
              />
              <KpiCard
                label="8 COT Signal"
                value={sig ?? '—'}
                sub="алгоритм Lev Funds"
                color={sigColor}
              />
            </div>
          );
        })()}

        {/* Main metrics table */}
        {(() => {
          const r = report as any;
          const rows = [
            { label: 'Net позиція (Lev Funds)',  value: r.cot_net_lev != null ? r.cot_net_lev.toLocaleString() : '—', color: r.cot_net_lev < 0 ? 'text-red-400' : 'text-green-400', hint: 'Leveraged Funds = хедж-фонди/CTAs' },
            { label: 'Net позиція (Asset Mgr)',  value: r.cot_net_asset != null ? r.cot_net_asset.toLocaleString() : '—', color: r.cot_net_asset >= 0 ? 'text-green-400' : 'text-red-400', hint: 'Великий buy-side, пенсійні фонди' },
            { label: 'Percentile Lev Funds 52w', value: r.cot_btc_percentile != null ? `${r.cot_btc_percentile}%` : '—', color: r.cot_btc_percentile > 80 ? 'text-red-400' : r.cot_btc_percentile > 60 ? 'text-yellow-400' : 'text-green-400', hint: '>80% = перепродано спекулянтами' },
            { label: 'Z-Score 52w',              value: r.cot_btc_zscore != null ? (r.cot_btc_zscore > 0 ? `+${r.cot_btc_zscore.toFixed(3)}` : `${r.cot_btc_zscore.toFixed(3)}`) : '—', color: r.cot_btc_zscore > 1 ? 'text-red-400' : r.cot_btc_zscore > 0 ? 'text-yellow-400' : 'text-green-400', hint: 'Відхилення від середнього 52w' },
            { label: 'WCI 26w',                  value: r.cot_wci_26w != null ? `${r.cot_wci_26w}%` : '—', color: r.cot_wci_26w < 20 ? 'text-green-400' : r.cot_wci_26w > 80 ? 'text-red-400' : 'text-yellow-400', hint: 'Williams Commercial Index · <20=bull' },
            { label: 'Net/OI%',                  value: r.cot_net_oi_pct != null ? `${r.cot_net_oi_pct}%` : '—', color: r.cot_net_oi_pct < -20 ? 'text-red-400' : r.cot_net_oi_pct > 10 ? 'text-green-400' : 'text-yellow-400', hint: 'Вага нет-позиції відносно OI' },
            { label: 'Asset Mgr Percentile',     value: r.cot_asset_percentile != null ? `${r.cot_asset_percentile}%` : '—', color: r.cot_asset_percentile < 20 ? 'text-green-400' : r.cot_asset_percentile > 70 ? 'text-red-400' : 'text-yellow-400', hint: 'Великий buy-side позиціонування 52w' },
            { label: 'Sentiment Divergence',     value: r.cot_sentiment_divergence != null ? `${r.cot_sentiment_divergence}%` : '—', color: r.cot_sentiment_divergence > 70 ? 'text-yellow-400' : 'text-[hsl(var(--foreground))]', hint: '|Lev%−Asset%| · >90=сильний сигнал' },
            { label: 'Position Velocity',        value: r.cot_velocity != null ? (r.cot_velocity > 0 ? `▲ +${r.cot_velocity.toLocaleString()}` : `▼ ${r.cot_velocity.toLocaleString()}`) : '—', color: r.cot_velocity > 0 ? 'text-green-400' : 'text-red-400', hint: 'Зміна нет за тиждень (1-ша похідна)' },
            { label: 'Acceleration',             value: r.cot_accel != null ? (r.cot_accel > 0 ? `+${r.cot_accel.toLocaleString()}` : `${r.cot_accel.toLocaleString()}`) : '—', color: r.cot_accel > 0 ? 'text-green-400' : 'text-red-400', hint: '>0 = уповільнення ведмежого тренду' },
            { label: 'Concentration Top-4 Long', value: r.cot_conc_top4_long != null ? `${r.cot_conc_top4_long}%` : '—', color: r.cot_conc_top4_long > 55 ? 'text-yellow-400' : 'text-[hsl(var(--foreground))]', hint: '% OI в руках 4 найбільших' },
            { label: 'Concentration Top-4 Short',value: r.cot_conc_top4_short != null ? `${r.cot_conc_top4_short}%` : '—', color: 'text-[hsl(var(--foreground))]', hint: '% OI в шортах Top-4' },
          ];
          return (
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium w-56">Метрика</th>
                    <th className="text-right px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Значення</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Пояснення</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                      <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{row.label}</td>
                      <td className={`px-4 py-2.5 text-right num font-semibold ${row.color}`}>{row.value}</td>
                      <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] opacity-70">{row.hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* 8 COT Signal badge */}
        {(() => {
          const r = report as any;
          const sig = r.cot_8signal as string | undefined;
          if (!sig) return null;
          const isBull = sig === 'Strong Bullish' || sig === 'Accumulation' || sig === 'Floor Building';
          const isBear = sig === 'Strong Bearish' || sig === 'Distribution';
          return (
            <div className={`mb-4 p-3 rounded-lg border flex items-center gap-3 ${
              isBull ? 'bg-green-500/10 border-green-500/25' :
              isBear ? 'bg-red-500/10 border-red-500/25' :
              'bg-yellow-500/10 border-yellow-500/25'
            }`}>
              <span className="text-lg">{isBull ? '🟢' : isBear ? '🔴' : '🟡'}</span>
              <div>
                <div className={`text-sm font-bold ${
                  isBull ? 'text-green-400' : isBear ? 'text-red-400' : 'text-yellow-400'
                }`}>8 COT Signal: {sig}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {sig === 'Strong Bullish'  && 'Ціна ↑, лонги ↑, шорти ↓ — класичний бичачий розгін'}
                  {sig === 'Accumulation'    && 'Ціна ↓, лонги ↑, шорти ↓ — набір позицій на корекції'}
                  {sig === 'Floor Building'  && 'Ціна ↓, лонги ↑ і шорти ↑ — двостороннє накопичення, можливий дно'}
                  {sig === 'Strong Bearish'  && 'Ціна ↓, лонги ↓, шорти ↑ — класичний ведмежий тиск'}
                  {sig === 'Distribution'    && 'Ціна ↑, лонги ↓, шорти ↑ — розподіл на вершині'}
                  {sig === 'Topping Out'     && 'Ціна ↑, лонги ↑ і шорти ↑ — потенційна вершина'}
                  {sig === 'Profit Taking'   && 'Ціна ↑, лонги ↓, шорти ↓ — фіксація прибутку'}
                  {sig === 'Liquidation'     && 'Ціна ↓, лонги ↓, шорти ↓ — примусові ліквідації'}
                </div>
              </div>
              {r.cot_velocity != null && (
                <div className="ml-auto text-right">
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Velocity</div>
                  <div className={`num text-sm font-bold ${r.cot_velocity > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {r.cot_velocity > 0 ? '+' : ''}{r.cot_velocity.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="mt-1 p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 Leveraged Funds (хедж-фонди/CTAs) Net: <span className="num text-red-400">-7,949</span> контрактів, percentile 86.5% — ведмежа зона. WCI 62.8% (нейтральна). Asset Managers percentile всього 9.6% — великий buy-side майже не шортує. Sentiment Divergence 76.9%: specs агресивно шортять, інституціонали — ні. Acceleration +316 → уповільнення ведмежого імпульсу.
          <div className="mt-1.5 text-[10px] opacity-60">Джерело: publicreporting.cftc.gov · TFF Futures Only · endpoint gpe5-46if · без API ключа</div>
        </div>
      </section>

      {/* ── BLOCK 6: MSTR / STRATEGY ── */}
      <MstrBlock />
    </div>
  );
}
