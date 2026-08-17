// Data client — reads from inline window.__DASHBOARD_DATA__ first (static deploy),
// then falls back to /data/*.json (local dev with Express), then raw GitHub.

declare global {
  interface Window {
    __DASHBOARD_DATA__?: {
      state: any;
      analyses: any[];
      trades: any;
      report: string;
    };
  }
}

const GITHUB_RAW = "https://raw.githubusercontent.com/realsotka/macro-dashboard/main";

function bustUrl(url: string) {
  const t = Math.floor(Date.now() / (5 * 60 * 1000));
  return `${url}?t=${t}`;
}

async function fetchJson(path: string): Promise<any> {
  // 1. Try inline data (fastest, no network)
  const inline = window.__DASHBOARD_DATA__;
  if (inline) {
    if (path.includes("state"))    return inline.state;
    if (path.includes("analyses")) return inline.analyses;
    if (path.includes("trades"))   return inline.trades;
  }

  // 2. Try local /data/ (Express dev server)
  try {
    const res = await fetch(bustUrl(`/data/${path}`));
    if (res.ok) return res.json();
  } catch {}

  // 3. Fallback: GitHub raw
  const res = await fetch(bustUrl(`${GITHUB_RAW}/public/data/${path}`));
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

async function fetchText(path: string): Promise<string> {
  const inline = window.__DASHBOARD_DATA__;
  if (inline && path.includes("report")) return inline.report;

  try {
    const res = await fetch(bustUrl(`/data/${path}`));
    if (res.ok) return res.text();
  } catch {}

  const res = await fetch(bustUrl(`${GITHUB_RAW}/public/data/${path}`));
  if (!res.ok) return "";
  return res.text();
}

export async function fetchState() {
  return fetchJson("state.json");
}

export async function fetchAnalyses(type?: "mid" | "long") {
  const all = await fetchJson("analyses.json") as any[];
  return type ? all.filter(a => a.type === type) : all;
}

export async function fetchReport() {
  return fetchText("latest_report.md");
}

export async function fetchTrades() {
  return fetchJson("trades.json");
}
