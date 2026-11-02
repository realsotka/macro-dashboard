"""
v4 Shadow data blocks — Options (Deribit) + Stablecoins (DefiLlama).

Standalone, side-effect-free fetch/scoring functions used by:
  - the daily cron (writes into state.json under "v4_shadow")
  - the 104-week backtest script (backtest_v4.py)

Design constraints (per v4 Shadow spec):
  - No paid APIs. Only Deribit public + DefiLlama public.
  - Each fetch function is isolated with try/except, 10s timeout, retries.
  - Raw responses are cacheable by caller (6h cache) — this module does not
    cache itself, callers decide.
  - Block A (CME futures basis/carry) is NOT implemented — no free/keyless
    CME source exists in this pipeline. Always returns status="not_implemented".
"""
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

UA = "macro-dashboard stassoroka0@gmail.com"
TIMEOUT_S = 10
MAX_RETRIES = 2


def _get(url, headers=None):
    """GET with retries + exponential backoff. Raises on final failure."""
    hdrs = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return json.loads(r.read())
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)  # 1s, 2s
    raise last_err


# ─────────────────────────────────────────────────────────────────────────
# BLOCK A — Basis/Carry (CME futures) — NOT IMPLEMENTED
# ─────────────────────────────────────────────────────────────────────────
def fetch_block_a():
    """Always returns not_implemented — no free/keyless CME data source
    is available in this pipeline. Flagged explicitly per user decision."""
    return {"status": "not_implemented", "reason": "no free/keyless CME futures basis source available"}


# ─────────────────────────────────────────────────────────────────────────
# BLOCK B — Options (Deribit public API, no key required)
# ─────────────────────────────────────────────────────────────────────────
def fetch_deribit_instruments(currency="BTC"):
    d = _get(f"https://www.deribit.com/api/v2/public/get_instruments?currency={currency}&kind=option&expired=false")
    return d["result"]


def fetch_deribit_index(currency="BTC"):
    idx = "btc_usd" if currency == "BTC" else "eth_usd"
    d = _get(f"https://www.deribit.com/api/v2/public/get_index_price?index_name={idx}")
    return d["result"]["index_price"]


def fetch_deribit_dvol(currency="BTC"):
    """Latest DVOL (Deribit volatility index) close, used as a fallback
    if 25d-skew/term computation fails."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = now_ms - 3 * 86400 * 1000
    d = _get(
        f"https://www.deribit.com/api/v2/public/get_volatility_index_data"
        f"?currency={currency}&start_timestamp={start_ms}&end_timestamp={now_ms}&resolution=3600"
    )
    data = d["result"].get("data", [])
    if not data:
        return None
    # [timestamp, open, high, low, close]
    return round(data[-1][4], 2)


def fetch_deribit_dvol_history(currency="BTC", days=740):
    """Daily DVOL closes over the trailing `days`. Used for the percentile-proxy
    fallback in score_options (Deribit exposes no free historical skew, but
    DOES expose full DVOL history)."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = now_ms - days * 86400 * 1000
    d = _get(
        f"https://www.deribit.com/api/v2/public/get_volatility_index_data"
        f"?currency={currency}&start_timestamp={start_ms}&end_timestamp={now_ms}&resolution=86400"
    )
    data = d["result"].get("data", [])
    return [row[4] for row in data]  # closes only


def _greeks_for_instrument(name):
    d = _get(f"https://www.deribit.com/api/v2/public/get_order_book?instrument_name={name}")
    res = d["result"]
    g = res.get("greeks", {})
    iv = res.get("mark_iv")
    oi = res.get("open_interest")
    if not g or iv is None:
        return None
    return {"name": name, "delta": g.get("delta"), "iv": iv, "open_interest": oi}


def _pick_expiry_near(by_exp_keys, now_ms, target_days):
    target_ms = now_ms + target_days * 86400 * 1000
    return min(by_exp_keys, key=lambda e: abs(e - target_ms))


