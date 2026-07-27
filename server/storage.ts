import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { reports, analyses, type Report, type InsertReport, type Analysis, type InsertAnalysis } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
export const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    week_label TEXT NOT NULL,
    market_regime TEXT NOT NULL,
    tips_5y REAL, tips_10y REAL, breakeven_10y REAL, ust_10y REAL,
    etf_weekly_flow REAL, etf_aum REAL, etf_cumulative REAL,
    spy_close REAL, qqq_close REAL, vix REAL,
    cot_btc_percentile REAL, cot_btc_zscore REAL, cot_btc_top4_long REAL,
    cot_btc_oi REAL, cot_sp500_percentile REAL, cot_ust10y_percentile REAL,
    cot_gold_percentile REAL, cot_date TEXT,
    btc_price REAL, btc_ema21 REAL, btc_ema50 REAL,
    btc_fr_avg_7d REAL, btc_weekly_structure TEXT, btc_oi_chg_wow REAL,
    report_md TEXT, summary TEXT
  );
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    bias TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    key_levels TEXT,
    catalysts TEXT
  );
`);

export interface IStorage {
  // Reports
  getReports(): Report[];
  getLatestReport(): Report | undefined;
  getReport(id: number): Report | undefined;
  createReport(data: InsertReport): Report;
  // Analyses
  getAnalyses(type?: string): Analysis[];
  getAnalysis(id: number): Analysis | undefined;
  createAnalysis(data: InsertAnalysis): Analysis;
  updateAnalysis(id: number, data: Partial<InsertAnalysis>): Analysis | undefined;
  deleteAnalysis(id: number): void;
}

export class Storage implements IStorage {
  getReports(): Report[] {
    return db.select().from(reports).orderBy(desc(reports.date)).all();
  }
  getLatestReport(): Report | undefined {
    return db.select().from(reports).orderBy(desc(reports.date)).limit(1).get();
  }
  getReport(id: number): Report | undefined {
    return db.select().from(reports).where(eq(reports.id, id)).get();
  }
  createReport(data: InsertReport): Report {
    return db.insert(reports).values(data).returning().get();
  }
  getAnalyses(type?: string): Analysis[] {
    if (type) {
      return db.select().from(analyses).where(eq(analyses.type, type)).orderBy(desc(analyses.date)).all();
    }
    return db.select().from(analyses).orderBy(desc(analyses.date)).all();
  }
  getAnalysis(id: number): Analysis | undefined {
    return db.select().from(analyses).where(eq(analyses.id, id)).get();
  }
  createAnalysis(data: InsertAnalysis): Analysis {
    return db.insert(analyses).values(data).returning().get();
  }
  updateAnalysis(id: number, data: Partial<InsertAnalysis>): Analysis | undefined {
    return db.update(analyses).set(data).where(eq(analyses.id, id)).returning().get();
  }
  deleteAnalysis(id: number): void {
    db.delete(analyses).where(eq(analyses.id, id)).run();
  }
}

export const storage = new Storage();
