// ─────────────────────────────────────────────────────────────────────────
// БЛОК 7 — MOMENTUM FILTER (інформаційний, НЕ інтегрований у Formula v3)
// ─────────────────────────────────────────────────────────────────────────
// Це суто довідковий/статистичний блок на основі стороннього дослідження
// історичної поведінки BTC після місяців сильного зростання та після
// шоків волатильності верхнього дециля. Дані статичні (не оновлюються
// кроном) і НЕ впливають на tech_score / crypto_score / macro_score,
// composite_score чи trade_signal. Мета — довідкова інформація для
// прийняття рішень користувачем, а не автоматизований сигнал.

interface MomentumRow {
  label: string;
  n: string;
  avg: string;
  median: string;
  positive: string;
  crashed: string;
}

const TABLE_1: MomentumRow[] = [
  {
    label: "Поточний режим ≥+20% BTC",
    n: "13",
    avg: "+44.8%",
    median: "+0.1%",
    positive: "7/13",
    crashed: "0/13",
  },
  {
    label: "Той самий фільтр, з 2015 р.",
    n: "8",
    avg: "+31.9%",
    median: "+30.0%",
    positive: "6/8",
    crashed: "0/8",
  },
  {
    label: "М'якший (loose) фільтр ≥+20% BTC",
    n: "7",
    avg: "+24.0%",
    median: "+19.2%",
    positive: "5/7",
    crashed: "0/7",
  },
];

export default function MomentumFilterBlock() {
  return (
    <section>
      <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1 flex items-center gap-2">
        <span>📊</span> БЛОК 7 — MOMENTUM FILTER
        <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
          сторонні статистичні дослідження історії BTC
        </span>
      </h2>
      <div className="mb-4 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 leading-relaxed">
        ⚠️ Інформаційний блок. Дані НЕ інтегровані у Formula v3, не впливають на tech_score /
        crypto_score / macro_score, composite_score чи trade_signal. Це довідкова статистика
        для власного аналізу користувача, а не автоматизований торговий сигнал.
      </div>

      {/* ── Table 1: Strong BTC → next month ── */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-[hsl(var(--foreground))] mb-2">
          Сильний BTC → наступний місяць
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))]">
                <th className="text-left font-medium py-1.5 pr-2">Фільтр</th>
                <th className="text-right font-medium py-1.5 px-2">N</th>
                <th className="text-right font-medium py-1.5 px-2">Avg</th>
                <th className="text-right font-medium py-1.5 px-2">Median</th>
                <th className="text-right font-medium py-1.5 px-2">Позитивних</th>
                <th className="text-right font-medium py-1.5 pl-2">Обвал ≤-20%</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_1.map((row, i) => (
                <tr key={i} className="border-b border-[hsl(var(--border))]/50 last:border-0">
                  <td className="py-1.5 pr-2 text-[hsl(var(--foreground))]">{row.label}</td>
                  <td className="text-right py-1.5 px-2 num text-[hsl(var(--muted-foreground))]">{row.n}</td>
                  <td className="text-right py-1.5 px-2 num text-green-400 font-medium">{row.avg}</td>
                  <td className="text-right py-1.5 px-2 num text-[hsl(var(--foreground))]">{row.median}</td>
                  <td className="text-right py-1.5 px-2 num text-[hsl(var(--foreground))]">{row.positive}</td>
                  <td className="text-right py-1.5 pl-2 num text-green-400">{row.crashed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Table 2: After top-decile volatility shock ── */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-[hsl(var(--foreground))] mb-2">
          Після шоку волатильності верхнього дециля
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3">
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-1">Поріг (12М ex-ante vol)</div>
            <div className="num text-base font-semibold text-[hsl(var(--foreground))]">~+1.77σ</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Серп. 2026 виміряно: +1.90σ (кваліфікується)</div>
          </div>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3">
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-1">N спостережень</div>
            <div className="num text-base font-semibold text-[hsl(var(--foreground))]">13</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">історичні епізоди</div>
          </div>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3">
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-1">Avg / Median наступний місяць</div>
            <div className="num text-base font-semibold text-green-400">+17.7% / +12.9%</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">позитивних: 10/13 = 76.9%</div>
          </div>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3">
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-1">Медіанна vol-adj прибутковість</div>
            <div className="num text-base font-semibold text-[hsl(var(--foreground))]">+0.77σ</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
              ≥+1σ: 30.8% · ≤-1σ: 7.7% · ≤-1.5σ: 0/13
            </div>
          </div>
        </div>
      </div>

      {/* ── Supplementary stat ── */}
      <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
        💬 <span className="text-[hsl(var(--foreground))] font-medium">Додаткова статистика (без фільтра, ширша вибірка):</span>{" "}
        З-поміж 34 завершених місяців із зростанням BTC ≥20%, лише{" "}
        <span className="text-green-400 font-medium">2/34 (5.9%)</span> повністю розвернули попередній
        приріст до наступного закриття. При розширенні до повної історії з 2012 року показник
        залишається на подібному рівні — приблизно{" "}
        <span className="text-green-400 font-medium">4.4%</span> — той самий висновок.
      </div>

      <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))] text-right">
        📌 Статичні дані стороннього дослідження · не оновлюються автоматично · виключно для довідки
      </div>
    </section>
  );
}
