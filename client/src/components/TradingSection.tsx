import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { fetchTrades } from "@/lib/dataClient";
import { TrendingUp, TrendingDown, Minus, Target, Shield, BarChart2, AlertCircle } from "lucide-react";

// ── live clock — shows price + seconds since last update ──────
function LiveClock({ price }: { price?: number | null }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    setSec(0);
  }, [price]);
  useEffect(() => {
    const id = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!price) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs font-normal ml-auto">
      <span className={`w-1.5 h-1.5 rounded-full ${sec < 5 ? 'bg-green-400 animate-pulse' : 'bg-green-400/60'}`} />
      <span className="text-green-400">Live OKX · ${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
      <span className="text-[hsl(var(--muted-foreground))]">· {sec}s тому</span>
    </span>
  );
}

// ── tiny sparkline ──────────────────────────────────────────────
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 120, H = 36, pad = 4;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const color = last >= first ? "#34d399" : "#f87171";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (W - pad * 2);
        const y = H - pad - ((v - min) / range) * (H - pad * 2);
        return i === values.length - 1
          ? <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
          : null;
      })}
    </svg>
  );
}

// ── equity chart (larger) ───────────────────────────────────────
function EquityChart({ curve }: { curve: { date: string; equity: number; pnl: number; event?: string }[] }) {
  if (curve.length < 2) return (
    <div className="flex items-center justify-center h-32 text-xs text-[hsl(var(--muted-foreground))]">
      Потрібно мінімум 2 точки даних
    </div>
  );
  const W = 520, H = 120, padL = 55, padR = 12, padT = 12, padB = 28;
  const equities = curve.map(c => c.equity);
  const min = Math.min(...equities) * 0.998;
  const max = Math.max(...equities) * 1.002;
  const range = max - min || 1;
  const xOf = (i: number) => padL + (i / (curve.length - 1)) * (W - padL - padR);
  const yOf = (v: number) => padT + ((max - v) / range) * (H - padT - padB);
  const pts = curve.map((c, i) => `${xOf(i)},${yOf(c.equity)}`).join(" ");
  const last = equities[equities.length - 1];
  const first = equities[0];
  const lineColor = last >= first ? "#34d399" : "#f87171";
  const fillId = "equity-fill";

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = padT + t * (H - padT - padB);
        const val = max - t * range;
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="hsl(220 15% 20%)" strokeWidth="0.5" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="8" fill="hsl(220 10% 50%)">
              ${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </text>
          </g>
        );
      })}
      {/* Area fill */}
      <polygon
        points={`${xOf(0)},${yOf(min)} ${pts} ${xOf(curve.length - 1)},${yOf(min)}`}
        fill={`url(#${fillId})`}
      />
      {/* Line */}
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Dots + labels */}
      {curve.map((c, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(c.equity)} r="2.5" fill={lineColor} />
          <text x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="7" fill="hsl(220 10% 50%)">
            {c.date.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── direction badge ─────────────────────────────────────────────
function DirBadge({ dir }: { dir: string }) {
  if (dir === "LONG")  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/15 text-green-400 text-xs font-bold border border-green-500/30"><TrendingUp size={11}/>LONG</span>;
  if (dir === "SHORT") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 text-red-400 text-xs font-bold border border-red-500/30"><TrendingDown size={11}/>SHORT</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-xs font-bold"><Minus size={11}/>FLAT</span>;
}

// ── result badge ─────────────────────────────────────────────────
function ResultBadge({ result }: { result: string }) {
  if (result === "TP")   return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30">✅ TP</span>;
  if (result === "SL")   return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">🛑 SL</span>;
  if (result === "MANUAL") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">🔵 Manual</span>;
  if (result === "MOMENTUM") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">📉 Momentum</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-bold bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">{result ?? "—"}</span>;
}

// Normalize a closed trade to a single display schema.
// Daily cron writes: composite_open/composite_close, exit_reason (TP_HIT/SL_HIT/MOMENTUM_EXIT), note.
// Older records use: composite_score, result (TP/SL/MANUAL), analysis.
function normalizeTrade(t: any) {
  const exitMap: Record<string, string> = { TP_HIT: "TP", SL_HIT: "SL", MOMENTUM_EXIT: "MOMENTUM", MANUAL: "MANUAL" };
  return {
    ...t,
    composite_score: t.composite_score ?? t.composite_open ?? null,
    result: t.result ?? (t.exit_reason ? (exitMap[t.exit_reason] ?? t.exit_reason) : null),
    analysis: t.analysis ?? t.note ?? null,
    regime_key: (t.regime ?? "").replace(/-/g, "_"),
  };
}

// Compute all stats dynamically from closed_trades — no dependency on a
// pre-computed stats block that crons may not maintain.
function computeStats(closedRaw: any[], depositInitial: number) {
  const closed = closedRaw.map(normalizeTrade);
  const wins   = closed.filter((t) => (t.pnl_usd ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl_usd ?? 0) < 0);
  const flat   = closed.filter((t) => (t.pnl_usd ?? 0) === 0);
  const totalPnlUsd = closed.reduce((s, t) => s + (t.pnl_usd ?? 0), 0);
  const scoreAcc: Record<string, { wins: number; trades: number }> = {
    risk_on: { wins: 0, trades: 0 }, neutral_up: { wins: 0, trades: 0 },
    neutral_down: { wins: 0, trades: 0 }, risk_off: { wins: 0, trades: 0 },
  };
  for (const t of closed) {
    const key = t.regime_key;
    if (!scoreAcc[key]) continue;
    scoreAcc[key].trades += 1;
    if ((t.pnl_usd ?? 0) > 0) scoreAcc[key].wins += 1;
  }
  return {
    total_trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    flat: flat.length,
    win_rate: closed.length > 0 ? wins.length / closed.length : 0,
    total_pnl_usd: totalPnlUsd,
    total_pnl_pct: depositInitial > 0 ? (totalPnlUsd / depositInitial) * 100 : 0,
    avg_win_usd: wins.length > 0 ? wins.reduce((s, t) => s + t.pnl_usd, 0) / wins.length : 0,
    avg_loss_usd: losses.length > 0 ? losses.reduce((s, t) => s + t.pnl_usd, 0) / losses.length : 0,
    score_accuracy: scoreAcc,
  };
}

// ── main component ──────────────────────────────────────────────
export default function TradingSection() {
  const { data: trades, isLoading, error } = useQuery({
    queryKey: ["trades"],
    queryFn: fetchTrades,
    staleTime: 5 * 60 * 1000,
  });

  // Live BTC price from OKX
  const { data: livePrice } = useQuery<number>({
    queryKey: ["btc-price-live"],
    queryFn: async () => {
      try {
        const r = await fetch("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP", { mode: "cors" });
        if (r.ok) { const j = await r.json(); return parseFloat(j.data[0].last); }
      } catch {}
      try {
        const r = await fetch(`https://corsproxy.io/?url=${encodeURIComponent("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP")}`);
        if (r.ok) { const j = await r.json(); return parseFloat(j.data[0].last); }
      } catch {}
      return null;
    },
    refetchInterval: 10_000, // refresh every 10s
    staleTime: 10_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
      Завантаження...
    </div>
  );
  if (error || !trades) return (
    <div className="flex items-center justify-center h-full gap-2 text-yellow-400 text-sm">
      <AlertCircle size={16}/> Не вдалось завантажити дані торгів
    </div>
  );

  const pos = trades.open_position;
  const curve: any[] = trades.equity_curve ?? [];
  const closed: any[] = (trades.closed_trades ?? []).map(normalizeTrade);
  const stats = computeStats(trades.closed_trades ?? [], trades.deposit_initial ?? 10000);

  // Live PnL calculation
  const curPrice = livePrice ?? pos?.entry_price;
  let livePnlUsd = 0, livePnlPct = 0;
  if (pos && pos.status === "open" && curPrice) {
    const direction = pos.direction === "LONG" ? 1 : -1;
    livePnlPct = direction * ((curPrice - pos.entry_price) / pos.entry_price) * 100 * pos.leverage;
    livePnlUsd = (livePnlPct / 100) * pos.notional;
  }

  // Distance to SL/TP
  const distSL = pos ? ((pos.sl_price - curPrice) / curPrice * 100) : 0;
  const distTP = pos ? ((pos.tp_price - curPrice) / curPrice * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* ── HEADER STATS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Депозит",
            value: `$${trades.deposit_current.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
            sub: `Старт: $${trades.deposit_initial.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
            color: trades.deposit_current >= trades.deposit_initial ? "text-green-400" : "text-red-400",
          },
          {
            label: "Загальний PnL",
            value: `${stats.total_pnl_pct >= 0 ? "+" : ""}${stats.total_pnl_pct.toFixed(2)}%`,
            sub: `${stats.total_pnl_usd >= 0 ? "+" : ""}$${stats.total_pnl_usd.toFixed(2)}`,
            color: stats.total_pnl_pct >= 0 ? "text-green-400" : "text-red-400",
          },
          {
            label: "Win Rate",
            value: stats.total_trades > 0 ? `${(stats.win_rate * 100).toFixed(0)}%` : "—",
            sub: `${stats.wins}W / ${stats.losses}L / ${stats.flat}F`,
            color: stats.win_rate >= 0.5 ? "text-green-400" : "text-red-400",
          },
          {
            label: "Угод всього",
            value: stats.total_trades,
            sub: "закритих",
            color: "text-[hsl(var(--foreground))]",
          },
        ].map((c, i) => (
          <div key={i} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{c.label}</div>
            <div className={`num text-xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── OPEN POSITION ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
          <Target size={14} className="text-cyan-400" /> Поточна позиція
          <LiveClock price={livePrice} />
        </h2>

        {pos && pos.status === "open" ? (
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-5">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <DirBadge dir={pos.direction} />
                <div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">BTC-USDT-SWAP · Відкрито {pos.opened_at}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 italic">{pos.note}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`num text-2xl font-bold ${livePnlUsd >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {livePnlUsd >= 0 ? "+" : ""}${livePnlUsd.toFixed(2)}
                </div>
                <div className={`num text-sm ${livePnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {livePnlPct >= 0 ? "+" : ""}{livePnlPct.toFixed(3)}%
                </div>
              </div>
            </div>

            {/* Position details grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Ціна входу",  value: `$${pos.entry_price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-[hsl(var(--foreground))]" },
                { label: "Поточна ціна", value: curPrice ? `$${curPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—", color: "text-cyan-400" },
                { label: "Плече",       value: `${pos.leverage}x`, color: "text-[hsl(var(--foreground))]" },
                { label: "Notional",    value: `$${pos.notional.toLocaleString()}`, color: "text-[hsl(var(--foreground))]" },
                { label: "Розмір",      value: `${pos.size_pct}% депозиту`, color: "text-[hsl(var(--foreground))]" },
                { label: "Composite",   value: `${pos.composite_score}/100`, color: "text-cyan-400" },
              ].map((item, i) => (
                <div key={i} className="bg-[hsl(var(--muted)/0.5)] rounded p-3 border border-[hsl(var(--border))]">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{item.label}</div>
                  <div className={`num font-semibold text-sm ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* SL / TP bar */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Shield size={12} className="text-red-400 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-red-400 font-medium">SL: ${pos.sl_price.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                    <span className={`num ${distSL < 0 ? "text-red-400" : "text-[hsl(var(--muted-foreground))]"}`}>
                      {distSL.toFixed(2)}% від ціни
                    </span>
                    <span className="text-red-400">-${Math.abs(pos.max_risk_usd).toFixed(0)}</span>
                  </div>
                  <div className="h-1.5 bg-[hsl(var(--border))] rounded-full overflow-hidden">
                    <div className="h-full bg-red-500/40 rounded-full" style={{ width: `${Math.min(100, Math.abs(distSL) / 3 * 100)}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Target size={12} className="text-green-400 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-green-400 font-medium">TP: ${pos.tp_price.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                    <span className={`num ${distTP > 0 ? "text-green-400" : "text-[hsl(var(--muted-foreground))]"}`}>
                      {distTP >= 0 ? "+" : ""}{distTP.toFixed(2)}% від ціни
                    </span>
                    <span className="text-green-400">+${pos.max_reward_usd.toFixed(0)}</span>
                  </div>
                  <div className="h-1.5 bg-[hsl(var(--border))] rounded-full overflow-hidden">
                    <div className="h-full bg-green-500/40 rounded-full" style={{ width: `${Math.min(100, Math.abs(distTP) / 3 * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-8 flex items-center justify-center gap-3 text-[hsl(var(--muted-foreground))]">
            <Minus size={16} />
            <span className="text-sm">Немає відкритих позицій — наступний сигнал у понеділок</span>
          </div>
        )}
      </section>

      {/* ── EQUITY CURVE ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
          <BarChart2 size={14} className="text-cyan-400" /> Крива депозиту
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-auto">
            Ціль: +2%/міс → ~$200/міс на $10K
          </span>
        </h2>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-5">
          <EquityChart curve={curve} />
          {/* Equity table */}
          {curve.length > 1 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    {["Дата","Депозит","PnL","Подія"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[hsl(var(--muted-foreground))] font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {curve.map((row, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0">
                      <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">{row.date}</td>
                      <td className="px-3 py-2 num font-medium">${row.equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className={`px-3 py-2 num font-medium ${row.pnl > 0 ? "text-green-400" : row.pnl < 0 ? "text-red-400" : "text-[hsl(var(--muted-foreground))]"}`}>
                        {row.pnl === 0 ? "—" : `${row.pnl > 0 ? "+" : ""}$${row.pnl.toFixed(2)}`}
                      </td>
                      <td className="px-3 py-2 text-[hsl(var(--muted-foreground))] italic">{row.event ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── CLOSED TRADES ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
          📋 Журнал угод
          {stats.total_trades > 0 && (
            <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-auto">
              R:R середнє = {stats.wins > 0 && stats.losses > 0 ? (stats.avg_win_usd / Math.abs(stats.avg_loss_usd)).toFixed(2) : "—"}
            </span>
          )}
        </h2>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
          {closed.length === 0 ? (
            <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              Ще немає закритих угод — перша угода відкрита {pos?.opened_at ?? "сьогодні"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {["#","Відкрито","Закрито","Dir","Score","Вхід","Вихід","PnL $","PnL %","Результат","Аналіз"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.map((t: any, i: number) => (
                  <tr key={i} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                    <td className="px-3 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{t.id}</td>
                    <td className="px-3 py-2.5 text-xs">{t.opened_at}</td>
                    <td className="px-3 py-2.5 text-xs">{t.closed_at}</td>
                    <td className="px-3 py-2.5"><DirBadge dir={t.direction} /></td>
                    <td className="px-3 py-2.5 num text-xs text-cyan-400">{t.composite_score}</td>
                    <td className="px-3 py-2.5 num text-xs">${t.entry_price?.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2.5 num text-xs">${t.exit_price?.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className={`px-3 py-2.5 num text-xs font-semibold ${t.pnl_usd >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.pnl_usd >= 0 ? "+" : ""}${t.pnl_usd?.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2.5 num text-xs font-semibold ${t.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct?.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5"><ResultBadge result={t.result} /></td>
                    <td className="px-3 py-2.5 text-xs text-[hsl(var(--muted-foreground))] max-w-xs truncate">{t.analysis ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── SCORE ACCURACY ── */}
      {stats.total_trades > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
            🎯 Точність по режиму
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(stats.score_accuracy).map(([regime, data]: [string, any]) => {
              const acc = data.trades > 0 ? (data.wins / data.trades * 100) : null;
              const labels: Record<string, string> = {
                "risk_on": "🟢 Risk-On", "neutral_up": "🟡↑ Neutral Up",
                "neutral_down": "🟡↓ Neutral Down", "risk_off": "🔴 Risk-Off"
              };
              return (
                <div key={regime} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">{labels[regime] ?? regime}</div>
                  <div className={`num text-xl font-bold ${acc === null ? "text-[hsl(var(--muted-foreground))]" : acc >= 60 ? "text-green-400" : acc >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                    {acc === null ? "—" : `${acc.toFixed(0)}%`}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{data.wins}W / {data.trades - data.wins}L · {data.trades} угод</div>
                  {acc !== null && (
                    <div className="mt-2 h-1 bg-[hsl(var(--border))] rounded-full">
                      <div className={`h-1 rounded-full ${acc >= 60 ? "bg-green-500" : acc >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${acc}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── FORMULA C SIGNAL LEGEND ── */}
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
          ⚙️ Formula v3 — правила системи
          <span className="text-xs px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 rounded font-mono">Macro 25% · CRYPTO 35% · Tech 40%</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            { label: '🟢 LONG Strong', range: '≥ 65', size: '15%', lev: '2×', color: 'border-green-500/30 bg-green-500/5', badge: 'text-green-400' },
            { label: '🟡 LONG Weak', range: '53 – 64', size: '12%', lev: '1.5×', color: 'border-yellow-500/30 bg-yellow-500/5', badge: 'text-yellow-400' },
            { label: '⚪ FLAT', range: '38 – 52', size: '—', lev: '—', color: 'border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]', badge: 'text-[hsl(var(--muted-foreground))]' },
            { label: '🔴 SHORT', range: '< 38', size: '12%', lev: '1.5×', color: 'border-red-500/30 bg-red-500/5', badge: 'text-red-400' },
          ].map((s, i) => (
            <div key={i} className={`rounded-lg border p-3 ${s.color}`}>
              <div className={`text-sm font-bold mb-2 ${s.badge}`}>{s.label}</div>
              <div className="grid grid-cols-2 gap-x-4 text-xs">
                <div><span className="text-[hsl(var(--muted-foreground))]">Composite: </span><span className="num font-medium text-[hsl(var(--foreground))]">{s.range}</span></div>
                <div><span className="text-[hsl(var(--muted-foreground))]">Плече: </span><span className="num font-medium text-[hsl(var(--foreground))]">{s.lev}</span></div>
                <div className="col-span-2"><span className="text-[hsl(var(--muted-foreground))]">Розмір: </span><span className="num font-medium text-[hsl(var(--foreground))]">{s.size}</span></div>
              </div>
            </div>
          ))}
        </div>
        {/* MVRV SHORT filter explanation */}
        <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-xs mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-orange-400 font-semibold">🔆 MVRV SHORT-фільтр</span>
            <span className="text-[hsl(var(--muted-foreground))]">(активний)</span>
          </div>
          <div className="text-[hsl(var(--muted-foreground))] leading-relaxed">
            Якщо composite &lt; 38 (ризик-офф) <strong className="text-[hsl(var(--foreground))]">ALE</strong> MVRV &lt; 1.3 — сигнал змінюється на <strong className="text-orange-400">FLAT_MVRV_FILTER</strong>.
            {' '}Низький MVRV означає: ринок вже дешевовартісний — шорт непрацює без чіткого перепродажу. Поріг MVRV: <strong className="text-[hsl(var(--foreground))]">1.3</strong>.
          </div>
        </div>
        {/* v3 Momentum hold explanation */}
        <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-cyan-400 font-semibold">📌 v3 — Momentum Hold</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 rounded font-mono">NEW</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[hsl(var(--muted-foreground))]">
            <div className="rounded bg-green-500/5 border border-green-500/20 p-2">
              <div className="text-green-400 font-semibold mb-1">LONG</div>
              <div>Вхід: composite ≥ <strong className="text-[hsl(var(--foreground))]">53</strong></div>
              <div>Вихід: composite &lt; <strong className="text-[hsl(var(--foreground))]">46</strong></div>
            </div>
            <div className="rounded bg-red-500/5 border border-red-500/20 p-2">
              <div className="text-red-400 font-semibold mb-1">SHORT</div>
              <div>Вхід: composite &lt; <strong className="text-[hsl(var(--foreground))]">40</strong> + MVRV ≥ 1.3</div>
              <div>Вихід: composite &gt; <strong className="text-[hsl(var(--foreground))]">44</strong></div>
            </div>
          </div>
          <div className="mt-2 text-[hsl(var(--muted-foreground))] leading-relaxed">
            Позиція утримується <strong className="text-[hsl(var(--foreground))]">необмежено</strong> до спрацювання momentum exit — не щотижневий flip.
            {' '}Бектест: 4 угоди за 52 тижні | WR=<strong className="text-green-400">75%</strong> | PnL=<strong className="text-green-400">+44.3%</strong> vs BTC -43.2%
          </div>
        </div>
      </section>

    </div>
  );
}
