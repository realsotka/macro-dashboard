"""
Builds weekly aligned series from raw_backtest_data.json, computes
Formula v3 and Formula v4-shadow composite scores week by week, runs the
paper-trading simulation for both, and writes results to backtest_v4.json.

Run after backtest_v4.py (which fetches and caches raw data).
"""
import json
import statistics
from datetime import datetime, timezone, timedelta

with open("/home/user/workspace/macro-dashboard/scripts/raw_backtest_data.json") as f:
    RAW = json.load(f)

# ─────────────────────────────────────────────────────────────────────────
# Dedupe + index raw series
# ─────────────────────────────────────────────────────────────────────────
btc = RAW["btc"]  # oldest->newest, weekly closes
oi_raw = {r["ts"]: r["oi"] for r in RAW["oi"]}
oi_sorted = sorted(oi_raw.items())
funding = sorted(RAW["funding"], key=lambda r: r["ts"])
cot = RAW["cot"]  # oldest->newest by date
mvrv_hist = {r["date"]: r["mvrv"] for r in RAW["mvrv"]}
vix_hist = {r["date"]: r["vix"] for r in RAW["vix"]}
etf_hist = {r["date"]: r["flow_m"] for r in RAW["etf"]}
dvol_hist = sorted(RAW["dvol"], key=lambda r: r["ts"])
stables = RAW["stables"]

N_WEEKS = min(104, len(btc) - 21)  # need 21 prior weeks of history for EMA21 seed
weeks = btc[-(N_WEEKS + 21):]  # extra lookback for EMA21/RSI14 warmup

print(f"Total BTC weeks available: {len(btc)}, using {N_WEEKS} weeks for backtest "
      f"(+21 warmup weeks for EMA21/RSI14)")

CURRENT_TIPS_10Y = 2.43  # FRED unreachable this run; constant proxy, documented gap


def ema_series(closes, period):
    """Returns EMA value aligned to each index (seeded with first value)."""
    k = 2 / (period + 1)
    out = [closes[0]]
    for c in closes[1:]:
        out.append(c * k + out[-1] * (1 - k))
    return out


