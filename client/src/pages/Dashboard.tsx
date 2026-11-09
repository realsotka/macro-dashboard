import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Menu, X } from "lucide-react";
import { fetchState } from "@/lib/dataClient";
import MacroSection from "@/components/MacroSection";
import TechnicalSection from "@/components/TechnicalSection";
import MidTermSection from "@/components/MidTermSection";
import LongTermSection from "@/components/LongTermSection";
import TradingSection from "@/components/TradingSection";
import ReportModal from "@/components/ReportModal";
import { useTheme, THEMES } from "@/lib/theme";
import BootLoader from "@/components/BootLoader";
import MatrixRain from "@/components/MatrixRain";

type Section = "macro" | "technical" | "mid" | "long" | "trading";

const NAV_ITEMS: { id: Section; label: string; icon: string; sublabel: string }[] = [
  { id: "macro",     label: "Макро",      icon: "📊", sublabel: "TIPS · ETF · COT" },
  { id: "technical", label: "Технічний",  icon: "📐", sublabel: "EMAs · FR · OI" },
  { id: "mid",       label: "Мід-терм",   icon: "🎯", sublabel: "2–4 тижні" },
  { id: "long",      label: "Лонг-терм",  icon: "🔭", sublabel: "3–6 місяців" },
  { id: "trading",   label: "Paper Trade", icon: "💸", sublabel: "Pos · PnL · Stats" },
];

