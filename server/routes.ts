import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { insertReportSchema, insertAnalysisSchema } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

function httpsGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error("Parse error")); }
      });
    }).on("error", reject);
  });
}

export async function registerRoutes(httpServer: ReturnType<typeof createServer>, app: Express) {
  // Seed DB with current report data if empty
  const existing = storage.getReports();
  if (existing.length === 0) {
    // Load from state.json
    const statePath = "/home/user/workspace/cron_tracking/c882d2e7/state.json";
    const reportPath = "/home/user/workspace/macro_reports/Макро Звіт 2026-07-27.md";
    let state: any = {};
    let reportMd = "";
    try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
    try { reportMd = fs.readFileSync(reportPath, "utf8"); } catch {}

    storage.createReport({
      date: "2026-07-27",
      week_label: "21–25.07",
      market_regime: state.market_regime || "neutral",
      tips_5y: state.tips_5y, tips_10y: state.tips_10y,
      breakeven_10y: state.breakeven_10y, ust_10y: state.ust_10y,
      etf_weekly_flow: state.etf_weekly_flow, etf_aum: state.etf_aum,
      etf_cumulative: state.etf_cumulative,
      spy_close: state.spy_close, qqq_close: state.qqq_close, vix: state.vix,
      cot_btc_percentile: state.cot_btc_percentile,
      cot_btc_zscore: state.cot_btc_zscore,
      cot_btc_top4_long: parseFloat((state.cot_btc_top4_long_pct || "0").toString().replace("%", "")),
      cot_btc_oi: state.cot_btc_oi,
      cot_sp500_percentile: state.cot_sp500_percentile,
      cot_ust10y_percentile: state.cot_ust10y_percentile,
      cot_gold_percentile: state.cot_gold_percentile,
      cot_date: state.cot_date,
      btc_price: state.btc_price, btc_ema21: state.btc_ema21, btc_ema50: state.btc_ema50,
      btc_fr_avg_7d: state.btc_fr_avg_7d,
      btc_weekly_structure: state.btc_weekly_structure,
      btc_oi_chg_wow: state.btc_oi_chg_wow,
      report_md: reportMd,
      summary: "Тиждень 21–25.07: реальні ставки на максимумі за рік (10Y TIPS 2.43%), ETF відтоки -$193M, Jobless Claims 57-річний мінімум. FOMC 30.07 — ключова подія.",
    });

    // Seed mid-term analysis
    storage.createAnalysis({
      type: "mid",
      date: "2026-07-27",
      title: "BTC Мід-терм: зона рішення перед FOMC",
      bias: "neutral",
      timeframe: "2–4 тижні",
      content: "BTC утримує висхідну weekly структуру (HH/HL, 4 тижні поспіль) і торгується вище EMA21 ($64,572) та EMA50 ($63,960). Funding rate нейтральний — немає перегріву. Ключовий каталізатор: FOMC 30.07. Якщо ФРС дасть голубиний сигнал → ETF потоки відновляться, ціль $68K–$72K. Якщо hawkish → реальні ставки ростуть далі, ціль $61K–$63K. OI -1.35% WoW при зростанні ціни = слабкий momentum, але COT percentile знижується (78-й, -4 WoW) — очищення продовжується.",
      key_levels: JSON.stringify([
        { label: "Resistance 2", price: 66928, type: "resistance" },
        { label: "Resistance 1", price: 65740, type: "resistance" },
        { label: "Поточна ціна", price: 65326, type: "current" },
        { label: "EMA21", price: 64572, type: "support" },
        { label: "EMA50", price: 63960, type: "support" },
        { label: "Major Support", price: 61800, type: "support" },
      ]),
      catalysts: JSON.stringify(["FOMC 30.07 + Powell", "PCE 01.08", "ETF тижневі потоки 28.07–01.08", "COT дані за 29.07 (публ. 01.08)"]),
    });

    // Seed long-term analysis
    storage.createAnalysis({
      type: "long",
      date: "2026-07-27",
      title: "BTC Лонг-терм: макро-структурна картина 2026",
      bias: "neutral",
      timeframe: "3–6 місяців",
      content: "Головний ризик — реальні дохідності (10Y TIPS 2.43%, річний максимум). Історично BTC має сильну від'ємну кореляцію з реальними ставками: TIPS >2% = структурний headwind. ETF AUM $77.74 млрд з кумулятивним притоком $51.35 млрд — інституційна база міцна, але потоки нестабільні. COT BTC percentile повернувся з 99-го на 78-й — overcrowded позиції ліквідовано, що є бичачим структурним фактором. Цикловий максимум циклу (поточний ATH ~$73K) ще не підтверджений як розворот — до тих пір поки ціна вище EMA50 і структура HH/HL — лонг-терм bias нейтрально-бичачий. Ключовий сценарій для H2 2026: ФРС пауза + ETF потоки відновлення → target $80K–$90K. Ключовий ризик: реальні ставки >2.5% + рецесія → зниження до $45K–$55K.",
      key_levels: JSON.stringify([
        { label: "ATH Cycle", price: 73000, type: "resistance" },
        { label: "Major Resistance", price: 70000, type: "resistance" },
        { label: "EMA200 (daily)", price: 62000, type: "support" },
        { label: "Bull Market Support", price: 55000, type: "support" },
        { label: "Bear Target", price: 45000, type: "support" },
      ]),
      catalysts: JSON.stringify(["ФРС паузи / rate cuts", "ETF інституційний приплив", "Реальні ставки < 2%", "Halvening ефект (пік квітень 2025+)", "Геополітика (USD weakening)"]),
    });
  }

  // GET /api/reports
  app.get("/api/reports", (_req, res) => {
    res.json(storage.getReports());
  });

  // GET /api/reports/latest
  app.get("/api/reports/latest", (_req, res) => {
    const r = storage.getLatestReport();
    if (!r) return res.status(404).json({ error: "No reports" });
    res.json(r);
  });

  // GET /api/reports/:id
  app.get("/api/reports/:id", (req, res) => {
    const r = storage.getReport(Number(req.params.id));
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json(r);
  });

  // GET /api/analyses
  app.get("/api/analyses", (req, res) => {
    res.json(storage.getAnalyses(req.query.type as string | undefined));
  });

  // POST /api/analyses
  app.post("/api/analyses", (req, res) => {
    const parsed = insertAnalysisSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    res.json(storage.createAnalysis(parsed.data));
  });

  // PATCH /api/analyses/:id
  app.patch("/api/analyses/:id", (req, res) => {
    const updated = storage.updateAnalysis(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // DELETE /api/analyses/:id
  app.delete("/api/analyses/:id", (req, res) => {
    storage.deleteAnalysis(Number(req.params.id));
    res.json({ ok: true });
  });

  // GET /api/okx/btc — live OKX data proxy (no key needed)
  app.get("/api/okx/btc", async (_req, res) => {
    try {
      const BASE = "https://www.okx.com";

      const [dailyRaw, weeklyRaw, frRaw, oiRaw] = await Promise.all([
        httpsGet(`${BASE}/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1D&limit=55`),
        httpsGet(`${BASE}/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1W&limit=9`),
        httpsGet(`${BASE}/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=21`),
        httpsGet(`${BASE}/api/v5/rubik/stat/contracts/open-interest-history?ccy=BTC&period=1D&limit=7&instId=BTC-USDT-SWAP`),
      ]);

      const closes = dailyRaw.data.map((c: any) => parseFloat(c[4])).reverse();
      const emaFn = (prices: number[], p: number) => {
        const k = 2 / (p + 1); let e = prices[0];
        for (const v of prices.slice(1)) e = v * k + e * (1 - k);
        return e;
      };
      const price = closes[closes.length - 1];
      const ema21 = emaFn(closes.slice(-21), 21);
      const ema50 = emaFn(closes, 50);

      const weekly = weeklyRaw.data.map((c: any) => ({
        t: new Date(parseInt(c[0])).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
        o: parseFloat(c[1]), h: parseFloat(c[2]), l: parseFloat(c[3]), c: parseFloat(c[4]),
      })).reverse();

      const rates = frRaw.data.map((f: any) => parseFloat(f.fundingRate) * 100);
      const frAvg = rates.reduce((a: number, b: number) => a + b, 0) / rates.length;
      const frCur = rates[0];
      const frPos = rates.filter((r: number) => r > 0).length;

      const oiList = oiRaw.data.map((o: any) => ({
        date: new Date(parseInt(o[0])).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
        oi: parseFloat(o[1]),
      })).reverse();
      const oiCur = oiList[oiList.length - 1]?.oi || 0;
      const oiPrev = oiList[0]?.oi || 0;
      const oiChg = oiPrev > 0 ? ((oiCur / oiPrev - 1) * 100) : 0;

      res.json({ price, ema21, ema50, frAvg, frCur, frPos, frTotal: rates.length, oiList, oiChg, weekly });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
