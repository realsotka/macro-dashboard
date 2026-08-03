import { useQuery } from "@tanstack/react-query";
import { fetchAnalyses, fetchState } from "@/lib/dataClient";

function BiasBadge({ bias }: { bias: string }) {
  const map: Record<string, string> = {
    "bullish": "bg-green-500/15 text-green-400 border-green-500/30",
    "bearish": "bg-red-500/15 text-red-400 border-red-500/30",
    "neutral": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${map[bias] || map["neutral"]}`}>
      {bias === "bullish" ? "🟢 Bullish" : bias === "bearish" ? "🔴 Bearish" : "🟡 Neutral"}
    </span>
  );
}

export default function LongTermSection() {
  const { data: state } = useQuery<any>({
    queryKey: ["state"],
    queryFn: fetchState,
    staleTime: 5 * 60 * 1000,
  });

  const { data: analyses = [], isLoading } = useQuery<any[]>({
    queryKey: ["analyses", "long"],
    queryFn: () => fetchAnalyses("long"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="p-6 text-[hsl(var(--muted-foreground))] text-sm">Завантаження...</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">🔭 Лонг-терм аналіз</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Горизонт 3–6 місяців · Макро-структура · Цикловий контекст</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))] px-2 py-1 bg-[hsl(var(--muted))] rounded">
            📥 оновлюється щопонеділка
          </span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]/60 px-2">
            📌 Статичний аналіз — оновлюється кроном щопонеділка, не в реальному часі
          </span>
        </div>
      </div>

      {/* BTC Macro Framework */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-5 space-y-4">
        <h3 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">BTC Macro Framework</h3>
        <div className="grid grid-cols-2 gap-3">
          {((): { label: string; status: string; val: string; note: string }[] => {
            const tips10 = state?.tips_10y;
            const etfAum = state?.etf_aum;
            const weeklyStruct = state?.btc_weekly_structure;
            const tipsStatus = tips10 != null ? (tips10 > 2.0 ? 'risk' : tips10 > 1.5 ? 'neutral' : 'ok') : 'risk';
            const structStatus = weeklyStruct?.includes('HH') ? 'ok' : weeklyStruct?.includes('LH') ? 'risk' : 'neutral';
            return [
              { label: "Реальні ставки",    status: tipsStatus, val: tips10 != null ? `10Y TIPS ${tips10.toFixed(2)}%` : '10Y TIPS —', note: tips10 != null && tips10 > 2.0 ? '⚠ Headwind > 2%' : tips10 != null && tips10 > 1.5 ? 'Помірний тиск' : '✅ Нейтральна зона' },
              { label: "ETF AUM",           status: "ok",      val: etfAum != null ? `$${etfAum.toFixed(2)}B` : '$77.74B', note: "Інституційна база" },
              { label: "Halvening ефект",   status: "ok",      val: "Квітень 2025+",    note: "Supply shock продовжується" },
              { label: "Weekly структура",  status: structStatus, val: weeklyStruct ?? 'HH/HL × 4', note: structStatus === 'ok' ? 'Bullish momentum' : structStatus === 'risk' ? 'Bearish pressure' : 'Нейтральна' },
              { label: "BTC/USD кореляція", status: "neutral", val: "Негативна",        note: "DXY ↑ = BTC тиск" },
              { label: "Cyclic position",   status: "neutral", val: "Post-halving Y+1", note: "Hist. peak Q3–Q4" },
            ];
          })().map((f, i) => (
            <div key={i} className={`rounded p-3 border ${
              f.status === "ok"      ? "bg-green-500/5 border-green-500/20" :
              f.status === "risk"    ? "bg-red-500/5 border-red-500/20" :
                                       "bg-yellow-500/5 border-yellow-500/20"
            }`}>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">{f.label}</div>
              <div className={`num text-sm font-semibold mt-1 ${
                f.status === "ok" ? "text-green-400" : f.status === "risk" ? "text-red-400" : "text-yellow-400"
              }`}>{f.val}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{f.note}</div>
            </div>
          ))}
        </div>
      </div>

      {analyses.map((a, idx) => (
        <div key={a.id ?? idx} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(var(--border))]">
            <div className="flex items-center gap-3">
              <BiasBadge bias={a.bias} />
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">{a.title}</span>
            </div>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{a.timeframe} · {a.date}</span>
          </div>
          <div className="p-5">
            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed whitespace-pre-wrap">{a.content}</p>
            {a.key_levels && (() => {
              try {
                const levels = JSON.parse(a.key_levels);
                if (!levels?.length) return null;
                return (
                  <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Цінові рівні:</div>
                    <div className="flex flex-wrap gap-2">
                      {levels.map((l: any, i: number) => (
                        <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
                          l.type === "resistance" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          l.type === "current"    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
                                                    "bg-green-500/10 text-green-400 border-green-500/20"
                        }`}>
                          {l.label}: ${Number(l.price).toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
            {a.catalysts && (() => {
              try {
                const cats = JSON.parse(a.catalysts);
                if (!cats?.length) return null;
                return (
                  <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Ключові каталізатори:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {cats.map((c: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded text-xs text-[hsl(var(--muted-foreground))]">{c}</span>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
          </div>
        </div>
      ))}

      {analyses.length === 0 && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))] text-sm">
          Немає аналізів. Буде додано у наступному понеділковому звіті.
        </div>
      )}
    </div>
  );
}