def rsi14_at(closes_window):
    """closes_window: at least 15 values ending at the point of interest."""
    if len(closes_window) < 15:
        return 50.0
    prices = closes_window[-15:]
    gains, losses = [], []
    for i in range(1, 15):
        diff = prices[i] - prices[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    avg_gain = sum(gains) / 14
    avg_loss = sum(losses) / 14
    rs = avg_gain / avg_loss if avg_loss > 0 else 999
    return round(100 - 100 / (1 + rs), 2)


def nearest_le(sorted_items_by_key, key, get_key=lambda x: x[0]):
    """Binary-ish scan: last item with get_key(item) <= key. sorted_items_by_key ascending."""
    result = None
    for item in sorted_items_by_key:
        if get_key(item) <= key:
            result = item
        else:
            break
    return result


def date_str(ts_ms):
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


# ─────────────────────────────────────────────────────────────────────────
# Precompute technical series
# ─────────────────────────────────────────────────────────────────────────
closes_all = [w["close"] for w in weeks]
ema21_all = ema_series(closes_all, 21)

oi_ts_sorted = [ts for ts, _ in oi_sorted]
oi_vals_sorted = [v for _, v in oi_sorted]


def oi_chg_wow_at(week_ts):
    """% change in OI vs prior week, using nearest available OI weekly point."""
    idx = None
    for i, ts in enumerate(oi_ts_sorted):
        if ts <= week_ts:
            idx = i
    if idx is None or idx == 0:
        return None
    cur = oi_vals_sorted[idx]
    prev = oi_vals_sorted[idx - 1]
    if not prev:
        return None
    return (cur / prev - 1) * 100


def fr_cur_at(week_ts):
    """Average funding rate (%) over the 7 days ending at week_ts, if available."""
    window = [f["rate"] for f in funding if week_ts - 7 * 86400000 < f["ts"] <= week_ts]
    if not window:
        return None
    return sum(window) / len(window)


def cot_net_lev_at(week_date_str):
    candidates = [r for r in cot if r["date"] <= week_date_str]
    return candidates[-1]["net_lev"] if candidates else None


def cot_percentile_at(week_date_str):
    """Percentile of current net_lev vs trailing 52 COT reports as of that date."""
    candidates = [r for r in cot if r["date"] <= week_date_str]
    if len(candidates) < 10:
        return 50.0
    cur = candidates[-1]["net_lev"]
    hist52 = [r["net_lev"] for r in candidates[-52:]]
    return round(sum(1 for x in hist52 if x <= cur) / len(hist52) * 100, 1)


def mvrv_at(week_date_str):
    dates = sorted(d for d in mvrv_hist if d <= week_date_str)
    return mvrv_hist[dates[-1]] if dates else None


def vix_at(week_date_str):
    dates = sorted(d for d in vix_hist if d <= week_date_str)
    return vix_hist[dates[-1]] if dates else None


def etf_flow_4w_avg_at(week_date_str):
    dates = sorted(d for d in etf_hist if d <= week_date_str)
    if not dates:
        return None
    last28 = dates[-28:]
    daily_vals = [etf_hist[d] for d in last28]
    # approximate "weekly sums averaged over 4 weeks" ~ sum of last 28 days / 4
    return sum(daily_vals) / 4


def dvol_at(week_ts):
    candidates = [r for r in dvol_hist if r["ts"] <= week_ts]
    return candidates[-1]["dvol"] if candidates else None


def dvol_percentile_at(week_ts):
    candidates = [r for r in dvol_hist if r["ts"] <= week_ts]
    if len(candidates) < 10:
        return 50.0
    cur = candidates[-1]["dvol"]
    hist104 = [r["dvol"] for r in candidates[-728:]]
    return round(sum(1 for x in hist104 if x <= cur) / len(hist104) * 100, 1)


def stable_netflow_30d_pct_at(week_date_ts):
    """week_date_ts: unix seconds. Uses combined USDT+USDC+PYUSD circulating."""
    total_cur = 0.0
    total_30 = 0.0
    have_cur = have_30 = False
    for sym, hist in stables.items():
        candidates = [h for h in hist if h["date"] <= week_date_ts]
        candidates_30 = [h for h in hist if h["date"] <= week_date_ts - 30 * 86400]
        if candidates:
            total_cur += candidates[-1]["circulating"]
            have_cur = True
        if candidates_30:
            total_30 += candidates_30[-1]["circulating"]
            have_30 = True
    if have_cur and have_30 and total_30 > 0:
        return (total_cur / total_30 - 1) * 100
    return None


# ─────────────────────────────────────────────────────────────────────────
# Formula v3 scoring functions (mirrors production cron logic exactly)
# ─────────────────────────────────────────────────────────────────────────
def calc_tech_score(price, ema21, rsi, fr_cur, oi_chg):
    score = 50
    pct21 = (price / ema21 - 1) * 100
    if pct21 > 3.0:
        ema21_adj = 10
    elif pct21 > 1.0:
        ema21_adj = 6
    elif pct21 > 0.0:
        ema21_adj = 3
    elif pct21 > -1.0:
        ema21_adj = -5
    elif pct21 > -3.0:
        ema21_adj = -8
    else:
        ema21_adj = -12
    score += ema21_adj

    if rsi >= 60:
        rsi_adj = 7
    elif rsi >= 50:
        rsi_adj = 3
    elif rsi >= 40:
        rsi_adj = -3
    else:
        rsi_adj = -7
    score += rsi_adj

    fr = fr_cur if fr_cur is not None else 0.0
    if fr > 0.015:
        fr_adj = -5
    elif fr > 0.005:
        fr_adj = -2
    elif fr > 0.000:
        fr_adj = 1
    elif fr > -0.005:
        fr_adj = 3
    else:
        fr_adj = 5
    score += fr_adj

    oi = oi_chg if oi_chg is not None else 0.0
    if oi > 5.0:
        oi_adj = -6
    elif oi > 2.0:
        oi_adj = -3
    elif oi > -2.0:
        oi_adj = 0
    elif oi > -5.0:
        oi_adj = 3
    elif oi > -10.0:
        oi_adj = 5
    else:
        oi_adj = 6
    score += oi_adj

    return max(0, min(100, round(score)))


def calc_crypto_score(etf_m, cot_pct, mvrv_val):
    if etf_m is None:
        etf_pts = 50
    elif etf_m > 400:
        etf_pts = 75
    elif etf_m > 150:
        etf_pts = 65
    elif etf_m > 30:
        etf_pts = 58
    elif etf_m > -30:
        etf_pts = 50
    elif etf_m > -150:
        etf_pts = 38
    else:
        etf_pts = 25

    cot_pts = round((1 - cot_pct / 100) * 100) if cot_pct is not None else 50

    if mvrv_val is None:
        mvrv_pts = 55
    elif mvrv_val > 3.5:
        mvrv_pts = 20
    elif mvrv_val > 2.5:
        mvrv_pts = 35
    elif mvrv_val > 2.0:
        mvrv_pts = 45
    elif mvrv_val > 1.5:
        mvrv_pts = 55
    elif mvrv_val > 1.0:
        mvrv_pts = 62
    else:
        mvrv_pts = 70

    return max(0, min(100, round(etf_pts * 0.50 + cot_pts * 0.30 + mvrv_pts * 0.20)))


def calc_macro_score(tips10, vix_val):
    if tips10 is None:
        tips_pts = 42
    elif tips10 > 2.5:
        tips_pts = 20
    elif tips10 > 2.0:
        tips_pts = 30
    elif tips10 > 1.5:
        tips_pts = 42
    elif tips10 > 1.0:
        tips_pts = 55
    else:
        tips_pts = 65

    if vix_val is None:
        vix_pts = 58
    elif vix_val > 30:
        vix_pts = 30
    elif vix_val > 25:
        vix_pts = 42
    elif vix_val > 20:
        vix_pts = 50
    elif vix_val > 15:
        vix_pts = 58
    else:
        vix_pts = 65

    return max(0, min(100, round(50 * 0.50 + tips_pts * 0.30 + vix_pts * 0.20)))


def composite_v3(macro, crypto, tech):
    return round(macro * 0.25 + crypto * 0.35 + tech * 0.40, 1)


def regime_from_composite(composite):
    if composite >= 65:
        return "risk-on"
    elif composite >= 53:
        return "neutral-up"
    elif composite >= 38:
        return "neutral-down"
    else:
        return "risk-off"


def apply_hard_filters(composite, regime, mvrv_val):
    mvrv_v = mvrv_val if mvrv_val is not None else 1.5
    if mvrv_v > 3.5 and composite >= 65:
        return "FLAT_MVRV_OV"
    elif composite < 38 and mvrv_v < 1.3:
        return "FLAT_MVRV_FILTER"
    return regime


# ─────────────────────────────────────────────────────────────────────────
# v4 shadow scoring (options via DVOL-percentile proxy; stables real)
# ─────────────────────────────────────────────────────────────────────────
def score_options_dvol_proxy(dvol_pct):
    """Higher DVOL percentile (more fear/vol) -> lower score (bearish tilt),
    mirroring the live logic's inversion of put-skew percentile."""
    if dvol_pct is None:
        return 50.0
    return round(100 - dvol_pct, 1)


def score_stables_pct(netflow_pct, netflow_history_pct):
    if netflow_pct is None:
        return 50.0
    hist = [x for x in netflow_history_pct if x is not None]
    if not hist:
        return 50.0
    pct = sum(1 for x in hist if x <= netflow_pct) / len(hist) * 100
    return round(pct, 1)


def composite_v4(macro, crypto, tech, options_score, stables_score):
    """Per PDF spec: 0.20*macro + 0.30*crypto + 0.30*tech + 0.12*options + 0.08*stables
    (Block A / oi_regime tech-correction skipped — documented gap, Block A not implemented)."""
    return round(
        macro * 0.20 + crypto * 0.30 + tech * 0.30 + options_score * 0.12 + stables_score * 0.08, 1
    )


# ─────────────────────────────────────────────────────────────────────────
# Build weekly rows
# ─────────────────────────────────────────────────────────────────────────
rows = []
netflow_pct_running = []

for i in range(21, len(weeks)):
    w = weeks[i]
    ts = w["ts"]
    price = w["close"]
    d = date_str(ts)

    ema21 = ema21_all[i]
    rsi = rsi14_at(closes_all[max(0, i - 14):i + 1])
    oi_chg = oi_chg_wow_at(ts)
    fr_cur = fr_cur_at(ts)

    tech = calc_tech_score(price, ema21, rsi, fr_cur, oi_chg)

    etf_m = etf_flow_4w_avg_at(d)
    cot_pct = cot_percentile_at(d)
    mvrv_v = mvrv_at(d)
    crypto = calc_crypto_score(etf_m, cot_pct, mvrv_v)

    vix_v = vix_at(d)
    macro = calc_macro_score(CURRENT_TIPS_10Y, vix_v)

    comp_v3 = composite_v3(macro, crypto, tech)
    regime_v3 = regime_from_composite(comp_v3)
    signal_v3 = apply_hard_filters(comp_v3, regime_v3, mvrv_v)
    if vix_v is not None and vix_v > 30 and signal_v3 in ("risk-on", "risk-off"):
        signal_v3 = "FLAT_VIX"

    dvol_pct = dvol_percentile_at(ts)
    options_score = score_options_dvol_proxy(dvol_pct)

    week_date_ts = ts / 1000
    netflow_pct = stable_netflow_30d_pct_at(week_date_ts)
    netflow_pct_running.append(netflow_pct)
    stables_score = score_stables_pct(netflow_pct, netflow_pct_running[:-1] if len(netflow_pct_running) > 1 else [50.0])

    comp_v4 = composite_v4(macro, crypto, tech, options_score, stables_score)
    regime_v4 = regime_from_composite(comp_v4)
    signal_v4 = apply_hard_filters(comp_v4, regime_v4, mvrv_v)
    if vix_v is not None and vix_v > 30 and signal_v4 in ("risk-on", "risk-off"):
        signal_v4 = "FLAT_VIX"

    rows.append({
        "date": d, "price": round(price, 2),
        "macro": macro, "crypto": crypto, "tech": tech,
        "composite_v3": comp_v3, "regime_v3": regime_v3, "signal_v3": signal_v3,
        "options_score": options_score, "stables_score": stables_score,
        "composite_v4": comp_v4, "regime_v4": regime_v4, "signal_v4": signal_v4,
        "mvrv": round(mvrv_v, 4) if mvrv_v else None,
        "oi_chg_available": oi_chg is not None,
        "fr_available": fr_cur is not None,
    })

print(f"Built {len(rows)} weekly rows")
print("Sample first row:", rows[0])
print("Sample last row:", rows[-1])

with open("/home/user/workspace/macro-dashboard/scripts/weekly_rows.json", "w") as f:
    json.dump(rows, f, indent=2)


# ─────────────────────────────────────────────────────────────────────────
# Trade simulation (LONG only per v3 spec structure; SHORT symmetric)
# ─────────────────────────────────────────────────────────────────────────
def simulate(rows, signal_key, composite_key):
    trades = []
    position = None  # {'side','entry_price','entry_date','entry_idx'}
    for i, r in enumerate(rows):
        comp = r[composite_key]
        sig = r[signal_key]
        price = r["price"]
        mvrv_v = r["mvrv"] or 1.5

        if position is None:
            if sig in ("risk-on", "neutral-up") and comp >= 53:
                position = {"side": "LONG", "entry_price": price, "entry_date": r["date"], "entry_idx": i}
            elif sig in ("risk-off",) and comp < 40 and mvrv_v >= 1.3:
                position = {"side": "SHORT", "entry_price": price, "entry_date": r["date"], "entry_idx": i}
        else:
            exit_now = False
            if position["side"] == "LONG" and comp < 46:
                exit_now = True
            elif position["side"] == "SHORT" and comp > 44:
                exit_now = True
            if exit_now:
                pnl_pct = (price / position["entry_price"] - 1) * 100
                if position["side"] == "SHORT":
                    pnl_pct = -pnl_pct
                trades.append({
                    **position, "exit_price": price, "exit_date": r["date"],
                    "exit_idx": i, "pnl_pct": round(pnl_pct, 2),
                })
                position = None

    if position is not None:
        last = rows[-1]
        pnl_pct = (last["price"] / position["entry_price"] - 1) * 100
        if position["side"] == "SHORT":
            pnl_pct = -pnl_pct
        trades.append({
            **position, "exit_price": last["price"], "exit_date": last["date"] + " (open)",
            "exit_idx": len(rows) - 1, "pnl_pct": round(pnl_pct, 2),
        })

    if not trades:
        return {"trades": [], "n_trades": 0, "win_rate": None, "cum_pnl_pct": 0.0, "max_drawdown_pct": 0.0}

    wins = sum(1 for t in trades if t["pnl_pct"] > 0)
    cum_pnl = sum(t["pnl_pct"] for t in trades)

    equity = [0.0]
    for t in trades:
        equity.append(equity[-1] + t["pnl_pct"])
    peak = equity[0]
    max_dd = 0.0
    for e in equity:
        peak = max(peak, e)
        max_dd = min(max_dd, e - peak)

    return {
        "trades": trades, "n_trades": len(trades),
        "win_rate": round(wins / len(trades) * 100, 1),
        "cum_pnl_pct": round(cum_pnl, 2),
        "max_drawdown_pct": round(max_dd, 2),
    }


sim_v3 = simulate(rows, "signal_v3", "composite_v3")
sim_v4 = simulate(rows, "signal_v4", "composite_v4")

# ── Marginal contribution: v3, v3+options, v3+options+stables (no Block A) ──
def composite_v3_plus_options(macro, crypto, tech, options_score):
    # Renormalize v3's 100% across macro/crypto/tech/options, giving options
    # the v4-spec weight (0.12) and shrinking macro/crypto/tech proportionally.
    remaining = 1 - 0.12
    return round(
        (macro * 0.25 + crypto * 0.35 + tech * 0.40) * remaining + options_score * 0.12, 1
    )

for r in rows:
    r["composite_v3_plus_options"] = composite_v3_plus_options(
        r["macro"], r["crypto"], r["tech"], r["options_score"]
    )
    reg = regime_from_composite(r["composite_v3_plus_options"])
    sig = apply_hard_filters(r["composite_v3_plus_options"], reg, r["mvrv"])
    r["regime_v3_plus_options"] = reg
    r["signal_v3_plus_options"] = sig

sim_v3_plus_options = simulate(rows, "signal_v3_plus_options", "composite_v3_plus_options")

buy_hold_pct = round((rows[-1]["price"] / rows[0]["price"] - 1) * 100, 2)

diff_weeks = sum(1 for r in rows if r["regime_v3"] != r["regime_v4"])

comp_v3_series = [r["composite_v3"] for r in rows]
comp_v4_series = [r["composite_v4"] for r in rows]

result = {
    "meta": {
        "run_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "n_weeks": len(rows),
        "date_range": [rows[0]["date"], rows[-1]["date"]],
        "actual_data_depth": {
            "oi_history_weeks": len(oi_sorted),
            "funding_history_days": round(abs(funding[0]["ts"] - funding[-1]["ts"]) / 86400000, 1) if funding else 0,
            "cot_history_weeks": len(cot),
            "mvrv_history_days": len(mvrv_hist),
            "vix_history_weeks": len(vix_hist),
            "etf_flow_history_days": len(etf_hist),
            "dvol_history_days": len(dvol_hist),
            "stablecoin_history_days": {k: len(v) for k, v in stables.items()},
        },
        "limitations": [
            "TIPS_10y used as a CONSTANT proxy (2.43%) for the entire window — FRED (stlouisfed.org) "
            "was unreachable from the sandbox at run time. macro_score's TIPS component carries no real "
            "historical variation in this backtest; only VIX (real weekly history) varies it.",
            "options_score in this backtest uses a DVOL-percentile proxy, NOT real historical skew_25d "
            "-- Deribit's public API has no free historical options-chain/skew endpoint. Only the CURRENT "
            "live week (see state.json v4_shadow.options) reflects a real skew_25d measurement.",
            f"OI weekly history only reaches back {len(oi_sorted)} weeks (to "
            f"{datetime.fromtimestamp(oi_sorted[0][0]/1000,tz=timezone.utc).strftime('%Y-%m-%d')}); "
            "weeks before that use oi_chg=0 (neutral), not a fabricated value.",
            "Funding rate history from OKX's public endpoint only covers the trailing ~93 days; weeks "
            "before that use fr_cur=0 (neutral).",
            "Block A (CME futures basis/carry) is not implemented — no free/keyless data source found. "
            "Its would-be 0.10 weight and the oi_regime tech-correction described in the v4 spec are "
            "both absent from composite_v4 here; the tech component uses the unmodified v3 tech_score.",
        ],
    },
    "v3": sim_v3,
    "v3_plus_options": sim_v3_plus_options,
    "v4": sim_v4,
    "buy_and_hold_pct": buy_hold_pct,
    "regime_diff_weeks": diff_weeks,
    "regime_diff_pct": round(diff_weeks / len(rows) * 100, 1),
    "composite_stats": {
        "v3_mean": round(statistics.mean(comp_v3_series), 1),
        "v4_mean": round(statistics.mean(comp_v4_series), 1),
        "v3_stdev": round(statistics.stdev(comp_v3_series), 1),
        "v4_stdev": round(statistics.stdev(comp_v4_series), 1),
        "correlation": round(statistics.correlation(comp_v3_series, comp_v4_series), 3)
        if len(comp_v3_series) > 1 else None,
    },
}

with open("/home/user/workspace/macro-dashboard/public/data/backtest_v4.json", "w") as f:
    json.dump(result, f, indent=2)

print(json.dumps({k: v for k, v in result.items() if k not in ("v3", "v3_plus_options", "v4")}, indent=2))
print("\nV3 summary:", {k: v for k, v in sim_v3.items() if k != "trades"})
print("V3+options summary:", {k: v for k, v in sim_v3_plus_options.items() if k != "trades"})
print("V4 (v3+options+stables) summary:", {k: v for k, v in sim_v4.items() if k != "trades"})
print(f"\nBuy & hold: {buy_hold_pct}%")
