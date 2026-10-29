"""
104-week backtest: Formula v3 (production) vs Formula v4 Shadow (v3 + options
+ stablecoins, Block A / basis-carry skipped).

IMPORTANT DATA LIMITATION (read before trusting any v4 historical row):
  Deribit's public API exposes only CURRENT option order books — there is no
  free historical 25-delta skew / IV-term-structure series. So skew_25d and
  iv_term (the actual Options-block signals) CANNOT be backtested with real
  historical values. What IS available with real history:
    - DVOL (Deribit volatility index): full daily history, 104 weeks covered.
    - Stablecoin supply (DefiLlama): full daily history, 104 weeks covered.
  To keep this backtest honest, options_score in weeks other than the most
  recent one is computed from a DVOL-percentile proxy only (documented as
  such), NOT from a reconstructed skew_25d. This is explicitly flagged in
  output as "options_score_basis": "dvol_proxy" vs "skew_25d" for the single
  live week where real skew was fetched.

Other approximations, all logged in the output JSON's "data_notes":
  - TIPS 10y: FRED (stlouisfed.org) was unreachable from this sandbox at
    run time. A constant proxy (current TIPS_10y value) is used for the
    full window instead of a real historical series. This flattens the
    macro_score's TIPS component historically — macro_score in this backtest
    is therefore LESS accurate than in live production.
  - VIX: real weekly history from Yahoo Finance (up to available range).
  - Funding rate (FR_cur): OKX only retains ~93 days of funding history via
    the public endpoint. Weeks older than that use FR_cur=0 (neutral) rather
    than a fabricated value.
  - Open interest weekly history: OKX gives ~100 weeks (back to Oct 2024),
    not the full 104. Weeks without OI history use oi_chg=0 (neutral).
  - COT: real history back to 2022, full 104-week coverage.
  - BTC price/EMA21/RSI14: real OKX weekly candles, full coverage.
  - ETF flows: real Farside daily history since Jan 2024, full coverage.
  - MVRV: real CoinMetrics daily history, full coverage.

Given these gaps (esp. the options history gap, which is structural — no
free API. This is not a bug), this backtest should be read as a directional
"does adding stablecoin-flow information change outcomes materially"
result plus a live-week-only sanity check of the options block, rather than
a fully faithful 104-week options simulation.
"""
import json
import time
import urllib.request
import statistics
from datetime import datetime, timezone

import v4_shadow as v4

UA = "macro-dashboard stassoroka0@gmail.com"


