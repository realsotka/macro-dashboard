// Data client — multi-source with fallback chain
// Priority: 1) inline window.__DASHBOARD_DATA__ → 2) same-origin /public/data/ → 3) GitHub API (no rate limit) → 4) raw.github

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

// GitHub API (5000 req/hr limit, no 429 issue unlike raw.githubusercontent.com)
const GITHUB_API = "https://api.github.com/repos/realsotka/macro-dashboard/contents/public/data";
// Fallback raw (may rate-limit under heavy push days)
const GITHUB_RAW = "https://raw.githubusercontent.com/realsotka/macro-dashboard/main";

function bustUrl(url: string) {
  const t = Math.floor(Date.now() / (5 * 60 * 1000));
  return `${url}?t=${t}`;
}

async function fetchViaGithubApi(filename: string): Promise<any> {
  // GitHub Contents API returns base64-encoded content — no rate limit issues
  const res = await fetch(`${GITHUB_API}/${filename}`, {
    headers: { Accept: "application/vnd.github.raw+json" }
  });
  if (!res.ok) throw new Error(`GH API ${filename}: ${res.status}`);
  return filename.endsWith(".md") ? res.text() : res.json();
}

async function fetchJson(filename: string): Promise<any> {
  // 1. Inline data (fastest, zero network — works in iframe/preview)
  const inline = window.__DASHBOARD_DATA__;
  if (inline) {
    if (filename.includes("state"))    return inline.state;
    if (filename.includes("analyses")) return inline.analyses;
    if (filename.includes("trades"))   return inline.trades;
  }

  // 2. Same-origin /public/data/ — works on GitHub Pages (files committed to repo)
  try {
    const res = await fetch(bustUrl(`/macro-dashboard/public/data/${filename}`));
    if (res.ok) return res.json();
  } catch {}

  // 3. GitHub Contents API — high limit, works even after many pushes
  try {
    return await fetchViaGithubApi(filename);
  } catch {}

  // 4. Raw GitHub fallback (may 429 on heavy-push days)
  const res = await fetch(bustUrl(`${GITHUB_RAW}/public/data/${filename}`));
  if (!res.ok) throw new Error(`All sources failed for ${filename}`);
  return res.json();
}

async function fetchText(filename: string): Promise<string> {
  const inline = window.__DASHBOARD_DATA__;
  if (inline?.report && filename.includes("report")) return inline.report;

  try {
    const res = await fetch(bustUrl(`/macro-dashboard/public/data/${filename}`));
    if (res.ok) return res.text();
  } catch {}

  try {
    const res = await fetch(`${GITHUB_API}/${filename}`, {
      headers: { Accept: "application/vnd.github.raw+json" }
    });
    if (res.ok) return res.text();
  } catch {}

  const res = await fetch(bustUrl(`${GITHUB_RAW}/public/data/${filename}`));
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
