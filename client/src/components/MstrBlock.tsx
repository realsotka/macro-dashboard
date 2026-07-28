import { useQuery } from "@tanstack/react-query";

// ─── Static MSTR fundamentals (updated weekly from SEC filings) ───
// Source: Strategy 8-K July 12, 2026 + Yahoo Finance July 24, 2026
const MSTR_FUNDAMENTALS = {
  btc_held: 843_775,
  avg_cost_per_btc: 75_476,
  total_cost_basis: 63.69e9,
  debt: 6.75e9,           // convertible notes
  preferred: 15.46e9,     // STRK + STRF + STRD + STRC
  cash: 3.225e9,          // USD reserve (July 24, 2026)
  shares_basic: 560e6,    // ~560M basic shares
  shares_fds: 700e6,      // fully diluted (incl. all converts & options)
  as_of: "2026-07-24",
  // mNAV historical percentiles (rough, from public data)
  mnav_low: 0.9,
  mnav_high: 3.5,
  mnav_median: 1.6,
};

interface MstrLive {
  price: number;
  mktcap: number;
}

function signalColor(val: number, low: number, mid: number, high: number, invert = false) {
  if (invert) {
    if (val <= low) return "text-green-400";
    if (val <= mid) return "text-yellow-400";
    return "text-red-400";
  }
  if (val >= high) return "text-green-400";
  if (val >= mid) return "text-yellow-400";
  return "text-red-400";
}

function MNavGauge({ mnav }: { mnav: number }) {
  const { mnav_low, mnav_high, mnav_median } = MSTR_FUNDAMENTALS;
  // position on gauge 0..100
  const pct = Math.min(100, Math.max(0, ((mnav - mnav_low) / (mnav_high - mnav_low)) * 100));
  const label =
    mnav < 1.0 ? { text: "Дисконт до BTC", color: "text-green-400" } :
    mnav < 1.3 ? { text: "Близько до NAV", color: "text-yellow-400" } :
    mnav < 2.0 ? { text: "Помірна премія", color: "text-yellow-400" } :
    mnav < 2.8 ? { text: "Висока премія", color: "text-orange-400" } :
    { text: "Ейфорія / перегрів", color: "text-red-400" };

  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] text-[hsl(var(--muted-foreground))] mb-1">
        <span>0.9x (дисконт)</span>
        <span className={label.color + " font-medium"}>{label.text}</span>
        <span>3.5x (ейфорія)</span>
      </div>
      <div className="h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: mnav < 1.3
              ? "hsl(142 76% 36%)"
              : mnav < 2.0
              ? "hsl(45 93% 47%)"
              : "hsl(0 72% 51%)",
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
        <span></span>
        <span>медіан {MSTR_FUNDAMENTALS.mnav_median}x</span>
        <span></span>
      </div>
    </div>
  );
}

