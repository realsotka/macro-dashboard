// ─────────────────────────────────────────────────────────────────────────
// БЛОК 8 — V4 SHADOW (Options + Stablecoins)
// ─────────────────────────────────────────────────────────────────────────
// SHADOW — не впливає на сигнали. Дані та скор цього блоку НЕ інтегровані у
// Formula v3, не впливають на tech_score / crypto_score / macro_score,
// composite_score чи trade_signal. Мета — накопичити історію та перевірити
// якість сигналу перед можливою інтеграцією у майбутню Formula v4.
//
// Basis/Carry (CME futures) НЕ реалізовано — немає безкоштовного джерела
// без API-ключа в цьому пайплайні.

interface OptionsData {
  skew_25d: number | null;
  iv_term: number | null;
  gex_sign: "positive" | "negative" | "unknown";
  dvol: number | null;
  status: "ok" | "partial" | "error";
  expiry_30d_used?: string;
  expiry_7d_used?: string;
}

interface StablesData {
  stable_supply_total: number | null;
  stable_netflow_30d: number | null;
  stable_netflow_30d_pct: number | null;
  stable_netflow_90d: number | null;
  status: "ok" | "partial" | "error";
}

interface ScoresData {
  options_score: number | null;
  stables_score: number | null;
  composite_v4: number | null;
  composite_v3: number | null;
  regime_v4: string | null;
  regime_v3: string | null;
}

interface V4ShadowData {
  basis: { status: string };
  options: OptionsData;
  stables: StablesData;
  scores: ScoresData;
  updated_at: string;
}

function fmtNum(v: number | null | undefined, digits = 2, suffix = "") {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}${suffix}`;
}

function fmtUsd(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "+";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") return null;
  const label = status === "partial" ? "дані частково застарілі" : "дані застарілі";
  return (
    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
      ⏳ {label}
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <div className="h-1.5 w-full rounded bg-[hsl(var(--muted))]" />;
  }
  const color = value >= 60 ? "bg-green-400" : value <= 40 ? "bg-red-400" : "bg-yellow-400";
  return (
    <div className="h-1.5 w-full rounded bg-[hsl(var(--muted))] overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function V4ShadowBlock({ report }: { report: any }) {
  const shadow: V4ShadowData | undefined = report?.v4_shadow;

  if (!shadow) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1 flex items-center gap-2">
          <span>🧪</span> БЛОК 8 — V4 SHADOW
        </h2>
        <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))]">
          Дані v4 shadow ще не опубліковано в state.json.
        </div>
      </section>
    );
  }

  const { options, stables, scores } = shadow;

  return (
    <section>
      <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1 flex items-center gap-2">
        <span>🧪</span> БЛОК 8 — V4 SHADOW
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
          SHADOW — не впливає на сигнали
        </span>
      </h2>
      <div className="mb-4 p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-[11px] text-purple-300 leading-relaxed">
        ⚠️ Тестовий блок нових даних (Options + Stablecoins). НЕ інтегровано у Formula v3 — не
        впливає на tech_score / crypto_score / macro_score, composite_score чи trade_signal.
        Basis/Carry (CME futures) не реалізовано — немає безкоштовного джерела без ключа.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* ── Options card ── */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-[hsl(var(--foreground))]">
              Options (Deribit)
            </div>
            <StatusBadge status={options.status} />
          </div>
          {options.status === "error" ? (
            <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Немає даних</div>
          ) : (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">25Δ Risk Reversal</span>
                <span className="num text-[hsl(var(--foreground))]">{fmtNum(options.skew_25d, 2, " pts")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">IV Term (30d-7d)</span>
                <span className="num text-[hsl(var(--foreground))]">{fmtNum(options.iv_term, 2, " pts")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">GEX (proxy)</span>
                <span className="num text-[hsl(var(--foreground))] capitalize">{options.gex_sign}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">DVOL</span>
                <span className="num text-[hsl(var(--foreground))]">{fmtNum(options.dvol, 2)}</span>
              </div>
              <div className="pt-1.5 mt-1.5 border-t border-[hsl(var(--border))]">
                <div className="flex justify-between mb-1">
                  <span className="text-[hsl(var(--muted-foreground))]">Options Score</span>
                  <span className="num font-medium text-[hsl(var(--foreground))]">
                    {fmtNum(scores.options_score, 1)}
                  </span>
                </div>
                <ScoreBar value={scores.options_score} />
              </div>
              {options.expiry_30d_used && (
                <div className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-70 pt-1">
                  Експірі: {options.expiry_30d_used} (30d) / {options.expiry_7d_used} (7d)
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Stablecoins card ── */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-[hsl(var(--foreground))]">
              Stablecoins (DefiLlama)
            </div>
            <StatusBadge status={stables.status} />
          </div>
          {stables.status === "error" ? (
            <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Немає даних</div>
          ) : (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Total Supply (USDT+USDC+PYUSD)</span>
                <span className="num text-[hsl(var(--foreground))]">
                  {stables.stable_supply_total ? `$${(stables.stable_supply_total / 1e9).toFixed(1)}B` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Netflow 30d</span>
                <span className={`num ${(stables.stable_netflow_30d ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmtUsd(stables.stable_netflow_30d)}
                  {stables.stable_netflow_30d_pct !== null && ` (${fmtNum(stables.stable_netflow_30d_pct, 2, "%")})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Netflow 90d</span>
                <span className={`num ${(stables.stable_netflow_90d ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmtUsd(stables.stable_netflow_90d)}
                </span>
              </div>
              <div className="pt-1.5 mt-1.5 border-t border-[hsl(var(--border))]">
                <div className="flex justify-between mb-1">
                  <span className="text-[hsl(var(--muted-foreground))]">Stables Score</span>
                  <span className="num font-medium text-[hsl(var(--foreground))]">
                    {fmtNum(scores.stables_score, 1)}
                  </span>
                </div>
                <ScoreBar value={scores.stables_score} />
              </div>
            </div>
          )}
        </div>

        {/* ── Basis/Carry stub card ── */}
        <div className="bg-[hsl(var(--card))] border border-dashed border-[hsl(var(--border))] rounded-lg p-3 flex flex-col justify-center items-center text-center">
          <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-1">
            Basis/Carry (CME)
          </div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-70 leading-relaxed">
            📌 не реалізовано — немає безкоштовного джерела CME futures basis без API-ключа
          </div>
        </div>
      </div>

      {/* ── Composite comparison ── */}
      {scores.composite_v4 !== null && scores.composite_v3 !== null && (
        <div className="p-3 bg-[hsl(var(--muted))] rounded-lg text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          💬 <span className="text-[hsl(var(--foreground))] font-medium">Composite v3 (production):</span>{" "}
          <span className="num text-[hsl(var(--foreground))]">{fmtNum(scores.composite_v3, 1)}</span> ({scores.regime_v3}){" "}
          vs{" "}
          <span className="text-[hsl(var(--foreground))] font-medium">Composite v4 shadow:</span>{" "}
          <span className="num text-[hsl(var(--foreground))]">{fmtNum(scores.composite_v4, 1)}</span> ({scores.regime_v4}).{" "}
          Formula v4 = 0.20·macro + 0.30·crypto + 0.30·tech + 0.12·options + 0.08·stables (без Basis/Carry).
        </div>
      )}

      <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))] text-right">
        {shadow.updated_at && <>Оновлено: {shadow.updated_at} · </>}
        Джерела: deribit.com/api/v2 (public) · stablecoins.llama.fi (public) · без API-ключа
      </div>
    </section>
  );
}
