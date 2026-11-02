"""
swing_engine.py — production engine "v4-lite swing" (live since 2026-11-02).

Used by BOTH crons (daily 00:00 UTC, weekly Monday 07:00 UTC). The crons download this
file from the repo and import it:

    gh api repos/realsotka/macro-dashboard/contents/scripts/swing_engine.py \
        -H "Accept: application/vnd.github.raw" > /tmp/swing_engine.py

Formula v4-lite (backtest 2026-11-02, scripts/run_backtest_swing.py):
    composite = Macro*0.20 + Crypto*0.30 + Tech*0.30 + Options*0.12 + Stables*0.08
    Options is fixed at neutral 50 (the options block did not add value in the backtest).
    Stables = percentile (104 weekly samples) of the 30d growth of USDT+USDC+PYUSD supply.

Position management (backtest variant M3 "grid without partial take-profits"):
    entry      : weekly run only. LONG composite>=53 & MVRV<=3.5 & VIX<=30;
                 SHORT composite<40 & MVRV>=1.3 & VIX<=30
    grid       : 40% at market + 20% limit orders at -3/-6/-9% (SHORT: +3/+6/+9%)
    stop       : one stop for the whole position at -12% from the signal price (SHORT +12%)
    sizing     : risk-based — full grid filled + stop hit = -2% of the deposit
    exit       : stop, or regime exit at any daily/weekly run
                 (LONG composite<46; SHORT composite>44 or MVRV<1.0); no take-profits
    limits     : unfilled limits are cancelled 28 days after the entry
    execution  : 1H OKX BTC-USDT-SWAP candles since the last check (fills -> stop, conservative)
    costs      : taker 0.05% (market/stop/regime exit), maker 0.02% (limits),
                 real OKX funding every 8h on the filled quantity
    PnL        : qty x price move - fees - funding (no leverage multiplier)
"""
import json, time, base64, subprocess, urllib.request, bisect
from datetime import datetime, timezone, timedelta, date

ENGINE_VERSION = "swing_v1"
STRATEGY_NAME = "v4-lite swing grid"
REPO = "realsotka/macro-dashboard"
OKX = "https://www.okx.com"
INST = "BTC-USDT-SWAP"
H = 3600_000
D = 86400_000

CFG = dict(
    w_macro=0.20, w_crypto=0.30, w_tech=0.30, w_options=0.12, w_stables=0.08, options_fixed=50.0,
    entry_long=53.0, exit_long=46.0, entry_short=40.0, exit_short=44.0,
    mvrv_long_max=3.5, mvrv_short_min=1.3, mvrv_short_exit=1.0, vix_max=30.0,
    grid=[(0.0, 0.40), (3.0, 0.20), (6.0, 0.20), (9.0, 0.20)],
    stop_pct=12.0, risk_pct=2.0, cancel_days=28, taker=0.0005, maker=0.0002,
)
STABLECOIN_IDS = {"USDT": "1", "USDC": "2", "PYUSD": "120"}


