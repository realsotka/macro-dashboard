// ─────────────────────────────────────────────────────────────────────────
// МІЖБІРЖОВІ ДЕРИВАТИВИ BTC — фандинг і OI по всьому ринку
// ─────────────────────────────────────────────────────────────────────────
// Інформаційний блок: НЕ входить у composite / trade_signal / Tech Score.
// Рахує scripts/cross_exchange.py (daily cron). Фандинг — % за 8 год, зважений за OI.

import type { ReactNode } from "react";

type Ex = { ex: string; oi_usd: number; funding_8h: number | null; basis: number | null; src?: string };
type Hist = { date: string; oi_usd: number; funding_8h: number; okx_funding_8h?: number | null };

const NEUTRAL = 0.01, HOT = 0.03;

const LABELS: Record<string, string> = {
  "шорти платять": "bg-green-500/15 text-green-400 border-green-500/30",
  "нейтрально": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "лонги активні": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "перегрів лонгів": "bg-red-500/15 text-red-400 border-red-500/30",
};

function fr(v: number | null | undefined, d = 4) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
}

function usd(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)} млрд`;
  return `$${(v / 1e6).toFixed(0)} млн`;
}

// контрарна логіка, як у Tech Score: перегрів лонгів — червоний, шорти платять — зелений
function frTone(v: number | null | undefined) {
  if (v == null) return "text-[hsl(var(--foreground))]";
  if (v >= HOT) return "text-red-400";
  if (v >= NEUTRAL) return "text-orange-400";
  if (v < 0) return "text-green-400";
  return "text-yellow-400";
}

function Card({ title, value, sub, cls = "" }: { title: string; value: ReactNode; sub?: ReactNode; cls?: string }) {
  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 min-w-0">
      <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{title}</div>
      <div className={`num text-xl font-semibold ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{sub}</div>}
    </div>
  );
}

