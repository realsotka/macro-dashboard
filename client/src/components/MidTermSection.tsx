import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAnalyses } from "@/lib/dataClient";
import type { Analysis } from "@shared/schema";

// For GitHub Pages, analyses are read-only from JSON.
// Edit/add/delete is local state only (no backend).

function BiasBadge({ bias }: { bias: string }) {
  const map: Record<string, string> = {
    "bullish": "bg-green-500/15 text-green-400 border-green-500/30",
    "bearish": "bg-red-500/15 text-red-400 border-red-500/30",
    "neutral": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${map[bias] || map["neutral"]}`}>
      {bias === "bullish" ? "🟢 Бичачий" : bias === "bearish" ? "🔴 Ведмежий" : "🟡 Нейтральний"}
    </span>
  );
}

export default function MidTermSection() {
  const { data: analyses = [], isLoading } = useQuery<any[]>({
    queryKey: ["analyses", "mid"],
    queryFn: () => fetchAnalyses("mid"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="p-6 text-[hsl(var(--muted-foreground))] text-sm">Завантаження...</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">🎯 Мід-терм аналіз</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Горизонт 2–4 тижні · Свінги та ключові сетапи</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))] px-2 py-1 bg-[hsl(var(--muted))] rounded">
            📥 оновлюється щопонеділка
          </span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]/60 px-2">
            📌 Статичний аналіз — оновлюється кроном, не в реальному часі
          </span>
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
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Ключові рівні:</div>
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
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Каталізатори:</div>
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
