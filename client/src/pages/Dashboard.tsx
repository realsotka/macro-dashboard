import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchState, fetchReport } from "@/lib/dataClient";
import MacroSection from "@/components/MacroSection";
import TechnicalSection from "@/components/TechnicalSection";
import MidTermSection from "@/components/MidTermSection";
import LongTermSection from "@/components/LongTermSection";
import ReportModal from "@/components/ReportModal";

type Section = "macro" | "technical" | "mid" | "long";

const NAV_ITEMS: { id: Section; label: string; icon: string; sublabel: string }[] = [
  { id: "macro",     label: "Макро",      icon: "📊", sublabel: "TIPS · ETF · COT" },
  { id: "technical", label: "Технічний",  icon: "📐", sublabel: "EMAs · FR · OI" },
  { id: "mid",       label: "Мід-терм",   icon: "🎯", sublabel: "2–4 тижні" },
  { id: "long",      label: "Лонг-терм",  icon: "🔭", sublabel: "3–6 місяців" },
];

function RegimeBadge({ regime }: { regime: string }) {
  const map: Record<string, { color: string; label: string; emoji: string }> = {
    "risk-on":  { color: "bg-green-500/15 text-green-400 border-green-500/30",   label: "Risk-On",  emoji: "🟢" },
    "neutral":  { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", label: "Neutral", emoji: "🟡" },
    "risk-off": { color: "bg-red-500/15 text-red-400 border-red-500/30",          label: "Risk-Off", emoji: "🔴" },
  };
  const s = map[regime] || map["neutral"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.color}`}>
      {s.emoji} {s.label}
    </span>
  );
}

export default function Dashboard() {
  const [active, setActive] = useState<Section>("macro");
  const [reportOpen, setReportOpen] = useState(false);

  // Load state.json from GitHub
  const { data: state, isLoading } = useQuery({
    queryKey: ["state"],
    queryFn: fetchState,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  // Load report markdown from GitHub
  const { data: reportMd = "" } = useQuery({
    queryKey: ["reportMd"],
    queryFn: fetchReport,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div className="dashboard flex h-full bg-[hsl(var(--background))]">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-[hsl(var(--border))] flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Macro Dashboard">
              <rect width="32" height="32" rx="8" fill="hsl(199 80% 52% / 0.15)" />
              <path d="M6 22 L11 14 L16 18 L21 10 L26 14" stroke="hsl(199 80% 52%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="26" cy="14" r="2" fill="hsl(199 80% 52%)" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Macro</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">BTC Dashboard</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => setActive(item.id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                active === item.id
                  ? "bg-[hsl(199_80%_52%/0.12)] border border-[hsl(199_80%_52%/0.25)] text-[hsl(var(--foreground))]"
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

        {/* Report button + last updated */}
        <div className="p-3 border-t border-[hsl(var(--border))] space-y-2">
          {state && (
            <button
              data-testid="btn-open-report"
              onClick={() => setReportOpen(true)}
              className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--muted))] hover:bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))] transition-colors text-left"
            >
              <div className="font-medium text-[hsl(var(--foreground))]">📄 Повний звіт</div>
              <div className="mt-0.5">{state.last_run}</div>
            </button>
          )}
          {state?.last_updated_daily && (
            <div className="px-1 text-[10px] text-[hsl(var(--muted-foreground))]">
              🔄 Дані: {state.last_updated_daily}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-[hsl(var(--border))] flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {NAV_ITEMS.find(n => n.id === active)?.label}
            </h1>
            {!isLoading && state && <RegimeBadge regime={state.market_regime || "neutral"} />}
          </div>
          <div className="flex items-center gap-4">
            {state && (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                Тиждень {state.week_label || ""} · {state.last_run}
              </span>
            )}
            {state?.btc_price && (
              <span className="num text-sm font-medium text-[hsl(var(--foreground))]">
                BTC ${Number(state.btc_price).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
        </header>

        {/* Section content */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
              Завантаження даних з GitHub...
            </div>
          ) : state ? (
            <>
              {active === "macro"     && <MacroSection state={state} />}
              {active === "technical" && <TechnicalSection state={state} />}
              {active === "mid"       && <MidTermSection />}
              {active === "long"      && <LongTermSection />}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
              Немає даних
            </div>
          )}
        </main>
      </div>

      {/* Full report modal */}
      {state && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reportMd={reportMd}
          date={state.last_run}
        />
      )}
    </div>
  );
}
