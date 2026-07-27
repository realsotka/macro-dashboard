// GitHub raw data URLs
const REPO = "https://raw.githubusercontent.com/realsotka/macro-dashboard/main";

export const DATA_URLS = {
  state:    `${REPO}/public/data/state.json`,
  analyses: `${REPO}/public/data/analyses.json`,
  report:   `${REPO}/public/data/latest_report.md`,
};

// Cache busting — append timestamp rounded to 5 min so data refreshes every 5 min
function bustUrl(url: string) {
  const t = Math.floor(Date.now() / (5 * 60 * 1000));
  return `${url}?t=${t}`;
}

export async function fetchState() {
  const res = await fetch(bustUrl(DATA_URLS.state));
  if (!res.ok) throw new Error("state.json fetch failed");
  return res.json();
}

export async function fetchAnalyses(type?: "mid" | "long") {
  const res = await fetch(bustUrl(DATA_URLS.analyses));
  if (!res.ok) throw new Error("analyses.json fetch failed");
  const all = await res.json() as any[];
  return type ? all.filter(a => a.type === type) : all;
}

export async function fetchReport() {
  const res = await fetch(bustUrl(DATA_URLS.report));
  if (!res.ok) return "";
  return res.text();
}