export default function CrossExchangeBlock({ report }: { report: any }) {
  const r = report ?? {};
  const has = r.xex_funding_oiw_8h != null;
  const rows: Ex[] = Array.isArray(r.xex_exchanges) ? r.xex_exchanges : [];
  const hist: Hist[] = Array.isArray(r.xex_hist) ? r.xex_hist : [];
  const total: number = r.xex_oi_total_usd ?? rows.reduce((a, b) => a + (b.oi_usd || 0), 0);
  const status: string = r.xex_status ?? "";
  const stale = status && !status.startsWith("ok");
  const maxOi = Math.max(1, ...rows.map(x => x.oi_usd || 0));
  const hasLiq = r.xex_liq_total_24h != null;
  const div = r.xex_funding_cex_8h != null && r.xex_funding_hl_8h != null
    ? r.xex_funding_hl_8h - r.xex_funding_cex_8h : null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex flex-wrap items-center gap-2">
        <span>🌐</span> Деривативи по всьому ринку
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
          інформаційно · не в composite
        </span>
        {r.xex_label && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${LABELS[r.xex_label] ?? ""}`}>
            Фандинг: {r.xex_label}
          </span>
        )}
        {stale && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
            ⏳ дані неповні
          </span>
        )}
      </h2>

      {!has ? (
        <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))]">
          Міжбіржові дані з'являться після найближчого щоденного оновлення.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card title="Фандинг ринку (за OI)" value={fr(r.xex_funding_oiw_8h)} cls={frTone(r.xex_funding_oiw_8h)}
              sub={<>за 8 год · 7 днів {fr(r.xex_funding_7d_8h)}</>} />
            <Card title="Фандинг OKX" value={fr(r.xex_funding_okx_8h)} cls={frTone(r.xex_funding_okx_8h)}
              sub={r.xex_funding_okx_8h != null ? <>різниця з ринком {fr(r.xex_funding_okx_8h - r.xex_funding_oiw_8h)}</> : "—"} />
            <Card title="OI по ринку" value={usd(total)} cls="text-[hsl(var(--foreground))]"
              sub={r.xex_oi_chg_24h_pct != null ? <span className={r.xex_oi_chg_24h_pct >= 0 ? "text-green-400" : "text-red-400"}>
                {r.xex_oi_chg_24h_pct > 0 ? "+" : ""}{r.xex_oi_chg_24h_pct.toFixed(2)}% за добу</span>
                : <>частка OKX {r.xex_okx_oi_share_pct ?? "—"}%</>} />
            <Card title="Бірж із фандингом > 0" value={<>{r.xex_funding_pos_n ?? "—"}<span className="text-sm text-[hsl(var(--muted-foreground))]">/{r.xex_funding_n ?? rows.length}</span></>}
              cls="text-[hsl(var(--foreground))]" sub={<>розкид {fr(r.xex_funding_min_8h, 3)} … {fr(r.xex_funding_max_8h, 3)}</>} />
          </div>

          {hasLiq && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card title="Ліквідації за 24 год" value={usd(r.xex_liq_total_24h)} cls="text-[hsl(var(--foreground))]" sub="усі біржі · CoinMarketCap" />
              <Card title="Ліквідовано лонгів" value={usd(r.xex_liq_long_24h)} cls="text-red-400" sub={`${r.xex_liq_long_share_pct ?? "—"}% від усіх`} />
              <Card title="Ліквідовано шортів" value={usd(r.xex_liq_short_24h)} cls="text-green-400"
                sub={r.xex_liq_long_share_pct != null ? `${(100 - r.xex_liq_long_share_pct).toFixed(1)}% від усіх` : ""} />
              <Card title="Перекіс" value={r.xex_liq_long_share_pct == null ? "—" : r.xex_liq_long_share_pct >= 60 ? "змивають лонги" : r.xex_liq_long_share_pct <= 40 ? "змивають шорти" : "рівно"}
                cls="text-[hsl(var(--foreground))] text-base" sub="поріг 60/40" />
            </div>
          )}

          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th className="text-left px-2 sm:px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Біржа</th>
                  <th className="text-right px-2 sm:px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">OI</th>
                  <th className="hidden sm:table-cell px-2 sm:px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium w-[30%]">Частка</th>
                  <th className="text-right px-2 sm:px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Фандинг / 8 год</th>
                  <th className="hidden sm:table-cell text-right px-2 sm:px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] font-medium">Базис</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(x => (
                  <tr key={x.ex} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                    <td className="px-2 sm:px-4 py-2 text-xs text-[hsl(var(--foreground))] font-medium whitespace-nowrap">
                      {x.ex}{x.ex === "Hyperliquid" && <span className="ml-1 text-[10px] text-[hsl(var(--muted-foreground))]">DEX</span>}
                      {x.src === "CMC" && <span className="ml-1 text-[10px] text-[hsl(var(--muted-foreground))]">CMC</span>}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-right num text-xs text-[hsl(var(--foreground))] whitespace-nowrap">{usd(x.oi_usd)}</td>
                    <td className="hidden sm:table-cell px-2 sm:px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[hsl(var(--muted))] rounded-full">
                          <div className="h-1.5 rounded-full bg-cyan-400" style={{ width: `${(x.oi_usd / maxOi) * 100}%` }} />
                        </div>
                        <span className="num text-[11px] text-[hsl(var(--muted-foreground))] w-10 text-right">{total ? ((x.oi_usd / total) * 100).toFixed(1) : "—"}%</span>
                      </div>
                    </td>
                    <td className={`px-2 sm:px-4 py-2 text-right num text-xs ${frTone(x.funding_8h)}`}>{fr(x.funding_8h)}</td>
                    <td className="hidden sm:table-cell px-2 sm:px-4 py-2 text-right num text-xs text-[hsl(var(--muted-foreground))]">{x.basis == null ? "—" : fr(x.basis, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
            💬 Фандинг ринку — середнє по біржах, зважене за відкритим інтересом. Окрема біржа шумна (за 90 днів кореляція з OKX
            лише ≈ 0.4), а середнє по ринку йде з OKX майже в ногу (≈ 0.8 щодня, ≈ 0.9 на тижні) — тому дивимось передусім на
            розбіжності.{div != null && <> Зараз Hyperliquid (DEX) {div >= 0 ? "дорожчий" : "дешевший"} за централізовані біржі на{" "}
            <span className="num text-[hsl(var(--foreground))]">{fr(Math.abs(div))}</span>
            {Math.abs(div) >= 0.005 ? (div > 0 ? " — на DEX агресивніші лонги." : " — на DEX агресивніші шорти.") : " — суттєвої розбіжності немає."}</>}
            {" "}Пороги загальноприйняті: 0.01% за 8 год — базова ставка, ≥ 0.03% — перегрів. Binance і Bybit додаються лише через
            CoinMarketCap; без нього частина ринку не врахована.
            {hist.length < 7 && <> Історія накопичується: {hist.length} дн.</>}
          </div>
        </>
      )}

      <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))] text-right">
        {r.xex_date && <>Оновлено: {r.xex_date} · </>}
        Джерела: {r.xex_source ?? "публічні API бірж"} · {rows.map(x => x.ex).join(", ")}
      </div>
    </section>
  );
}
