import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Weekly macro report snapshots
export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  week_label: text("week_label").notNull(), // e.g. "21–25.07"
  market_regime: text("market_regime").notNull(), // risk-on | neutral | risk-off
  // TIPS
  tips_5y: real("tips_5y"),
  tips_10y: real("tips_10y"),
  breakeven_10y: real("breakeven_10y"),
  ust_10y: real("ust_10y"),
  // ETF
  etf_weekly_flow: real("etf_weekly_flow"),
  etf_aum: real("etf_aum"),
  etf_cumulative: real("etf_cumulative"),
  // Equity
  spy_close: real("spy_close"),
  qqq_close: real("qqq_close"),
  vix: real("vix"),
  // COT
  cot_btc_percentile: real("cot_btc_percentile"),
  cot_btc_zscore: real("cot_btc_zscore"),
  cot_btc_top4_long: real("cot_btc_top4_long"),
  cot_btc_oi: real("cot_btc_oi"),
  cot_sp500_percentile: real("cot_sp500_percentile"),
  cot_ust10y_percentile: real("cot_ust10y_percentile"),
  cot_gold_percentile: real("cot_gold_percentile"),
  cot_date: text("cot_date"),
  // Technical (OKX)
  btc_price: real("btc_price"),
  btc_ema21: real("btc_ema21"),
  btc_ema50: real("btc_ema50"),
  btc_fr_avg_7d: real("btc_fr_avg_7d"),
  btc_weekly_structure: text("btc_weekly_structure"),
  btc_oi_chg_wow: real("btc_oi_chg_wow"),
  // Full report markdown
  report_md: text("report_md"),
  // Notes
  summary: text("summary"),
});

export const insertReportSchema = createInsertSchema(reports).omit({ id: true });
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

// Mid/Long term analysis notes
export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // mid | long
  date: text("date").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  bias: text("bias").notNull(), // bullish | bearish | neutral
  timeframe: text("timeframe").notNull(), // e.g. "2–4 тижні" | "3–6 місяців"
  key_levels: text("key_levels"), // JSON: [{label, price, type}]
  catalysts: text("catalysts"), // JSON: string[]
});

export const insertAnalysisSchema = createInsertSchema(analyses).omit({ id: true });
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analyses.$inferSelect;