function RegimeBadge({ regime, score, confidence }: { regime: string; score?: number; confidence?: number }) {
  const map: Record<string, { color: string; label: string; emoji: string }> = {
    "risk-on":       { color: "bg-green-500/15 text-green-400 border-green-500/30",   label: "Risk-On",       emoji: "🟢" },
    "neutral-up":    { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", label: "Neutral ↑",    emoji: "🟡" },
    "neutral-down":  { color: "bg-orange-500/15 text-orange-400 border-orange-500/30", label: "Neutral ↓",    emoji: "🟡" },
    "neutral":       { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", label: "Neutral",      emoji: "🟡" },
    "risk-off":      { color: "bg-red-500/15 text-red-400 border-red-500/30",          label: "Risk-Off",     emoji: "🔴" },
  };
  const s = map[regime] || map["neutral"];
  const confLabel = confidence !== undefined
    ? confidence >= 60 ? "High" : confidence >= 30 ? "Med" : "Low"
    : null;
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.color}`}>
        {s.emoji} {s.label}
      </span>
      {score !== undefined && (
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {score}/100 · {confLabel}
        </span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [active, setActive] = useState<Section>("macro");
  const [reportOpen, setReportOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ["state"],
    queryFn: fetchState,
    staleTime: 5 * 60 * 1000,
  });

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    await queryClient.refetchQueries();
    setRefreshing(false);
  }

  return (
    <div className="dashboard relative flex h-full bg-[hsl(var(--background))]">
      <BootLoader theme={theme} ready={!isLoading || isError} />

      {/* Matrix digital rain behind everything */}
      {theme === "matrix" && (
        <div className="matrix-rain fixed inset-0 z-0"><MatrixRain /></div>
      )}

      {/* Mobile drawer backdrop */}
      {navOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar: drawer on phones, fixed column from md */}
      <aside
        className={`app-sidebar fixed md:relative inset-y-0 left-0 z-40 w-64 md:w-52 lg:w-56 flex-shrink-0 border-r border-[hsl(var(--border))] flex flex-col bg-[hsl(var(--background))] transition-transform duration-200 md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Навігація"
      >
        {/* Logo */}
        <div className="p-4 lg:p-5 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Macro Dashboard">
              <rect width="32" height="32" rx="8" style={{ fill: "hsl(var(--primary) / 0.15)" }} />
              <path d="M6 22 L11 14 L16 18 L21 10 L26 14" style={{ stroke: "hsl(var(--primary))" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="26" cy="14" r="2" style={{ fill: "hsl(var(--primary))" }} />
            </svg>
            <div>
              <div className="brand-name text-sm font-semibold text-[hsl(var(--foreground))]">Macro</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">BTC Dashboard</div>
            </div>
            <button
              className="ml-auto md:hidden p-1.5 rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              onClick={() => setNavOpen(false)}
              aria-label="Закрити меню"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => { setActive(item.id); setNavOpen(false); }}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                active === item.id
                  ? "nav-active bg-[hsl(var(--primary)/0.12)] border border-[hsl(var(--primary)/0.25)] text-[hsl(var(--foreground))]"
                  : "hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-transparent"
              }`}
            >
              <span className="text-base mt-0.5">{item.icon}</span>
              <div>
                <div className={`text-sm font-medium ${active === item.id ? "text-[hsl(var(--foreground))]" : ""}`}>
                  {item.label}
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{item.sublabel}</div>
              </div>
            </button>
          ))}
        </nav>

        {/* Theme switcher */}
        <div className="px-3 pt-3 border-t border-[hsl(var(--border))]">
          <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1.5">Тема</div>
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="Тема оформлення">
            {THEMES.map(t => (
              <button
                key={t.id}
                data-testid={`theme-${t.id}`}
                aria-pressed={theme === t.id}
                onClick={() => setTheme(t.id)}
                className={`theme-btn px-2 py-1 rounded text-xs border transition-colors ${
                  theme === t.id
                    ? "border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--foreground))]"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Report button */}
        <div className="p-3">
          {report && (
            <button
              data-testid="btn-open-report"
              onClick={() => setReportOpen(true)}
              className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--muted))] hover:bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))] transition-colors text-left"
            >
              <div className="font-medium text-[hsl(var(--foreground))]">📄 Повний звіт</div>
              <div className="mt-0.5">{report.date}</div>
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="app-header min-h-14 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 sm:px-4 lg:px-6 py-2 border-b border-[hsl(var(--border))] flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <button
              className="md:hidden -ml-1 p-1.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
              onClick={() => setNavOpen(true)}
              aria-label="Відкрити меню"
              data-testid="btn-menu"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {NAV_ITEMS.find(n => n.id === active)?.label}
            </h1>
            {!isLoading && report && (
              <RegimeBadge
                regime={report.market_regime}
                score={report.composite_score ?? undefined}
                confidence={report.confidence ?? undefined}
              />
            )}
            {/* Formula badge */}
            <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded font-mono">
              Formula v4-lite · Swing
            </span>
            {/* Composite formula row */}
            {report && report.macro_score_adj !== undefined && (
              <span className="hidden xl:inline num text-[10px] text-[hsl(var(--muted-foreground))]">
                {report.macro_score_adj}&times;0.2 + {(report as any).crypto_score ?? report.cot_score}&times;0.3 + {report.tech_score}&times;0.3 + 50&times;0.12 + {(report as any).stables_score ?? 50}&times;0.08 = 
                <span className="font-bold text-[hsl(var(--foreground))]">{report.composite_score}</span>
              </span>
            )}
            {/* MVRV filter badge */}
            {report?.trade_signal === 'FLAT_MVRV_FILTER' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/15 border border-orange-500/30 text-orange-400 rounded">
                MVRV filter ({report.mvrv?.toFixed(3)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            {report && (
              <span className="hidden sm:inline text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                Тиждень {report.week_label}{report.date ? ` · ${report.date}` : ""}
              </span>
            )}
            {report?.btc_price && (
              <span className="num text-sm font-medium text-[hsl(var(--foreground))] whitespace-nowrap">
                BTC ${report.btc_price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            )}
            <button
              data-testid="btn-refresh"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Оновити всі дані"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-50 text-xs"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{refreshing ? "Оновлення..." : "Оновити"}</span>
            </button>
          </div>
        </header>

        {/* Matrix terminal ticker */}
        {theme === "matrix" && report && (
          <div className="matrix-ticker" aria-hidden="true">
            <div>
              &gt; BTC ${report.btc_price?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              {" "}// COMPOSITE {report.composite_score}/100 // REGIME {String(report.market_regime).toUpperCase()} // MVRV {report.mvrv?.toFixed(2)} // VIX {report.vix}
              {" "}// THERE IS NO SPOON // СИСТЕМА ОНОВЛЕНА {report.last_updated_daily ?? report.date} //
            </div>
          </div>
        )}

        {/* Section content */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
              Завантаження...
            </div>
          ) : report ? (
            <>
              {active === "macro"     && <MacroSection report={report} />}
              {active === "technical" && <TechnicalSection report={report} />}
              {active === "mid"       && <MidTermSection />}
              {active === "long"      && <LongTermSection />}
              {active === "trading"   && <TradingSection />}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
              Немає даних
            </div>
          )}
        </main>
      </div>

      {/* Full report modal */}
      {report && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          report={report}
        />
      )}
    </div>
  );
}
