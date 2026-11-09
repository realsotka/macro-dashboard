import { useEffect, useRef, useState } from "react";
import type { ThemeId } from "@/lib/theme";
import MatrixRain from "@/components/MatrixRain";

/**
 * First-load splash screen. Shows real progress: it creeps to ~92% while the
 * state is loading and only completes when `ready` is true (data loaded or
 * failed) and a short minimum time has passed. Each theme has its own look.
 */
const STAGES = [
  "Підключення до даних",
  "Макро · TIPS · ETF · COT",
  "Крипто й технічні сигнали",
  "Composite v4-lite",
  "Paper Trade",
];

const MATRIX_LINES = [
  "Wake up, Neo…",
  "Матриця вже має твої макро-дані.",
  "Підключення до потоку: TIPS · ETF · COT · MVRV",
  "Розрахунок composite v4-lite…",
  "Follow the white rabbit.",
];

export default function BootLoader({ theme, ready }: { theme: ThemeId; ready: boolean }) {
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const minMs = reduce ? 300 : theme === "matrix" ? 2400 : 1400;
  const [p, setP] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const start = useRef(performance.now());
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start.current;
      setP(prev => {
        if (readyRef.current && elapsed >= minMs) return Math.min(100, prev + Math.max(4, (100 - prev) * 0.35));
        const target = Math.min(92, (elapsed / minMs) * 92);
        return prev + (Math.max(target, prev) - prev) * 0.5 + 0.2;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [minMs]);

  useEffect(() => {
    if (p >= 100 && !leaving) setLeaving(true);
  }, [p, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setGone(true), reduce ? 0 : 520);
    return () => window.clearTimeout(t);
  }, [leaving, reduce]);

  if (gone) return null;
  const pct = Math.min(100, Math.round(p));
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor((pct / 100) * STAGES.length))];

  return (
    <div
      className={`boot boot-${theme} ${leaving ? "boot-leave" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Завантаження дашборду: ${pct}%`}
      data-testid="boot-loader"
    >
      {theme === "matrix" && (
        <div className="absolute inset-0"><MatrixRain opacity={0.55} fontSize={18} speed={1} /></div>
      )}

      {theme === "matrix" ? (
        <div className="boot-terminal">
          {MATRIX_LINES.map((line, i) => {
            const shownFrom = (i / MATRIX_LINES.length) * 100;
            if (pct < shownFrom) return null;
            const local = Math.min(1, (pct - shownFrom) / (100 / MATRIX_LINES.length));
            const text = line.slice(0, Math.max(1, Math.ceil(line.length * local)));
            return (
              <div key={i} className="boot-line">
                <span className="boot-prompt">&gt;</span> {text}
                {local < 1 && <span className="boot-caret">▌</span>}
              </div>
            );
          })}
          <div className="boot-ascii" aria-hidden="true">
            [{"█".repeat(Math.round(pct / 5)).padEnd(20, "░")}] {String(pct).padStart(3, " ")}%
          </div>
        </div>
      ) : (
        <div className="boot-card">
          <svg viewBox="0 0 32 32" width="64" height="64" fill="none" aria-hidden="true" className="boot-logo">
            <rect width="32" height="32" rx="8" style={{ fill: "hsl(var(--primary) / 0.12)" }} />
            <path className="boot-path" d="M6 22 L11 14 L16 18 L21 10 L26 14" style={{ stroke: "hsl(var(--primary))" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={100} />
            <circle className="boot-dot" cx="26" cy="14" r="2" style={{ fill: "hsl(var(--primary))" }} />
          </svg>
          <div className="boot-brand">Macro</div>
          <div className="boot-sub">BTC Dashboard</div>
          <div className="boot-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="boot-stage">{stage} <span className="num">{pct}%</span></div>
        </div>
      )}
    </div>
  );
}