def get(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def fetch_all(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        print(f"FETCH_FAIL {fn.__name__}: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────
# 1. FETCH ALL HISTORICAL SERIES
# ─────────────────────────────────────────────────────────────────────────
def fetch_btc_weekly(n_weeks=120):
    BASE = "https://www.okx.com"
    d = get(f"{BASE}/api/v5/market/history-candles?instId=BTC-USDT-SWAP&bar=1W&limit={n_weeks}")
    rows = d["data"][::-1]  # oldest -> newest
    out = []
    for r in rows:
        out.append({"ts": int(r[0]), "close": float(r[4]), "high": float(r[2]), "low": float(r[3])})
    return out


def fetch_funding_history(max_days=110):
    BASE = "https://www.okx.com"
    all_rows = []
    after = None
    for _ in range(6):
        url = f"{BASE}/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100"
        if after:
            url += f"&after={after}"
        d = get(url)
        rows = d["data"]
        if not rows:
            break
        all_rows.extend(rows)
        after = rows[-1]["fundingTime"]
        oldest_dt = datetime.fromtimestamp(int(after) / 1000, tz=timezone.utc)
        if (datetime.now(timezone.utc) - oldest_dt).days >= max_days:
            break
        time.sleep(0.1)
    return [{"ts": int(r["fundingTime"]), "rate": float(r["fundingRate"]) * 100} for r in all_rows]


def fetch_oi_history():
    BASE = "https://www.okx.com"
    all_rows = []
    after = None
    for _ in range(12):
        url = f"{BASE}/api/v5/rubik/stat/contracts/open-interest-history?ccy=BTC&period=1W&limit=100&instId=BTC-USDT-SWAP"
        if after:
            url += f"&after={after}"
        d = get(url)
        rows = d.get("data", [])
        if not rows:
            break
        all_rows.extend(rows)
        after = rows[-1][0]
        time.sleep(0.1)
    all_rows.sort(key=lambda r: int(r[0]))
    return [{"ts": int(r[0]), "oi": float(r[1])} for r in all_rows]


def fetch_cot_history():
    url = (
        "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
        "?market_and_exchange_names=BITCOIN%20-%20CHICAGO%20MERCANTILE%20EXCHANGE"
        "&$order=report_date_as_yyyy_mm_dd%20ASC&$limit=200"
    )
    rows = get(url)
    out = []
    for r in rows:
        date = r["report_date_as_yyyy_mm_dd"][:10]
        net_lev = float(r.get("lev_money_positions_long", 0) or 0) - float(r.get("lev_money_positions_short", 0) or 0)
        out.append({"date": date, "net_lev": net_lev})
    return out


def fetch_mvrv_history():
    d = get(
        "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics"
        "?assets=btc&metrics=CapMVRVCur&frequency=1d&page_size=900&start_time=2024-01-01",
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    out = []
    for r in d["data"]:
        try:
            out.append({"date": r["time"][:10], "mvrv": float(r["CapMVRVCur"])})
        except (KeyError, TypeError, ValueError):
            continue
    return out


def fetch_vix_history():
    d = get("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1wk&range=2y")
    res = d["chart"]["result"][0]
    ts = res["timestamp"]
    closes = res["indicators"]["quote"][0]["close"]
    out = []
    for t, c in zip(ts, closes):
        if c is not None:
            out.append({"date": datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d"), "vix": c})
    return out


def fetch_etf_flow_history():
    import re

    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Referer": "https://www.google.com/",
    }
    req = urllib.request.Request("https://farside.co.uk/bitcoin-etf-flow-all-data/", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        html = r.read().decode("utf-8", errors="ignore")
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)
    out = []
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        cells_text = []
        for c in cells:
            text = re.sub(r"<[^>]+>", "", c).strip()
            text = re.sub(r"\((\d+\.?\d*)\)", r"-\1", text)
            cells_text.append(text)
        if not cells_text:
            continue
        if re.match(r"\d{1,2}\s+\w{3}\s+\d{4}", cells_text[0]):
            nums = []
            for c in cells_text[1:]:
                c_clean = c.replace(",", "").strip()
                if c_clean in ("-", "", "n/a"):
                    nums.append(0.0)
                    continue
                try:
                    nums.append(float(c_clean))
                except ValueError:
                    pass
            if nums:
                try:
                    d = datetime.strptime(cells_text[0], "%d %b %Y")
                    out.append({"date": d.strftime("%Y-%m-%d"), "flow_m": nums[-1]})
                except ValueError:
                    pass
    return out


def fetch_stablecoin_histories():
    out = {}
    for sym, cid in v4.STABLECOIN_IDS.items():
        out[sym] = v4.fetch_stablecoin_history(cid)
    return out


def fetch_dvol_history(days=740):
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = now_ms - days * 86400 * 1000
    d = get(
        f"https://www.deribit.com/api/v2/public/get_volatility_index_data"
        f"?currency=BTC&start_timestamp={start_ms}&end_timestamp={now_ms}&resolution=86400"
    )
    data = d["result"].get("data", [])
    return [{"ts": row[0], "dvol": row[4]} for row in data]


if __name__ == "__main__":
    print("Fetching BTC weekly candles...")
    btc = fetch_all(fetch_btc_weekly, 120)
    print(f"  -> {len(btc) if btc else 0} weeks")

    print("Fetching funding history...")
    funding = fetch_all(fetch_funding_history)
    print(f"  -> {len(funding) if funding else 0} points, oldest={datetime.fromtimestamp(funding[-1]['ts']/1000,tz=timezone.utc) if funding else None}")

    print("Fetching OI history...")
    oi = fetch_all(fetch_oi_history)
    print(f"  -> {len(oi) if oi else 0} weeks, oldest={datetime.fromtimestamp(oi[0]['ts']/1000,tz=timezone.utc) if oi else None}")

    print("Fetching COT history...")
    cot = fetch_all(fetch_cot_history)
    print(f"  -> {len(cot) if cot else 0} weeks, oldest={cot[0]['date'] if cot else None}")

    print("Fetching MVRV history...")
    mvrv = fetch_all(fetch_mvrv_history)
    print(f"  -> {len(mvrv) if mvrv else 0} days, oldest={mvrv[0]['date'] if mvrv else None}")

    print("Fetching VIX history...")
    vix = fetch_all(fetch_vix_history)
    print(f"  -> {len(vix) if vix else 0} weeks, oldest={vix[0]['date'] if vix else None}")

    print("Fetching ETF flow history...")
    etf = fetch_all(fetch_etf_flow_history)
    print(f"  -> {len(etf) if etf else 0} days, oldest={etf[0]['date'] if etf else None}")

    print("Fetching stablecoin histories...")
    stables = fetch_all(fetch_stablecoin_histories)
    print(f"  -> {[(k, len(v)) for k, v in stables.items()] if stables else None}")

    print("Fetching DVOL history...")
    dvol = fetch_all(fetch_dvol_history)
    print(f"  -> {len(dvol) if dvol else 0} days, oldest={datetime.fromtimestamp(dvol[0]['ts']/1000,tz=timezone.utc) if dvol else None}")

    raw = {
        "btc": btc, "funding": funding, "oi": oi, "cot": cot, "mvrv": mvrv,
        "vix": vix, "etf": etf, "stables": stables, "dvol": dvol,
    }
    with open("/home/user/workspace/macro-dashboard/scripts/raw_backtest_data.json", "w") as f:
        json.dump(raw, f)
    print("Saved raw data to scripts/raw_backtest_data.json")