def fetch_options_block(currency="BTC", max_strikes_per_expiry=24):
    """
    Computes:
      - skew_25d: 25-delta risk reversal (put_iv - call_iv) at ~30d expiry
      - iv_term: ATM IV(30d) - ATM IV(7d)
      - gex_sign: 'positive' | 'negative' | 'unknown' — approximated from
        net dealer gamma proxy: sign of (call_OI - put_OI) weighted near ATM
        (a simplification; true GEX needs dealer positioning data we don't have)
      - dvol: fallback volatility index value

    Returns dict with status "ok" | "partial" | "error".
    """
    out = {
        "skew_25d": None, "iv_term": None, "gex_sign": "unknown", "dvol": None,
        "status": "error", "expiry_30d_used": None, "expiry_7d_used": None,
    }
    try:
        out["dvol"] = fetch_deribit_dvol(currency)
    except Exception as e:
        print(f"DERIBIT_DVOL_FAIL: {e}")

    try:
        spot = fetch_deribit_index(currency)
        insts = fetch_deribit_instruments(currency)
        now_ms = datetime.now(timezone.utc).timestamp() * 1000

        by_exp = {}
        for i in insts:
            by_exp.setdefault(i["expiration_timestamp"], []).append(i)
        exp_keys = list(by_exp.keys())
        if not exp_keys:
            out["status"] = "partial" if out["dvol"] is not None else "error"
            return out

        exp30 = _pick_expiry_near(exp_keys, now_ms, 30)
        exp7 = _pick_expiry_near(exp_keys, now_ms, 7)
        out["expiry_30d_used"] = datetime.fromtimestamp(exp30 / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        out["expiry_7d_used"] = datetime.fromtimestamp(exp7 / 1000, tz=timezone.utc).strftime("%Y-%m-%d")

        def strikes_near_spot(exp_ts, n):
            strikes = by_exp[exp_ts]
            strikes = sorted(strikes, key=lambda s: abs(s["strike"] - spot))
            return strikes[:n]

        strikes30 = strikes_near_spot(exp30, max_strikes_per_expiry)
        greeks30 = []
        for s in strikes30:
            g = _greeks_for_instrument(s["instrument_name"])
            if g:
                g["type"] = s["option_type"]
                g["strike"] = s["strike"]
                greeks30.append(g)

        calls30 = [x for x in greeks30 if x["type"] == "call"]
        puts30 = [x for x in greeks30 if x["type"] == "put"]

        skew_25d = None
        if calls30 and puts30:
            call25 = min(calls30, key=lambda x: abs(x["delta"] - 0.25))
            put25 = min(puts30, key=lambda x: abs(x["delta"] - (-0.25)))
            skew_25d = round(put25["iv"] - call25["iv"], 3)
        out["skew_25d"] = skew_25d

        # ATM IV at 30d
        atm30 = None
        if greeks30:
            atm_candidates = [x for x in greeks30 if x["type"] == "call"]
            if atm_candidates:
                atm30 = min(atm_candidates, key=lambda x: abs(x["delta"] - 0.5))["iv"]

        # ATM IV at 7d (smaller sample — fewer strikes needed near spot)
        atm7 = None
        strikes7 = strikes_near_spot(exp7, min(max_strikes_per_expiry, 16))
        greeks7 = []
        for s in strikes7:
            if s["option_type"] != "call":
                continue
            g = _greeks_for_instrument(s["instrument_name"])
            if g:
                g["strike"] = s["strike"]
                greeks7.append(g)
        if greeks7:
            atm7 = min(greeks7, key=lambda x: abs(x["delta"] - 0.5))["iv"]

        if atm30 is not None and atm7 is not None:
            out["iv_term"] = round(atm30 - atm7, 3)

        # GEX sign proxy: near-ATM OI skew between calls and puts (simplification,
        # NOT true dealer gamma exposure — documented limitation).
        near_calls_oi = sum((x.get("open_interest") or 0) for x in calls30)
        near_puts_oi = sum((x.get("open_interest") or 0) for x in puts30)
        if near_calls_oi or near_puts_oi:
            out["gex_sign"] = "positive" if near_calls_oi >= near_puts_oi else "negative"

        out["status"] = "ok" if skew_25d is not None else ("partial" if out["dvol"] is not None else "error")
    except Exception as e:
        print(f"DERIBIT_OPTIONS_FAIL: {e}")
        out["status"] = "partial" if out["dvol"] is not None else "error"

    return out


# ─────────────────────────────────────────────────────────────────────────
# BLOCK C — Stablecoins (DefiLlama, free, no key)
# ─────────────────────────────────────────────────────────────────────────
STABLECOIN_IDS = {"USDT": "1", "USDC": "2", "PYUSD": "120"}


def fetch_stablecoin_history(coin_id):
    """Returns list of {date (unix s), circulating (float USD)} ascending by date."""
    d = _get(f"https://stablecoins.llama.fi/stablecoin/{coin_id}")
    tokens = d.get("tokens", [])
    out = []
    for t in tokens:
        c = t.get("circulating", {}).get("peggedUSD")
        if c is not None:
            out.append({"date": t["date"], "circulating": c})
    out.sort(key=lambda x: x["date"])
    return out


def fetch_stables_block():
    """
    Computes combined USDT+USDC+PYUSD:
      - stable_supply_total (current)
      - stable_netflow_30d (absolute $ and %)
      - stable_netflow_90d (absolute $)

    Returns dict with status "ok" | "partial" | "error".
    """
    out = {
        "stable_supply_total": None, "stable_netflow_30d": None,
        "stable_netflow_30d_pct": None, "stable_netflow_90d": None,
        "status": "error", "per_coin": {},
    }
    histories = {}
    for sym, cid in STABLECOIN_IDS.items():
        try:
            histories[sym] = fetch_stablecoin_history(cid)
        except Exception as e:
            print(f"DEFILLAMA_{sym}_FAIL: {e}")

    if not histories:
        return out

    now_s = datetime.now(timezone.utc).timestamp()

    def value_at_or_before(hist, target_s):
        candidates = [h for h in hist if h["date"] <= target_s]
        return candidates[-1]["circulating"] if candidates else None

    total_cur = 0.0
    total_30d_ago = 0.0
    total_90d_ago = 0.0
    have_30 = have_90 = have_cur = False

    for sym, hist in histories.items():
        if not hist:
            continue
        cur = hist[-1]["circulating"]
        v30 = value_at_or_before(hist, now_s - 30 * 86400)
        v90 = value_at_or_before(hist, now_s - 90 * 86400)
        out["per_coin"][sym] = {"current": cur, "d30_ago": v30, "d90_ago": v90}
        total_cur += cur
        have_cur = True
        if v30 is not None:
            total_30d_ago += v30
            have_30 = True
        if v90 is not None:
            total_90d_ago += v90
            have_90 = True

    if have_cur:
        out["stable_supply_total"] = round(total_cur, 0)
    if have_cur and have_30 and total_30d_ago > 0:
        out["stable_netflow_30d"] = round(total_cur - total_30d_ago, 0)
        out["stable_netflow_30d_pct"] = round((total_cur / total_30d_ago - 1) * 100, 3)
    if have_cur and have_90 and total_90d_ago > 0:
        out["stable_netflow_90d"] = round(total_cur - total_90d_ago, 0)

    if out["stable_netflow_30d"] is not None:
        out["status"] = "ok"
    elif out["stable_supply_total"] is not None:
        out["status"] = "partial"
    else:
        out["status"] = "error"

    return out


# ─────────────────────────────────────────────────────────────────────────
# SCORING — percentile rank over trailing window (0-100, 50=neutral)
# ─────────────────────────────────────────────────────────────────────────
def percentile_rank(value, history):
    """% of history values <= value. history: list of floats (no None)."""
    hist = [h for h in history if h is not None]
    if not hist or value is None:
        return 50.0
    return round(sum(1 for x in hist if x <= value) / len(hist) * 100, 1)


def score_options(skew_25d, gex_sign, skew_history, dvol=None, dvol_history=None):
    """
    options_score: 0-100, higher = more bullish tilt.

    IMPORTANT: Deribit's public API has no free historical options-chain/skew
    endpoint, so `skew_history` is normally empty (no real history to rank
    against) and percentile_rank degenerates to 50. To keep the live score
    meaningful even without skew history, this falls back to a DVOL-percentile
    proxy (DVOL DOES have full free daily history) when `dvol_history` is
    supplied — the same method used by the 104-week backtest for consistency.
    When real skew history becomes available in the future (accumulated day
    by day from this cron), the skew-based path activates automatically.
    """
    if skew_25d is not None and skew_history:
        # Real skew percentile path (activates once history accumulates)
        pct = percentile_rank(skew_25d, skew_history)
        score = 100 - pct  # invert: low skew percentile (puts cheap) -> high score
    elif dvol is not None and dvol_history:
        # DVOL-percentile proxy fallback (matches backtest methodology)
        pct = percentile_rank(dvol, dvol_history)
        score = 100 - pct  # higher vol percentile -> more fear -> lower score
    else:
        return 50.0

    if gex_sign == "negative":
        score -= 5
    elif gex_sign == "positive":
        score += 2
    return round(max(0, min(100, score)), 1)


def score_stables(netflow_30d_pct, netflow_history_pct):
    """
    stables_score: percentile rank of 30d netflow % over trailing history.
    Positive netflow (stablecoin supply growing = fresh dry powder) → higher score.
    """
    if netflow_30d_pct is None:
        return 50.0
    pct = percentile_rank(netflow_30d_pct, netflow_history_pct)
    return round(pct, 1)


def fetch_stables_netflow_30d_pct_history(weeks=104):
    """Weekly-sampled trailing history of the combined stablecoin 30d netflow %,
    used as the percentile basis for stables_score. Real data (DefiLlama has
    full daily history), computed from the same three coins as fetch_stables_block."""
    histories = {}
    for sym, cid in STABLECOIN_IDS.items():
        try:
            histories[sym] = fetch_stablecoin_history(cid)
        except Exception as e:
            print(f"DEFILLAMA_HIST_{sym}_FAIL: {e}")
    if not histories:
        return []

    now_s = datetime.now(timezone.utc).timestamp()

    def value_at_or_before(hist, target_s):
        candidates = [h for h in hist if h["date"] <= target_s]
        return candidates[-1]["circulating"] if candidates else None

    out = []
    for w in range(weeks, 0, -1):
        as_of = now_s - w * 7 * 86400
        total_cur = total_30 = 0.0
        have_cur = have_30 = False
        for sym, hist in histories.items():
            cur = value_at_or_before(hist, as_of)
            prev30 = value_at_or_before(hist, as_of - 30 * 86400)
            if cur is not None:
                total_cur += cur
                have_cur = True
            if prev30 is not None:
                total_30 += prev30
                have_30 = True
        if have_cur and have_30 and total_30 > 0:
            out.append(round((total_cur / total_30 - 1) * 100, 3))
    return out


def build_v4_shadow_state():
    """Top-level entry point for the daily cron. Fetches Block B + C, scores
    them, and returns the full `v4_shadow` dict to merge into state.json.
    Never raises — on any failure the affected sub-block reports its own
    status and the rest of the pipeline (main state.json write) is unaffected."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    block_a = fetch_block_a()

    options = fetch_options_block()
    try:
        dvol_hist = fetch_deribit_dvol_history()
    except Exception as e:
        print(f"DVOL_HISTORY_FAIL: {e}")
        dvol_hist = []
    options_score = score_options(
        options.get("skew_25d"), options.get("gex_sign"), [],
        dvol=options.get("dvol"), dvol_history=dvol_hist,
    )

    stables = fetch_stables_block()
    try:
        netflow_hist = fetch_stables_netflow_30d_pct_history()
    except Exception as e:
        print(f"STABLES_HISTORY_FAIL: {e}")
        netflow_hist = []
    stables_score = score_stables(stables.get("stable_netflow_30d_pct"), netflow_hist)

    return {
        "basis": block_a,
        "options": options,
        "stables": stables,
        "scores": {
            "options_score": options_score,
            "stables_score": stables_score,
            # composite_v3 / composite_v4 / regime_v3 / regime_v4 are filled in
            # by the caller (cron) once it has computed macro/crypto/tech for
            # the day — this module only owns the options+stables sub-scores.
        },
        "updated_at": now_iso,
    }


if __name__ == "__main__":
    print("== Options block ==")
    ob = fetch_options_block()
    print(json.dumps(ob, indent=2))
    print("== Stables block ==")
    sb = fetch_stables_block()
    print(json.dumps(sb, indent=2))
    print("== Full v4_shadow build ==")
    full = build_v4_shadow_state()
    print(json.dumps(full, indent=2))