# ───────────────────────── network helpers ─────────────────────────
def _get(url, ua="Mozilla/5.0", tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def gh_read(path):
    r = subprocess.run(["gh", "api", f"repos/{REPO}/contents/{path}"], capture_output=True, text=True, timeout=60)
    j = json.loads(r.stdout)
    return json.loads(base64.b64decode(j["content"]).decode()), j["sha"]


def gh_write(path, obj, message, sha):
    payload = json.dumps({"message": message, "sha": sha,
                          "content": base64.b64encode(json.dumps(obj, ensure_ascii=False, indent=2).encode()).decode()})
    r = subprocess.run(["gh", "api", "-X", "PUT", f"repos/{REPO}/contents/{path}", "--input", "-"],
                       input=payload, capture_output=True, text=True, timeout=60)
    try:
        return json.loads(r.stdout).get("commit", {}).get("sha")
    except Exception:
        return None


def gh_update_state(updates, message):
    """read-modify-write of state.json with retries (only the given keys are touched)."""
    for _ in range(4):
        state, sha = gh_read("public/data/state.json")
        state.update(updates)
        c = gh_write("public/data/state.json", state, message, sha)
        if c:
            return c
        time.sleep(2)
    return None


def okx_price():
    d = _get(f"{OKX}/api/v5/market/ticker?instId={INST}")
    return float(d["data"][0]["last"])


def okx_1h_bars(t0, t1):
    """confirmed 1H bars with t0 <= start and start+1h <= t1, ascending: [ts, o, h, l, c]."""
    out = {}
    cursor = None
    for _ in range(60):
        url = f"{OKX}/api/v5/market/history-candles?instId={INST}&bar=1H&limit=100"
        if cursor:
            url += f"&after={cursor}"
        data = _get(url).get("data", [])
        if not data:
            break
        for c in data:
            ts = int(c[0])
            if ts >= t0 and ts + H <= t1 and str(c[8] if len(c) > 8 else "1") == "1":
                out[ts] = [ts, float(c[1]), float(c[2]), float(c[3]), float(c[4])]
        oldest = min(int(c[0]) for c in data)
        if oldest <= t0:
            break
        cursor = oldest
    return [out[k] for k in sorted(out)]


def okx_funding(t0, t1):
    """[(fundingTime_ms, rate_fraction)] with t0 < ts <= t1."""
    out = {}
    cursor = None
    for _ in range(20):
        url = f"{OKX}/api/v5/public/funding-rate-history?instId={INST}&limit=100"
        if cursor:
            url += f"&after={cursor}"
        data = _get(url).get("data", [])
        if not data:
            break
        for r in data:
            ts = int(r["fundingTime"])
            if t0 < ts <= t1:
                out[ts] = float(r.get("realizedRate") or r["fundingRate"])
        oldest = min(int(r["fundingTime"]) for r in data)
        if oldest <= t0:
            break
        cursor = oldest
    return sorted(out.items())


# ───────────────────────── stablecoins block ─────────────────────────
def _stable_hist(cid):
    d = _get(f"https://stablecoins.llama.fi/stablecoin/{cid}", ua="macro-dashboard stassoroka0@gmail.com")
    return [(t["date"], t["circulating"]["peggedUSD"]) for t in d.get("tokens", [])
            if t.get("circulating", {}).get("peggedUSD") is not None]


def stables_from_histories(histories, today):
    """same definition as the backtest (run_backtest_v4_full.stable_nf30 / stables_score)."""
    tot = {}
    for sym, rows in histories.items():
        for ts, v in rows:
            dd = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            tot.setdefault(dd, {})[sym] = v
    keys = sorted(k for k, v in tot.items() if "USDT" in v and "USDC" in v)
    vals = [sum(tot[k].values()) for k in keys]

    def at(dd):
        i = bisect.bisect_right(keys, dd) - 1
        return vals[i] if i >= 0 else None

    def prev(dd, n):
        return (date.fromisoformat(dd) - timedelta(days=n)).isoformat()

    def nf30(dd):
        cur, old = at(dd), at(prev(dd, 30))
        return (cur / old - 1) * 100 if cur and old else None

    t = today.isoformat() if isinstance(today, date) else today
    base = prev(t, 1)
    nf = nf30(base)
    hist = [x for x in (nf30(prev(base, 1 + 7 * k)) for k in range(1, 105)) if x is not None]
    score = round(sum(1 for x in hist if x <= nf) / len(hist) * 100, 1) if (nf is not None and len(hist) >= 20) else None
    cur, old30 = at(base), at(prev(base, 30))
    return dict(stables_score=score, stable_netflow_30d_pct=round(nf, 3) if nf is not None else None,
                stable_supply_total=round(cur, 0) if cur else None,
                stable_netflow_30d=round(cur - old30, 0) if cur and old30 else None,
                history_weeks=len(hist), as_of=base)


def stables_block(state=None, today=None):
    """live stables score; on failure falls back to the last value in state.json (never raises)."""
    today = today or datetime.now(timezone.utc).date()
    try:
        histories = {sym: _stable_hist(cid) for sym, cid in STABLECOIN_IDS.items()}
        b = stables_from_histories(histories, today)
        if b["stables_score"] is None:
            raise ValueError("not enough history")
        b["status"] = "ok"
        return b
    except Exception as e:
        prev = (state or {}).get("stables_score")
        return dict(stables_score=float(prev) if prev is not None else 50.0, status=f"fallback ({e})",
                    stable_netflow_30d_pct=(state or {}).get("stables_nf30_pct"), stable_supply_total=(state or {}).get("stables_supply_total"),
                    stable_netflow_30d=None, history_weeks=0, as_of=None)


# ───────────────────────── composite ─────────────────────────
def regime_of(c):
    return "risk-on" if c >= 65 else "neutral-up" if c >= 53 else "neutral-down" if c >= 38 else "risk-off"


def composite_bundle(macro, crypto, tech, stables_score, mvrv, vix):
    c = round(macro * CFG["w_macro"] + crypto * CFG["w_crypto"] + tech * CFG["w_tech"]
              + CFG["options_fixed"] * CFG["w_options"] + stables_score * CFG["w_stables"], 1)
    c3 = round(macro * 0.25 + crypto * 0.35 + tech * 0.40, 1)
    regime = regime_of(c)
    bias = {"risk-on": "🟢 Risk-On", "neutral-up": "🟡↑ Neutral-Up", "neutral-down": "🟡↓ Neutral-Down", "risk-off": "🔴 Risk-Off"}[regime]
    sig = regime
    if mvrv > 3.5 and c >= 65:
        sig, bias = "FLAT_MVRV_OV", "⛔ FLAT (MVRV OV)"
    elif c < 38 and mvrv < CFG["mvrv_short_min"]:
        sig, bias = "FLAT_MVRV_FILTER", "🔒 FLAT (MVRV Filter)"
    if vix > 30 and sig in ("risk-on", "risk-off"):
        sig, bias = "FLAT_VIX", "⚠️ FLAT (VIX)"
    entry = ("LONG" if (c >= CFG["entry_long"] and mvrv <= CFG["mvrv_long_max"] and vix <= CFG["vix_max"]) else
             "SHORT" if (c < CFG["entry_short"] and mvrv >= CFG["mvrv_short_min"] and vix <= CFG["vix_max"]) else None)
    return dict(composite=c, composite_v3=c3, confidence=min(100, round(abs(c - 50) * 2)), regime=regime, bias=bias,
                trade_signal=sig, entry_signal=entry, stables_score=stables_score)


def state_updates(bundle, stables):
    """keys the crons must write into state.json."""
    return {
        "composite_score": bundle["composite"], "composite_v3": bundle["composite_v3"], "confidence": bundle["confidence"],
        "market_regime": bundle["regime"], "bias_text": bundle["bias"], "trade_signal": bundle["trade_signal"],
        "formula_version": "v4-lite", "strategy": STRATEGY_NAME,
        "stables_score": stables.get("stables_score"), "stables_nf30_pct": stables.get("stable_netflow_30d_pct"),
        "stables_supply_total": stables.get("stable_supply_total"), "stables_netflow_30d": stables.get("stable_netflow_30d"),
        "stables_status": stables.get("status"), "options_score_fixed": CFG["options_fixed"],
        "formula_weights": {k[2:]: v for k, v in CFG.items() if k.startswith("w_")},
    }


# ───────────────────────── position core (pure, no network) ─────────────────────────
def _d(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _fee(q, px, rate):
    return q * px * rate


def new_position(direction, price, t, deposit, composite, regime, pos_id, mvrv=None, vix=None):
    sgn = 1 if direction == "LONG" else -1
    levels = [(price * (1 - sgn * off / 100), fr, off) for off, fr in CFG["grid"]]
    stop = price * (1 - sgn * CFG["stop_pct"] / 100)
    risk_usd = deposit * CFG["risk_pct"] / 100
    Q = risk_usd / sum(fr * abs(px - stop) for px, fr, _ in levels)
    orders = [dict(level=i, offset_pct=-sgn * off, frac=fr, price=round(px, 2), qty=round(Q * fr, 6), status="open", filled_at=None)
              for i, (px, fr, off) in enumerate(levels)]
    pos = dict(engine=ENGINE_VERSION, strategy=STRATEGY_NAME, id=pos_id, status="open", direction=direction,
               opened_at=_d(t), opened_ts=t, signal_price=round(price, 2), composite_score=composite, regime=regime,
               mvrv_open=mvrv, vix_open=vix, risk_pct=CFG["risk_pct"], risk_usd=round(risk_usd, 2), planned_qty=round(Q, 6),
               planned_notional=round(Q * sum(fr * px for px, fr, _ in levels), 2), stop_price=round(stop, 2), stop_pct=CFG["stop_pct"],
               cancel_limits_after=_d(t + CFG["cancel_days"] * D), orders=orders, filled_qty=0.0, entry_price=None, notional=0.0,
               fees_usd=0.0, funding_usd=0.0, leverage=1, size_pct=0.0, last_checked_ts=((t + H - 1) // H) * H, cur_price=round(price, 2), unrealized_usd=0.0,
               deposit_at_open=round(deposit, 2), events=[])
    o = orders[0]                                            # market tranche
    o["price"] = round(price, 2)
    _fill(pos, o, price, t, CFG["taker"])
    pos["note"] = (f"{regime}: composite={composite} → {direction}; 40% по ринку, лімітки 20/20/20% на "
                   f"{'-' if sgn > 0 else '+'}3/6/9%, стоп {round(stop):,} (−12% від сигналу), ризик {CFG['risk_pct']}%")
    return pos


def _fill(pos, o, px, t, fee_rate):
    q = o["qty"]
    f = _fee(q, px, fee_rate)
    tot = pos["filled_qty"] + q
    pos["entry_price"] = round(((pos["entry_price"] or 0) * pos["filled_qty"] + px * q) / tot, 2)
    pos["filled_qty"] = round(tot, 6)
    pos["notional"] = round(pos["filled_qty"] * pos["entry_price"], 2)
    pos["fees_usd"] = round(pos["fees_usd"] + f, 4)
    o["status"] = "filled"; o["filled_at"] = _d(t)
    pos["events"].append(dict(date=_d(t), event=f"fill L{o['level']}", price=round(px, 2), qty=q))


def mtm(pos, price):
    sgn = 1 if pos["direction"] == "LONG" else -1
    gross = sgn * pos["filled_qty"] * (price - (pos["entry_price"] or price))
    return gross - pos["fees_usd"] - pos["funding_usd"]


def replay_bars(pos, bars, funding):
    """advance an open position through 1H bars. Returns ('STOP', px, ts) or None."""
    sgn = 1 if pos["direction"] == "LONG" else -1
    fi = 0
    for b in bars:
        bt, hi, lo, cl = b[0], b[2], b[3], b[4]
        while fi < len(funding) and funding[fi][0] < bt + H:
            if funding[fi][0] > pos["last_checked_ts"] - 1 and pos["filled_qty"] > 0:
                pos["funding_usd"] = round(pos["funding_usd"] + sgn * funding[fi][1] * pos["filled_qty"] * cl, 4)
            fi += 1
        if bt - pos["opened_ts"] > CFG["cancel_days"] * D:
            for o in pos["orders"]:
                if o["status"] == "open":
                    o["status"] = "cancelled"
                    pos["events"].append(dict(date=_d(bt), event=f"cancel L{o['level']} (28d)", price=o["price"], qty=o["qty"]))
        for o in pos["orders"]:
            if o["status"] == "open" and ((sgn > 0 and lo <= o["price"]) or (sgn < 0 and hi >= o["price"])):
                _fill(pos, o, o["price"], bt, CFG["maker"])
        pos["last_checked_ts"] = bt + H
        if (sgn > 0 and lo <= pos["stop_price"]) or (sgn < 0 and hi >= pos["stop_price"]):
            return ("STOP_HIT", pos["stop_price"], bt + H)
    return None


def close_position(trades, pos, reason, px, t, composite):
    sgn = 1 if pos["direction"] == "LONG" else -1
    q = pos["filled_qty"]
    exit_fee = _fee(q, px, CFG["taker"])
    pos["fees_usd"] = round(pos["fees_usd"] + exit_fee, 4)
    gross = sgn * q * (px - pos["entry_price"])
    pnl = round(gross - pos["fees_usd"] - pos["funding_usd"], 2)
    dep0 = float(trades["deposit_current"])
    dep1 = round(dep0 + pnl, 2)
    rec = {
        "id": pos["id"], "strategy": STRATEGY_NAME, "opened_at": pos["opened_at"], "closed_at": _d(t), "direction": pos["direction"],
        "regime": pos.get("regime"), "composite_open": pos.get("composite_score"), "composite_close": composite,
        "entry_price": pos["entry_price"], "exit_price": round(px, 2), "exit_reason": reason,
        "result": {"STOP_HIT": "SL", "REGIME_EXIT": "MOMENTUM", "MVRV_BOTTOM_EXIT": "MOMENTUM"}.get(reason, reason),
        "signal_price": pos["signal_price"], "levels_filled": sum(1 for o in pos["orders"] if o["status"] == "filled"),
        "qty_btc": q, "notional": pos["notional"], "size_pct": round(pos["notional"] / dep0 * 100, 2), "leverage": 1,
        "gross_pnl_usd": round(gross, 2), "fees_usd": round(pos["fees_usd"], 2), "funding_usd": round(pos["funding_usd"], 2),
        "pnl_usd": pnl, "pnl_pct": round(pnl / pos["notional"] * 100, 2) if pos["notional"] else 0.0,
        "pnl_deposit_pct": round(pnl / dep0 * 100, 3), "R": round(pnl / pos["risk_usd"], 2) if pos["risk_usd"] else None,
        "hold_days": round((t - pos["opened_ts"]) / D, 1), "deposit_before": dep0, "deposit_after": dep1,
        "note": f"{reason}: exit={px:,.2f}, avg entry={pos['entry_price']:,.2f}, рівнів={sum(1 for o in pos['orders'] if o['status']=='filled')}/4, composite={composite}",
    }
    trades.setdefault("closed_trades", []).append(rec)
    trades["open_position"] = None
    trades["deposit_current"] = dep1
    trades["total_pnl"] = round(dep1 - trades.get("deposit_initial", 10000), 2)
    ct = trades["closed_trades"]
    trades["win_count"] = sum(1 for x in ct if x.get("pnl_usd", 0) > 0)
    trades["loss_count"] = sum(1 for x in ct if x.get("pnl_usd", 0) <= 0)
    trades["win_rate"] = round(trades["win_count"] / len(ct) * 100, 1)
    trades.setdefault("equity_curve", []).append({"date": _d(t), "equity": dep1, "pnl": pnl,
                                                  "event": f"{pos['id']} {pos['direction']} {reason} @${px:,.2f} {pnl:+.2f}$"})
    return rec


def next_id(trades):
    ids = [int(str(x.get("id", "T0"))[1:]) for x in trades.get("closed_trades", []) if str(x.get("id", "")).startswith("T")]
    return f"T{(max(ids) + 1 if ids else 1):03d}"


def step(trades, mode, now, price, composite, mvrv, vix, regime, bars, funding):
    """one cron run on an in-memory trades dict. Returns (action, changed)."""
    pos = trades.get("open_position")
    actions = []
    if pos and pos.get("engine") != ENGINE_VERSION:          # legacy v3 position — close at market
        entry = float(pos["entry_price"]); sgn = 1 if pos["direction"] == "LONG" else -1
        pnl = round(float(pos["notional"]) * sgn * (price / entry - 1), 2)
        dep1 = round(float(trades["deposit_current"]) + pnl, 2)
        trades["closed_trades"].append({**{k: pos.get(k) for k in ("id", "opened_at", "direction", "regime", "entry_price", "notional")},
                                        "closed_at": _d(now), "exit_price": price, "exit_reason": "STRATEGY_SWITCH", "result": "MANUAL",
                                        "pnl_usd": pnl, "deposit_before": trades["deposit_current"], "deposit_after": dep1,
                                        "note": "закрито при переході на v4-lite swing"})
        trades["deposit_current"] = dep1; trades["open_position"] = None; pos = None
        actions.append("LEGACY_CLOSED")
    regime_closed = False                                    # no same-run re-entry after a regime exit
    if pos:
        hit = replay_bars(pos, bars, funding)
        if hit:
            rec = close_position(trades, pos, hit[0], hit[1], hit[2], composite)
            actions.append(f"CLOSED {rec['id']} {rec['direction']} STOP_HIT @{hit[1]:.0f} pnl={rec['pnl_usd']:+.2f}$")
            pos = None
        else:
            ex = None
            if pos["direction"] == "LONG" and composite < CFG["exit_long"]:
                ex = "REGIME_EXIT"
            elif pos["direction"] == "SHORT" and composite > CFG["exit_short"]:
                ex = "REGIME_EXIT"
            elif pos["direction"] == "SHORT" and mvrv is not None and mvrv < CFG["mvrv_short_exit"]:
                ex = "MVRV_BOTTOM_EXIT"
            if ex:
                rec = close_position(trades, pos, ex, price, now, composite)
                actions.append(f"CLOSED {rec['id']} {rec['direction']} {ex} @{price:.0f} pnl={rec['pnl_usd']:+.2f}$")
                pos = None; regime_closed = True
            else:
                pos["cur_price"] = round(price, 2)
                pos["unrealized_usd"] = round(mtm(pos, price), 2)
                pos["size_pct"] = round(pos["notional"] / float(trades["deposit_current"]) * 100, 2)
                pos["composite_now"] = composite
                filled = sum(1 for o in pos["orders"] if o["status"] == "filled")
                actions.append(f"HOLD {pos['id']} {pos['direction']} levels={filled}/4 avg={pos['entry_price']:.0f} "
                               f"stop={pos['stop_price']:.0f} uPnL={pos['unrealized_usd']:+.2f}$")
    if mode == "weekly" and not regime_closed and trades.get("open_position") is None:
        dr = ("LONG" if (composite >= CFG["entry_long"] and mvrv <= CFG["mvrv_long_max"] and vix <= CFG["vix_max"]) else
              "SHORT" if (composite < CFG["entry_short"] and mvrv >= CFG["mvrv_short_min"] and vix <= CFG["vix_max"]) else None)
        if dr:
            pid = next_id(trades)
            p = new_position(dr, price, now, float(trades["deposit_current"]), composite, regime, pid, mvrv, vix)
            p["size_pct"] = round(p["notional"] / float(trades["deposit_current"]) * 100, 2)
            trades["open_position"] = p
            trades.setdefault("equity_curve", []).append({"date": _d(now), "equity": trades["deposit_current"], "pnl": 0,
                                                          "event": f"{pid} {dr} відкрито @${price:,.0f} (40%, сітка 3 лімітки, стоп ${p['stop_price']:,.0f})"})
            actions.append(f"OPENED {pid} {dr} @{price:.0f} qty={p['filled_qty']} stop={p['stop_price']:.0f} "
                           f"limits={[o['price'] for o in p['orders'][1:]]}")
        else:
            actions.append(f"NO_ENTRY composite={composite} (LONG≥{CFG['entry_long']:.0f} / SHORT<{CFG['entry_short']:.0f}), MVRV={mvrv}, VIX={vix}")
    if not actions:
        actions.append("NO_POSITION (entries only at the weekly run)")
    return " | ".join(actions)


# ───────────────────────── cron entry point ─────────────────────────
def run(mode, composite, mvrv, vix, regime, price=None, dry_run=False):
    """mode: 'daily' | 'weekly'. Reads trades.json, advances the position, pushes. Never raises."""
    try:
        trades, sha = gh_read("public/data/trades.json")
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        price = price or okx_price()
        pos = trades.get("open_position")
        bars, funding = [], []
        if pos and pos.get("engine") == ENGINE_VERSION:
            bars = okx_1h_bars(pos["last_checked_ts"], now)
            funding = okx_funding(pos["last_checked_ts"] - 1, now)
        trades.setdefault("strategy", {"name": STRATEGY_NAME, "since": "2026-11-02", "deposit_at_switch": trades.get("deposit_current"),
                                       "params": {k: v for k, v in CFG.items() if not k.startswith("w_")}})
        action = step(trades, mode, now, price, composite, mvrv, vix, regime, bars, funding)
        trades["last_engine_run"] = {"mode": mode, "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                                     "price": round(price, 2), "composite": composite, "action": action, "bars_processed": len(bars)}
        if not dry_run:
            c = None
            for _ in range(3):
                c = gh_write("public/data/trades.json", trades, f"{mode} swing engine: {action[:120]}", sha)
                if c:
                    break
                time.sleep(2)
                _, sha = gh_read("public/data/trades.json")
            print(f"TRADES_PUSH_SHA={c or 'ERROR'}")
        print(f"TRADE_ACTION={action}")
        return action, trades
    except Exception as e:
        print(f"SWING_ENGINE_FAILED (non-blocking): {e}")
        return f"ENGINE_FAILED: {e}", None


if __name__ == "__main__":
    import sys
    st, _ = gh_read("public/data/state.json")
    s = stables_block(st)
    b = composite_bundle(st["macro_score_adj"], st["crypto_score"], st["tech_score"], s["stables_score"], st.get("mvrv", 1.5), st.get("vix", 20))
    print(json.dumps(dict(stables=s, bundle=b), ensure_ascii=False, indent=1))
    if len(sys.argv) > 1 and sys.argv[1] in ("daily", "weekly"):
        run(sys.argv[1], b["composite"], st.get("mvrv", 1.5), st.get("vix", 20), b["regime"], dry_run="--dry" in sys.argv)