export default function MstrBlock() {
  const { btc_held, debt, preferred, cash, shares_basic, shares_fds, avg_cost_per_btc } = MSTR_FUNDAMENTALS;

  // Fetch MSTR stock price via Yahoo Finance (public, no key needed)
  const { data: mstr, isLoading } = useQuery<MstrLive>({
    queryKey: ["/mstr/live"],
    queryFn: async () => {
      async function yf(ticker: string) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        const hdrs = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        };
        // direct
        try {
          const r = await fetch(url, { headers: hdrs });
          if (r.ok) {
            const d = await r.json();
            return d.chart.result[0].meta.regularMarketPrice as number;
          }
        } catch {}
        // corsproxy.io
        try {
          const r = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
          if (r.ok) {
            const d = await r.json();
            return d.chart.result[0].meta.regularMarketPrice as number;
          }
        } catch {}
        // allorigins
        const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
        const d = await r.json();
        return d.chart.result[0].meta.regularMarketPrice as number;
      }

      const price = await yf("MSTR");
      const mktcap = price * MSTR_FUNDAMENTALS.shares_basic;
      return { price, mktcap };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // We also need current BTC price — fetch from OKX
  const { data: btcPrice } = useQuery<number>({
    queryKey: ["/okx/btcprice/mstr"],
    queryFn: async () => {
      async function okxFetch() {
        const url = "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP";
        try {
          const r = await fetch(url); if (r.ok) { const d = await r.json(); return parseFloat(d.data[0].last); }
        } catch {}
        try {
          const r = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`); if (r.ok) { const d = await r.json(); return parseFloat(d.data[0].last); }
        } catch {}
        const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
        const d = await r.json(); return parseFloat(d.data[0].last);
      }
      return okxFetch();
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  // ─── Calculations ───
  const btcP = btcPrice ?? 63_500;
  const mstrP = mstr?.price ?? null;
  const mktcap = mstr ? mstr.price * MSTR_FUNDAMENTALS.shares_basic : null;

  // mNAV
  const btcNAV = btc_held * btcP;
  const mnav = mktcap ? mktcap / btcNAV : null;

  // Net BTC per Share
  const seniorClaimsUSD = debt + preferred - cash;
  const seniorClaimsBTC = seniorClaimsUSD / btcP;
  const netBTC = btc_held - seniorClaimsBTC;
  const netBtcPerShare = netBTC / shares_basic;
  const netBtcPerShareFDS = netBTC / shares_fds;
  const rawBtcPerShare = btc_held / shares_basic;
  const haircut = (1 - netBtcPerShare / rawBtcPerShare) * 100;

  // Bankruptcy Distance
  const breakevenPrice = seniorClaimsUSD / btc_held;
  const distancePct = ((btcP - breakevenPrice) / btcP) * 100;
  const distanceUSD = btcP - breakevenPrice;

  // Cost basis vs current price
  const unrealizedPct = ((btcP - avg_cost_per_btc) / avg_cost_per_btc) * 100;

  return (
    <section>
      <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
        <span>🟧</span> БЛОК 6 — STRATEGY (MSTR)
        <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
          Найбільший корпоративний холдер BTC · {(btc_held / 1000).toFixed(0)}K BTC
        </span>
        {isLoading && (
          <span className="ml-auto text-[10px] text-[hsl(var(--muted-foreground))]">завантаження...</span>
        )}
      </h2>

      {/* ── Row 1: Stock + BTC NAV overview ── */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          {
            label: "MSTR ціна",
            value: mstrP ? `$${mstrP.toFixed(2)}` : "—",
            sub: "NASDAQ · live",
            color: "text-[hsl(var(--foreground))]",
          },
          {
            label: "BTC NAV",
            value: `$${(btcNAV / 1e9).toFixed(1)}B`,
            sub: `${(btc_held / 1000).toFixed(0)}K BTC × $${(btcP / 1000).toFixed(1)}K`,
            color: "text-cyan-400",
          },
          {
            label: "Market Cap",
            value: mktcap ? `$${(mktcap / 1e9).toFixed(1)}B` : "—",
            sub: "акції × ціна",
            color: "text-[hsl(var(--foreground))]",
          },
          {
            label: "Нереалізований PnL",
            value: `${unrealizedPct >= 0 ? "+" : ""}${unrealizedPct.toFixed(1)}%`,
            sub: `avg ${(avg_cost_per_btc / 1000).toFixed(1)}K → ${(btcP / 1000).toFixed(1)}K`,
            color: unrealizedPct >= 0 ? "text-green-400" : "text-red-400",
          },
        ].map((c, i) => (
          <div key={i} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{c.label}</div>
            <div className={`num text-lg font-semibold ${c.color}`}>{c.value}</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: 3 key metrics ── */}
      <div className="grid grid-cols-3 gap-4 mb-4">

        {/* mNAV */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[hsl(var(--foreground))]">mNAV</span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Market Cap / BTC NAV</span>
          </div>
          <div className={`num text-2xl font-bold mb-0.5 ${
            mnav == null ? "text-[hsl(var(--muted-foreground))]" :
            mnav < 1.0 ? "text-green-400" :
            mnav < 2.0 ? "text-yellow-400" : "text-red-400"
          }`}>
            {mnav != null ? `${mnav.toFixed(2)}x` : "—"}
          </div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-2">
            {mnav != null
              ? mnav < 1.0 ? "Торгується нижче BTC NAV — дисконт" :
                mnav < 1.3 ? "Близько до NAV — справедлива оцінка" :
                mnav < 2.0 ? "Помірна премія за Bitcoin strategy" :
                "Висока premium — ринок в ейфорії"
              : "—"}
          </div>
          {mnav != null && <MNavGauge mnav={mnav} />}
        </div>

        {/* Net BTC per Share */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[hsl(var(--foreground))]">Net BTC / Share</span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">після боргів</span>
          </div>
          <div className="num text-2xl font-bold text-cyan-400 mb-0.5">
            ₿{netBtcPerShare.toFixed(6)}
          </div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-3">
            FDS: ₿{netBtcPerShareFDS.toFixed(6)} · без боргу: ₿{rawBtcPerShare.toFixed(6)}
          </div>
          {/* Visual: how much debt eats */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
              <span>Equity (акціонери)</span>
              <span className="text-green-400 font-medium">{(100 - haircut).toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${100 - haircut}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
              <span>Борги/Preferred "їдять"</span>
              <span className="text-red-400 font-medium">{haircut.toFixed(1)}%</span>
            </div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
              ≈ {(seniorClaimsBTC / 1000).toFixed(0)}K BTC у кредиторів
            </div>
          </div>
        </div>

        {/* Bankruptcy Distance */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[hsl(var(--foreground))]">Bankruptcy Distance</span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">до критичної точки</span>
          </div>
          <div className={`num text-2xl font-bold mb-0.5 ${
            distancePct > 60 ? "text-green-400" :
            distancePct > 35 ? "text-yellow-400" : "text-red-400"
          }`}>
            {distancePct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-3">
            BTC має впасти на ${(distanceUSD / 1000).toFixed(1)}K щоб MSTR = банкрут
          </div>
          {/* Price scale */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[hsl(var(--muted-foreground))]">Breakeven</span>
              <span className="num text-red-400 font-medium">${(breakevenPrice / 1000).toFixed(1)}K</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[hsl(var(--muted-foreground))]">Поточна BTC ціна</span>
              <span className="num text-cyan-400 font-medium">${(btcP / 1000).toFixed(1)}K</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[hsl(var(--muted-foreground))]">Avg cost basis</span>
              <span className="num text-yellow-400 font-medium">${(avg_cost_per_btc / 1000).toFixed(1)}K</span>
            </div>
            {/* Mini bar */}
            <div className="mt-2 h-1.5 bg-[hsl(var(--muted))] rounded-full overflow-hidden relative">
              {/* breakeven marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                style={{ left: `${Math.min(95, (breakevenPrice / 100000) * 100)}%` }}
              />
              {/* current price fill */}
              <div
                className="h-full bg-cyan-500 rounded-full"
                style={{ width: `${Math.min(100, (btcP / 100000) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-[hsl(var(--muted-foreground))]">
              <span>$0</span>
              <span>$100K</span>
            </div>
          </div>
        </div>

      </div>

      {/* ── Signal summary ── */}
      <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
        💬 <span className="text-[hsl(var(--foreground))] font-medium">MSTR сигнал:</span>{" "}
        {mnav != null && mnav < 1.1
          ? "mNAV ~1.0x — MSTR торгується майже без премії до BTC. Ринок не закладає growth premium — потенційно краща точка входу в MSTR ніж пряме BTC."
          : mnav != null && mnav > 2.0
          ? "mNAV вище 2.0x — ринок в ейфорії, MSTR переоцінений відносно BTC. Підвищений ризик різкого падіння MSTR при корекції BTC."
          : "mNAV в нейтральній зоні. Bankruptcy distance {distancePct.toFixed(0)}% — системний ризик від MSTR мінімальний поки BTC вище $22–23K."
        }{" "}
        Борги + preferred з'їдають {haircut.toFixed(0)}% BTC резерву — класичний BPS завищує реальну частку акціонера.
      </div>

      <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))] text-right">
        📌 Фундаментальні дані: 8-K July 12, 2026 · Оновлюються з SEC filing при кожній купівлі BTC
      </div>
    </section>
  );
}
