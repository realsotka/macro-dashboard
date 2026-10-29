"""
v4 backtest — 2nd iteration, full data (reads scripts/raw_backtest_full.json).

Mirrors PRODUCTION Formula v3 more faithfully than the 1st iteration:
  - weekly candles (OKX 1W) with the in-progress week closed at the current price,
    EMA21 over last 21 closes, Wilder RSI14 over last 55 closes (as in the cron)
  - FR_cur = latest 8h funding rate (%), OI_chg = newest vs oldest of 3 weekly OI points
  - COT percentile over 52 reports + velocity modifier, ETF 4-week average
  - Macro = 50*0.5 + TIPS_pts*0.3 + VIX_pts*0.2 with REAL daily TIPS 10y
  - entries only at the Monday 07:00 UTC weekly run, exits checked at daily 00:00 UTC
    runs and at the weekly run; TP +3% / SL -1.5% from 1H bars; 8% x 1.5 sizing.

No look-ahead: every input is taken "as of" the run time (published-data lags applied).
"""
import json, math, bisect, statistics
from datetime import datetime, timezone, timedelta, date

RAW = json.load(open("/home/user/workspace/macro-dashboard/scripts/raw_backtest_full.json"))
OUT = "/home/user/workspace/macro-dashboard/public/data/backtest_v4.json"
H = 3600000
D = 86400000


def to_ms(dt):
    return int(dt.timestamp() * 1000)


def dstr(t):
    return datetime.fromtimestamp(t / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


class AsOf:
    """sorted (key, value) series; get latest value with key <= k."""
    def __init__(self, pairs):
        pairs = sorted(pairs, key=lambda p: p[0])
        self.k = [p[0] for p in pairs]
        self.v = [p[1] for p in pairs]

    def idx(self, k):
        return bisect.bisect_right(self.k, k) - 1

    def get(self, k, default=None):
        i = self.idx(k)
        return self.v[i] if i >= 0 else default

    def window(self, k, n):
        i = self.idx(k)
        return self.v[max(0, i - n + 1): i + 1] if i >= 0 else []


# ── series ───────────────────────────────────────────────────────────────
h1 = RAW["btc_1h"]                                       # [ts, o, h, l, c, confirm]
h1_end = AsOf([(c[0] + H, c[4]) for c in h1])            # close available at bar end
h1_ts = [c[0] for c in h1]
w1 = [c for c in RAW["btc_1w"]]                          # weekly bars (start ts, UTC+8 Monday)
w1_close = AsOf([(c[0] + 7 * D, c[4]) for c in w1])      # completed weekly closes

# funding (% per 8h, BTC-USDT-SWAP as in production): OKX official archive (2023-12 -> 2025-09-07),
# Binance BTCUSDT as gap proxy (2025-09-08 -> 2026-07-27), OKX API (2026-07-27 -> now)
_f = {}
_okx_arch_end = max(r["ts"] for r in RAW["funding_okx"])
_okx_api_start = min(r["ts"] for r in RAW["funding_okx_recent"])
for r in RAW["funding_binance"]:
    if _okx_arch_end < r["ts"] < _okx_api_start:
        _f[r["ts"]] = ("binance", r["rate"] * 100)
for r in RAW["funding_okx"]:
    _f[r["ts"]] = ("okx_archive", r["rate"] * 100)
for r in RAW["funding_okx_recent"]:
    _f[r["ts"]] = ("okx_api", r["rate"] * 100)
fund = AsOf([(k, v[1]) for k, v in _f.items()])
FUND_SRC = {src: sum(1 for v in _f.values() if v[0] == src) for src in ("okx_archive", "binance", "okx_api")}
FUND_GAP = (dstr(_okx_arch_end), dstr(_okx_api_start))
oi1w = AsOf([(r["ts"], r["oi"]) for r in RAW["oi_1w"]])
oi1d = AsOf([(r["ts"], r["oi"]) for r in RAW["oi_1d"]])
tips = AsOf([(r["date"], r["tips10"]) for r in RAW["tips10"]])
vix = AsOf([(r["date"], r["close"]) for r in RAW["vix"]])
mvrv = AsOf([(r["date"], r["mvrv"]) for r in RAW["mvrv"]])
cot = sorted(RAW["cot"], key=lambda r: r["date"])
cot_dates = [r["date"] for r in cot]
etf = {r["date"]: r["flow_m"] for r in RAW["etf"]}
dvol = AsOf([(r["ts"], r["dvol"]) for r in RAW["dvol"]])
cme = AsOf([(r["date"], r["close"]) for r in RAW["cme_btc_f"]])
opt = {r["date"]: r for r in RAW["options_daily"]}
opt_skew = AsOf([(k, v["skew_25d"]) for k, v in opt.items() if v.get("skew_25d") is not None])
opt_term = AsOf([(k, v["iv_term"]) for k, v in opt.items() if v.get("iv_term") is not None])

# stablecoins combined daily supply
stab_tot = {}
for sym, rows in RAW["stables"].items():
    for r in rows:
        dd = datetime.fromtimestamp(r["date"], tz=timezone.utc).strftime("%Y-%m-%d")
        stab_tot.setdefault(dd, {})[sym] = r["circulating"]
stab = AsOf([(k, sum(v.values())) for k, v in stab_tot.items() if "USDT" in v and "USDC" in v])


def prev_day(dt_str, n=1):
    return (date.fromisoformat(dt_str) - timedelta(days=n)).isoformat()


# ── production formula pieces ────────────────────────────────────────────
def ema(prices, p):
    k = 2 / (p + 1); e = prices[0]
    for v in prices[1:]:
        e = v * k + e * (1 - k)
    return e


def rsi14(prices):
    gains, losses = [], []
    for i in range(1, 15):
        diff = prices[i] - prices[i - 1]
        gains.append(max(diff, 0)); losses.append(max(-diff, 0))
    ag = sum(gains) / 14; al = sum(losses) / 14
    for i in range(15, len(prices)):
        diff = prices[i] - prices[i - 1]
        ag = (ag * 13 + max(diff, 0)) / 14
        al = (al * 13 + max(-diff, 0)) / 14
    rs = ag / al if al > 0 else 999
    return round(100 - 100 / (1 + rs), 2)


def oi_adj_raw(oi_chg):
    if oi_chg > 5.0: return -6
    if oi_chg > 2.0: return -3
    if oi_chg > -2.0: return 0
    if oi_chg > -5.0: return 3
    if oi_chg > -10.0: return 5
    return 6


def tech_score(price, ema21, rsi, fr, oi_chg, oi_mult=1.0):
    s = 50
    p21 = (price / ema21 - 1) * 100
    s += 10 if p21 > 3 else 6 if p21 > 1 else 3 if p21 > 0 else -5 if p21 > -1 else -8 if p21 > -3 else -12
    s += 7 if rsi >= 60 else 3 if rsi >= 50 else -3 if rsi >= 40 else -7
    s += -5 if fr > 0.015 else -2 if fr > 0.005 else 1 if fr > 0 else 3 if fr > -0.005 else 5
    s += oi_adj_raw(oi_chg) * oi_mult
    return max(0, min(100, round(s)))


def crypto_score(etf_m, cot_pct, cot_vel, mv):
    etf_pts = 75 if etf_m > 400 else 65 if etf_m > 150 else 58 if etf_m > 30 else 50 if etf_m > -30 else 38 if etf_m > -150 else 25
    cot_pts = round((1 - cot_pct / 100) * 100)
    if cot_vel > 2000: cot_pts = min(100, cot_pts + 10)
    elif cot_vel > 500: cot_pts = min(100, cot_pts + 5)
    elif cot_vel < -2000: cot_pts = max(0, cot_pts - 10)
    elif cot_vel < -500: cot_pts = max(0, cot_pts - 5)
    mv_pts = 20 if mv > 3.5 else 35 if mv > 2.5 else 45 if mv > 2.0 else 55 if mv > 1.5 else 62 if mv > 1.0 else 70
    return max(0, min(100, round(etf_pts * 0.50 + cot_pts * 0.30 + mv_pts * 0.20)))


def macro_score(t10, vx):
    tp = 20 if t10 > 2.5 else 30 if t10 > 2.0 else 42 if t10 > 1.5 else 55 if t10 > 1.0 else 65
    vp = 30 if vx > 30 else 42 if vx > 25 else 50 if vx > 20 else 58 if vx > 15 else 65
    return max(0, min(100, round(50 * 0.50 + tp * 0.30 + vp * 0.20)))


def regime(c):
    return "risk-on" if c >= 65 else "neutral-up" if c >= 53 else "neutral-down" if c >= 38 else "risk-off"


def pct_rank(v, hist):
    hist = [h for h in hist if h is not None]
    if v is None or len(hist) < 20:
        return None
    return sum(1 for x in hist if x <= v) / len(hist) * 100


# ── per-run inputs ───────────────────────────────────────────────────────
def us_dst(d):
    y = d.year
    mar = date(y, 3, 8); mar += timedelta(days=(6 - mar.weekday()) % 7)
    nov = date(y, 11, 1); nov += timedelta(days=(6 - nov.weekday()) % 7)
    return mar <= d < nov


def last_friday(y, m):
    nm = date(y + (m == 12), m % 12 + 1, 1)
    d = nm - timedelta(days=1)
    while d.weekday() != 4:
        d -= timedelta(days=1)
    return d


def basis_on(dd):
    """annualized CME basis for CME session date dd (str) or None."""
    F = cme.get(dd)
    if F is None or cme.k[cme.idx(dd)] != dd:
        return None
    d = date.fromisoformat(dd)
    hour = 20 if us_dst(d) else 21                      # CME settlement 15:00 CT (min-noise alignment)
    S = h1_end.get(to_ms(datetime(d.year, d.month, d.day, hour, tzinfo=timezone.utc)))
    exp = last_friday(d.year, d.month)
    if d > exp:
        exp = last_friday(d.year + (d.month == 12), d.month % 12 + 1)
    dte = (exp - d).days
    if dte < 7 or not S:
        return None
    return (F / S - 1) * 365 / dte * 100


basis_hist = {}
for r in RAW["cme_btc_f"]:
    b = basis_on(r["date"])
    if b is not None and abs(b) < 60:
        basis_hist[r["date"]] = b
basis_s = AsOf(sorted(basis_hist.items()))


def basis_avg(dd, n=5):
    w = basis_s.window(dd, n)
    return sum(w) / len(w) if w else None


def funding_ann_avg(t, days=7):
    i = fund.idx(t)
    vals = [v for k, v in zip(fund.k[max(0, i - 4 * days):i + 1], fund.v[max(0, i - 4 * days):i + 1]) if k > t - days * D]
    return (sum(vals) / len(vals)) * 3 * 365 if vals else None    # % p.a. (FR_8h% * 3 * 365)


def oi_regime(t, dd):
    oi_now, oi_7 = oi1d.get(t - D), oi1d.get(t - 8 * D)
    if not oi_now or not oi_7:
        return "neutral", {}
    oi_wow = (oi_now / oi_7 - 1) * 100
    b_now, b_7 = basis_avg(prev_day(dd)), basis_avg(prev_day(dd, 8))
    f_now, f_7 = funding_ann_avg(t), funding_ann_avg(t - 7 * D)
    db = (b_now - b_7) if (b_now is not None and b_7 is not None) else None
    dfund = (f_now - f_7) if (f_now is not None and f_7 is not None) else None
    if oi_wow < -2:
        reg = "deleveraging"
    elif oi_wow > 2 and db is not None and db > 0.5:
        reg = "carry"
    elif oi_wow > 2 and dfund is not None and dfund > 1.0 and (db is None or abs(db) <= 0.5):
        reg = "directional"
    else:
        reg = "neutral"
    return reg, {"oi_wow": oi_wow, "basis": b_now, "d_basis": db, "funding_ann": f_now, "d_funding": dfund,
                 "carry_spread": (b_now - f_now) if (b_now is not None and f_now is not None) else None}


def etf_4w(dd):
    """average of the last 4 completed Mon-Fri weekly sums (in $M) before date dd."""
    d = date.fromisoformat(dd)
    monday = d - timedelta(days=d.weekday())
    sums = []
    for k in range(1, 5):
        ws = monday - timedelta(days=7 * k)
        days_ = [(ws + timedelta(days=i)).isoformat() for i in range(5)]
        vals = [etf[x] for x in days_ if x in etf]
        if not vals:
            return None
        sums.append(sum(vals))
    return sum(sums) / 4


def cot_at(dd):
    pub_cut = prev_day(dd, 3)                               # Tue report published Fri
    i = bisect.bisect_right(cot_dates, pub_cut) - 1
    if i < 10:
        return None, None
    nets = [r["net_lev"] for r in cot[max(0, i - 51): i + 1]]
    cur = nets[-1]
    pct = round(sum(1 for x in nets if x <= cur) / len(nets) * 100, 1)
    vel = cot[i]["net_lev"] - cot[i - 1]["net_lev"]
    return pct, vel


def stable_nf30(dd):
    cur, old = stab.get(dd), stab.get(prev_day(dd, 30))
    return (cur / old - 1) * 100 if cur and old else None


SKEW_LOOKBACK_DAYS = 728   # 104 weeks


def options_inputs(dd):
    sk = opt_skew.get(dd)
    if sk is None or opt_skew.k[opt_skew.idx(dd)] < prev_day(dd, 3):
        return None, None, None
    hist = opt_skew.window(prev_day(dd), SKEW_LOOKBACK_DAYS)
    p = pct_rank(sk, hist) if len(hist) >= 180 else None
    return sk, p, opt_term.get(dd)


def score_options(p, mode):
    if p is None:
        return 50.0
    if mode == "spec":            # neutral unless call-put skew is at its NEGATIVE extreme -> contrarian up
        return 50 + (10 - p) * 4 if p <= 10 else 50.0
    if mode == "contrarian":      # linear: puts expensive vs calls -> bullish
        return 100 - p
    if mode == "trend":           # linear: what the live v4_shadow code effectively does
        return p
    raise ValueError(mode)


def snapshot(t):
    """all inputs + scores at run time t (ms UTC)."""
    dd = dstr(t)
    price = h1_end.get(t)
    i = w1_close.idx(t)
    closes = w1_close.v[max(0, i - 54): i + 1] + [price]
    e21 = ema(closes[-21:], 21)
    r14 = rsi14(closes[-55:])
    fr = fund.get(t)
    oi_pts = oi1w.window(t, 3)
    oi_chg = (oi_pts[-1] / oi_pts[0] - 1) * 100 if len(oi_pts) == 3 else 0.0
    mv = mvrv.get(prev_day(dd)) or 1.5
    vx = vix.get(prev_day(dd)) or 20.0
    t10 = tips.get(prev_day(dd)) or 2.0
    em = etf_4w(dd)
    cp, cv = cot_at(dd)
    reg, binfo = oi_regime(t, dd)
    mult = {"carry": 0.3, "directional": 1.5}.get(reg, 1.0)
    sk, skp, term = options_inputs(dd)
    nf = stable_nf30(prev_day(dd))
    nf_hist = [stable_nf30(prev_day(dd, 1 + 7 * k)) for k in range(1, 105)]
    stab_p = pct_rank(nf, nf_hist)
    s = dict(t=t, date=dd, price=price, ema21=e21, rsi=r14, fr=fr, oi_chg=oi_chg, mvrv=mv, vix=vx, tips10=t10,
             etf_4w=em, cot_pct=cp, cot_vel=cv, oi_regime=reg, skew=sk, skew_pct=skp, iv_term=term,
             dvol=dvol.get(t), stab_nf30=nf, stab_pct=stab_p, **binfo)
    s["tech"] = tech_score(price, e21, r14, fr, oi_chg)
    s["tech_corr"] = tech_score(price, e21, r14, fr, oi_chg, mult)
    s["crypto"] = crypto_score(em if em is not None else 0, cp if cp is not None else 50, cv or 0, mv)
    s["macro"] = macro_score(t10, vx)
    s["stables_score"] = round(stab_p, 1) if stab_p is not None else 50.0
    for m in ("spec", "contrarian", "trend"):
        s[f"opt_{m}"] = round(score_options(skp, m), 1)
    return s


def comp(s, variant):
    M, C, T, TC, ST = s["macro"], s["crypto"], s["tech"], s["tech_corr"], s["stables_score"]
    O = s["opt_spec"]
    if variant == "v3":
        return M * 0.25 + C * 0.35 + T * 0.40
    if variant == "v3+basis":
        return M * 0.25 + C * 0.35 + TC * 0.40
    if variant == "v3+basis+options":
        return (M * 0.20 + C * 0.30 + TC * 0.30 + O * 0.12) / 0.92
    if variant == "v4":                                   # v3+basis+options+stables (spec weights)
        return M * 0.20 + C * 0.30 + TC * 0.30 + O * 0.12 + ST * 0.08
    # sensitivities
    if variant == "v4_reweight_only":                    # v4 weights, new blocks fixed at neutral 50
        return M * 0.20 + C * 0.30 + T * 0.30 + 50 * 0.20
    if variant == "v4_no_basis":
        return M * 0.20 + C * 0.30 + T * 0.30 + O * 0.12 + ST * 0.08
    if variant == "v4_opt_contrarian":
        return M * 0.20 + C * 0.30 + TC * 0.30 + s["opt_contrarian"] * 0.12 + ST * 0.08
    if variant == "v4_opt_trend":
        return M * 0.20 + C * 0.30 + TC * 0.30 + s["opt_trend"] * 0.12 + ST * 0.08
    if variant == "v4_rw+options":                       # reweight + options only (stables neutral)
        return M * 0.20 + C * 0.30 + T * 0.30 + O * 0.12 + 50 * 0.08
    if variant == "v4_rw+stables":                       # reweight + stables only (options neutral)
        return M * 0.20 + C * 0.30 + T * 0.30 + 50 * 0.12 + ST * 0.08
    if variant == "v3+stables":
        return (M * 0.20 + C * 0.30 + T * 0.30 + ST * 0.08) / 0.88
    raise ValueError(variant)


MAIN = ["v3", "v3+basis", "v3+basis+options", "v4"]
SENS = ["v4_reweight_only", "v4_rw+options", "v4_rw+stables", "v4_no_basis", "v4_opt_contrarian", "v4_opt_trend", "v3+stables"]
VARIANTS = MAIN + SENS

# ── run grid ─────────────────────────────────────────────────────────────
START = datetime(2024, 2, 19, tzinfo=timezone.utc)     # first Monday with ETF 4w + OI 1W(3 pts) + 104w skew/stables history
last_h1 = h1[-1][0] + H
END = datetime.fromtimestamp(last_h1 / 1000, tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
runs = []
d = START
while d <= END:
    runs.append((to_ms(d), "daily"))
    if d.weekday() == 0:
        runs.append((to_ms(d + timedelta(hours=7)), "weekly"))
    d += timedelta(days=1)

SNAP = {t: snapshot(t) for t, _ in runs}
for s in SNAP.values():
    for v in VARIANTS:
        s[v] = round(comp(s, v), 1)


def bars_between(t0, t1):
    i0 = bisect.bisect_left(h1_ts, t0)
    i1 = bisect.bisect_left(h1_ts, t1 - H + 1)
    return h1[i0:i1]


# ── simulation ───────────────────────────────────────────────────────────
def simulate(variant, mode, el=53, xl=46, es=40, xs=44, t0=None, t1=None):
    """mode: 'tpsl_first_touch' | 'tpsl_prod_priority' | 'hold_momentum'"""
    dep = 10000.0; peak = dep; mdd = 0.0
    pos = None; trades = []; last_t = None
    for t, kind in runs:
        if (t0 and t < t0) or (t1 and t > t1 and pos is None):
            continue
        s = SNAP[t]; c = s[variant]; price = s["price"]
        if pos:
            close = None
            if mode != "hold_momentum":
                bars = bars_between(pos["checked_to"], t)
                if mode == "tpsl_first_touch":
                    for b in bars:
                        hit_tp = b[2] >= pos["tp"] if pos["dir"] == "LONG" else b[3] <= pos["tp"]
                        hit_sl = b[3] <= pos["sl"] if pos["dir"] == "LONG" else b[2] >= pos["sl"]
                        if hit_sl:                       # conservative: SL first if both in one hour
                            close = ("SL", pos["sl"], b[0] + H); break
                        if hit_tp:
                            close = ("TP", pos["tp"], b[0] + H); break
                else:                                    # production: hi/lo since open, TP priority, only at checks
                    allb = bars_between(pos["t_open"], t)
                    if allb:
                        hi = max(b[2] for b in allb); lo = min(b[3] for b in allb)
                        if pos["dir"] == "LONG":
                            if hi >= pos["tp"]: close = ("TP", pos["tp"], t)
                            elif lo <= pos["sl"]: close = ("SL", pos["sl"], t)
                        else:
                            if lo <= pos["tp"]: close = ("TP", pos["tp"], t)
                            elif hi >= pos["sl"]: close = ("SL", pos["sl"], t)
                pos["checked_to"] = t
            if close is None:
                if pos["dir"] == "LONG" and c < xl:
                    close = ("MOMENTUM", price, t)
                elif pos["dir"] == "SHORT" and c > xs:
                    close = ("MOMENTUM", price, t)
                elif pos["dir"] == "SHORT" and s["mvrv"] < 1.0:
                    close = ("MVRV_BOTTOM", price, t)
            if close:
                reason, px, tc = close
                move = (px / pos["entry"] - 1) if pos["dir"] == "LONG" else (pos["entry"] / px - 1)
                pnl = pos["notional"] * move * 1.5            # production formula (leverage applied in pnl_pct)
                dep += pnl
                trades.append(dict(dir=pos["dir"], opened=dstr(pos["t_open"]), closed=dstr(tc), entry=round(pos["entry"], 1),
                                   exit=round(px, 1), reason=reason, comp_open=pos["comp"], comp_close=c,
                                   move_pct=round(move * 100, 2), pnl_usd=round(pnl, 2), dep_after=round(dep, 2)))
                pos = None
                peak = max(peak, dep); mdd = min(mdd, dep / peak - 1)
                continue                                     # no same-run re-entry
        if kind == "weekly" and pos is None:
            mv, vx = s["mvrv"], s["vix"]
            if t1 and t > t1:
                continue
            dr = "LONG" if (c >= el and mv <= 3.5 and vx <= 30) else "SHORT" if (c < es and mv >= 1.3 and vx <= 30) else None
            if dr:
                notional = dep * 0.08 * 1.5
                tp = price * (1.03 if dr == "LONG" else 0.97)
                sl = price * (0.985 if dr == "LONG" else 1.015)
                pos = dict(dir=dr, entry=price, tp=tp, sl=sl, notional=notional, t_open=t, checked_to=t, comp=c)
        # mark-to-market drawdown on deposit
        if pos:
            move = (price / pos["entry"] - 1) if pos["dir"] == "LONG" else (pos["entry"] / price - 1)
            eq = dep + pos["notional"] * move * 1.5
        else:
            eq = dep
        peak = max(peak, eq); mdd = min(mdd, eq / peak - 1)
    open_info = None
    if pos:
        s = SNAP[runs[-1][0]]
        move = (s["price"] / pos["entry"] - 1) if pos["dir"] == "LONG" else (pos["entry"] / s["price"] - 1)
        open_info = dict(dir=pos["dir"], opened=dstr(pos["t_open"]), entry=round(pos["entry"], 1), unrealized_move_pct=round(move * 100, 2))
    wins = sum(1 for x in trades if x["pnl_usd"] > 0)
    # price-move stats (independent of the tiny 8% sizing)
    moves = [x["move_pct"] for x in trades]
    return dict(variant=variant, mode=mode, trades=len(trades), wins=wins,
                win_rate=round(wins / len(trades) * 100, 1) if trades else None,
                pnl_usd=round(dep - 10000, 2), pnl_pct_deposit=round((dep / 10000 - 1) * 100, 2),
                max_dd_pct_deposit=round(mdd * 100, 2),
                sum_move_pct=round(sum(moves), 2), avg_move_pct=round(sum(moves) / len(moves), 2) if moves else None,
                reasons={r: sum(1 for x in trades if x["reason"] == r) for r in set(x["reason"] for x in trades)},
                long=sum(1 for x in trades if x["dir"] == "LONG"), short=sum(1 for x in trades if x["dir"] == "SHORT"),
                open_position=open_info, trade_list=trades)


def hold_unlevered(variant, el=53, xl=46, es=40, xs=44, t0=None, t1=None):
    """Signal-quality view: 100% notional, no leverage, hold until momentum exit (like 1st backtest)."""
    eq = 1.0; peak = 1.0; mdd = 0.0; pos = None; n = 0; w = 0
    for t, kind in runs:
        if (t0 and t < t0) or (t1 and t > t1 and pos is None):
            continue
        s = SNAP[t]; c = s[variant]; px = s["price"]
        if pos:
            ex = (pos[0] == "LONG" and c < xl) or (pos[0] == "SHORT" and (c > xs or s["mvrv"] < 1.0))
            cur = eq * ((px / pos[1]) if pos[0] == "LONG" else (2 - px / pos[1]))
            peak = max(peak, cur); mdd = min(mdd, cur / peak - 1)
            if ex:
                r = (px / pos[1] - 1) if pos[0] == "LONG" else (pos[1] / px - 1)
                eq *= 1 + r; n += 1; w += r > 0; pos = None
                continue
        if kind == "weekly" and pos is None and not (t1 and t > t1):
            if c >= el and s["mvrv"] <= 3.5 and s["vix"] <= 30: pos = ("LONG", px)
            elif c < es and s["mvrv"] >= 1.3 and s["vix"] <= 30: pos = ("SHORT", px)
    return dict(trades=n, win_rate=round(w / n * 100, 1) if n else None, ret_pct=round((eq - 1) * 100, 2), max_dd_pct=round(mdd * 100, 2))


weekly_runs = [t for t, k in runs if k == "weekly"]


def forward_stats(variant):
    """forward 1w / 4w BTC return by regime at the weekly run (larger sample than trades)."""
    out = {}
    for t in weekly_runs:
        s = SNAP[t]
        f1 = h1_end.get(t + 7 * D); f4 = h1_end.get(t + 28 * D)
        if t + 28 * D > last_h1:
            f4 = None
        if t + 7 * D > last_h1:
            f1 = None
        rg = regime(s[variant])
        o = out.setdefault(rg, {"n": 0, "r1": [], "r4": []})
        o["n"] += 1
        if f1: o["r1"].append((f1 / s["price"] - 1) * 100)
        if f4: o["r4"].append((f4 / s["price"] - 1) * 100)
    res = {}
    for rg, o in out.items():
        res[rg] = dict(weeks=o["n"], fwd1w_avg=round(statistics.mean(o["r1"]), 2) if o["r1"] else None,
                       fwd4w_avg=round(statistics.mean(o["r4"]), 2) if o["r4"] else None,
                       fwd4w_hit_up=round(sum(1 for x in o["r4"] if x > 0) / len(o["r4"]) * 100, 1) if o["r4"] else None)
    xs = []; ys = []
    for t in weekly_runs:
        if t + 28 * D <= last_h1:
            xs.append(SNAP[t][variant]); ys.append((h1_end.get(t + 28 * D) / SNAP[t]["price"] - 1) * 100)
    corr = statistics.correlation(xs, ys) if len(xs) > 10 else None
    return res, round(corr, 3) if corr is not None else None


def dist(variant):
    xs = [SNAP[t][variant] for t in weekly_runs]
    q = statistics.quantiles(xs, n=10)
    return dict(mean=round(statistics.mean(xs), 1), std=round(statistics.stdev(xs), 1), min=min(xs), max=max(xs),
                p10=round(q[0], 1), p50=round(statistics.median(xs), 1), p90=round(q[-1], 1),
                regimes={r: sum(1 for x in xs if regime(x) == r) for r in ("risk-on", "neutral-up", "neutral-down", "risk-off")},
                weeks_ge53=sum(1 for x in xs if x >= 53), weeks_lt40=sum(1 for x in xs if x < 40))


if __name__ == "__main__":
    p0 = SNAP[weekly_runs[0]]["price"]; p1 = SNAP[runs[-1][0]]["price"]
    bh = (p1 / p0 - 1) * 100
    results = {}
    for v in VARIANTS:
        fw, corr = forward_stats(v)
        results[v] = dict(
            tpsl_first_touch=simulate(v, "tpsl_first_touch"),
            tpsl_prod_priority=simulate(v, "tpsl_prod_priority"),
            hold_momentum=simulate(v, "hold_momentum"),
            hold_unlevered=hold_unlevered(v),
            composite_dist=dist(v), forward_by_regime=fw, corr_composite_fwd4w=corr,
            weeks_regime_diff_vs_v3=sum(1 for t in weekly_runs if regime(SNAP[t][v]) != regime(SNAP[t]["v3"])),
            corr_with_v3=round(statistics.correlation([SNAP[t][v] for t in weekly_runs], [SNAP[t]["v3"] for t in weekly_runs]), 3),
        )
    GRID = [(el, xl) for el in (51, 52, 53, 54, 55) for xl in (44, 45, 46, 47, 48) if xl < el]
    robust = {}
    for v in VARIANTS:
        ru = [hold_unlevered(v, el, xl)["ret_pct"] for el, xl in GRID]
        ra = [simulate(v, "tpsl_first_touch", el, xl)["pnl_usd"] for el, xl in GRID]
        robust[v] = dict(hold_unlevered_median=round(statistics.median(ru), 2), hold_unlevered_min=min(ru), hold_unlevered_max=max(ru),
                         tpsl_median_usd=round(statistics.median(ra), 2), tpsl_min_usd=min(ra), tpsl_max_usd=max(ra))
    for v in VARIANTS:
        if v == "v3": continue
        bu = [hold_unlevered(v, el, xl)["ret_pct"] > hold_unlevered("v3", el, xl)["ret_pct"] for el, xl in GRID]
        ba = [simulate(v, "tpsl_first_touch", el, xl)["pnl_usd"] > simulate("v3", "tpsl_first_touch", el, xl)["pnl_usd"] for el, xl in GRID]
        robust[v]["beats_v3_hold_share"] = f"{sum(bu)}/{len(bu)}"
        robust[v]["beats_v3_tpsl_share"] = f"{sum(ba)}/{len(ba)}"
    mid = weekly_runs[len(weekly_runs) // 2]
    halves = {}
    for v in VARIANTS:
        halves[v] = dict(h1_hold=hold_unlevered(v, t1=mid), h2_hold=hold_unlevered(v, t0=mid),
                         h1_tpsl=simulate(v, "tpsl_first_touch", t1=mid)["pnl_usd"], h2_tpsl=simulate(v, "tpsl_first_touch", t0=mid)["pnl_usd"])
    bh_h1 = (SNAP[mid]["price"] / SNAP[weekly_runs[0]]["price"] - 1) * 100
    bh_h2 = (SNAP[runs[-1][0]]["price"] / SNAP[mid]["price"] - 1) * 100
    oi_reg_counts = {}
    for t in weekly_runs:
        oi_reg_counts[SNAP[t]["oi_regime"]] = oi_reg_counts.get(SNAP[t]["oi_regime"], 0) + 1
    weekly_rows = []
    for t in weekly_runs:
        s = SNAP[t]
        weekly_rows.append({k: (round(s[k], 4) if isinstance(s[k], float) else s[k]) for k in
                            ["date", "price", "macro", "crypto", "tech", "tech_corr", "oi_regime", "basis", "funding_ann", "carry_spread",
                             "oi_chg", "fr", "tips10", "vix", "mvrv", "etf_4w", "cot_pct", "skew", "skew_pct", "iv_term", "dvol",
                             "stab_nf30", "stables_score", "opt_spec", "opt_contrarian", "opt_trend"] + VARIANTS})
    out = dict(
        version="v4-backtest-2 (full data)", generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        period=dict(start=dstr(weekly_runs[0]), end=dstr(runs[-1][0]), weeks=len(weekly_runs), cutoff_date=dstr(runs[-1][0])),
        buy_hold_pct=round(bh, 2), oi_regime_weeks=oi_reg_counts, funding_sources=FUND_SRC, funding_binance_gap=FUND_GAP,
        results={v: {k: (val if k not in ("tpsl_first_touch", "tpsl_prod_priority", "hold_momentum") else val) for k, val in r.items()} for v, r in results.items()},
        weekly=weekly_rows, robustness_grid=dict(grid=GRID, results=robust),
        split_halves=dict(mid=dstr(mid), bh_h1=round(bh_h1, 2), bh_h2=round(bh_h2, 2), results=halves),
    )
    print("GRID", len(GRID))
    for v in VARIANTS: print(f"{v:20s}", robust[v])
    print("halves mid", dstr(mid), "bh", round(bh_h1, 1), round(bh_h2, 1))
    for v in VARIANTS: print(f"{v:20s}", halves[v])
    for v in ("v3", "v4"): print(v, results[v]["forward_by_regime"], results[v]["composite_dist"])
    json.dump(out, open(OUT, "w"), indent=1, default=float)
    print("period", out["period"], "B&H", round(bh, 2), "oi_regime", oi_reg_counts)
    for v in VARIANTS:
        r = results[v]
        a, b, c, u = r["tpsl_first_touch"], r["tpsl_prod_priority"], r["hold_momentum"], r["hold_unlevered"]
        print(f"{v:20s} A: n={a['trades']:2d} wr={a['win_rate']} pnl={a['pnl_usd']:8.2f} dd={a['max_dd_pct_deposit']} moves={a['sum_move_pct']} {a['reasons']} | "
              f"P: n={b['trades']} wr={b['win_rate']} pnl={b['pnl_usd']:.2f} | B: n={c['trades']} wr={c['win_rate']} pnl={c['pnl_usd']:.2f} dd={c['max_dd_pct_deposit']} | "
              f"U: {u} | diff={r['weeks_regime_diff_vs_v3']} corr={r['corr_with_v3']} fcorr={r['corr_composite_fwd4w']}")
