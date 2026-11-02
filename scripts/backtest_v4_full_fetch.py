"""
Full-data fetcher for the v4 backtest (2nd iteration).

Closes the data gaps of the first backtest:
  - real TIPS 10y history (US Treasury real yield curve — the source of FRED DFII10)
  - full perp funding history (Deribit BTC-PERPETUAL; OKX only keeps ~3 months)
  - OKX OI history (1D + 1W, paged with `end`)
  - CME BTC front-month (Yahoo BTC=F) -> basis_cme_ann (Block A)
  - REAL historical 25d skew + iv_term reconstructed from Deribit historical option
    trades (history.deribit.com, free) via Black-Scholes delta
  - BTC 1H candles (OKX) for intraday TP/SL simulation

Only free, keyless sources. Output: scripts/raw_backtest_full.json
"""
import json, time, math, csv, io, re, urllib.request, sys
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

OUT = "/home/user/workspace/macro-dashboard/scripts/raw_backtest_full.json"
UA = {"User-Agent": "Mozilla/5.0 macro-dashboard stassoroka0@gmail.com", "Accept": "*/*"}


def get(url, timeout=25, raw=False, retries=3):
    last = None
    for a in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            return b.decode("utf-8", "ignore") if raw else json.loads(b)
        except Exception as e:
            last = e
            time.sleep(1.5 * (2 ** a))
    raise last


def ms(dt):
    return int(dt.timestamp() * 1000)


def dstr(ts_ms):
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


NOW = datetime.now(timezone.utc)


# ── OKX candles (weekly + 1H) ─────────────────────────────────────────────
def okx_candles(bar, since_ms):
    out, after = {}, None
    while True:
        u = f"https://www.okx.com/api/v5/market/history-candles?instId=BTC-USDT-SWAP&bar={bar}&limit=100"
        if after:
            u += f"&after={after}"
        d = get(u)["data"]
        if not d:
            break
        for c in d:
            out[int(c[0])] = [int(c[0]), float(c[1]), float(c[2]), float(c[3]), float(c[4]), c[8] if len(c) > 8 else "1"]
        after = d[-1][0]
        if int(after) < since_ms:
            break
        time.sleep(0.11)
    return [out[k] for k in sorted(out)]


# ── Funding: Deribit perpetual (hourly records, interest_8h) ──────────────
def deribit_funding(since):
    out = {}
    t = since
    while t < NOW:
        t2 = min(t + timedelta(days=20), NOW)
        d = get(f"https://www.deribit.com/api/v2/public/get_funding_rate_history?instrument_name=BTC-PERPETUAL"
                f"&start_timestamp={ms(t)}&end_timestamp={ms(t2)}")["result"]
        for r in d:
            out[r["timestamp"]] = {"ts": r["timestamp"], "i8h": r["interest_8h"], "i1h": r["interest_1h"]}
        t = t2
        time.sleep(0.15)
    return [out[k] for k in sorted(out)]


def okx_funding_recent():
    out, after = {}, None
    for _ in range(10):
        u = "https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100"
        if after:
            u += f"&after={after}"
        d = get(u)["data"]
        if not d:
            break
        for r in d:
            out[int(r["fundingTime"])] = float(r["fundingRate"])
        after = d[-1]["fundingTime"]
        time.sleep(0.2)
    return [{"ts": k, "rate": out[k]} for k in sorted(out)]


# ── OKX OI history ────────────────────────────────────────────────────────
def okx_oi(period):
    out, end = {}, None
    for _ in range(40):
        u = f"https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period={period}&limit=100"
        if end:
            u += f"&end={end}"
        d = get(u)["data"]
        if not d:
            break
        new = 0
        for r in d:
            if int(r[0]) not in out:
                new += 1
            out[int(r[0])] = {"ts": int(r[0]), "oi": float(r[1]), "oi_ccy": float(r[2]), "oi_usd": float(r[3])}
        if not new:
            break
        end = d[-1][0]
        time.sleep(0.25)
    return [out[k] for k in sorted(out)]


# ── TIPS 10y real yield (US Treasury real yield curve = DFII10 source) ────
def treasury_real_10y(years):
    out = {}
    for y in years:
        u = (f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{y}/all"
             f"?type=daily_treasury_real_yield_curve&field_tdr_date_value={y}&page&_format=csv")
        txt = get(u, raw=True)
        for row in csv.DictReader(io.StringIO(txt)):
            try:
                dt = datetime.strptime(row["Date"], "%m/%d/%Y").strftime("%Y-%m-%d")
                out[dt] = float(row["10 YR"])
            except Exception:
                pass
    return [{"date": k, "tips10": out[k]} for k in sorted(out)]


# ── Yahoo daily (VIX, BTC=F) ──────────────────────────────────────────────
def yahoo_daily(sym, start):
    u = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(sym)}"
         f"?period1={int(start.timestamp())}&period2={int(NOW.timestamp())}&interval=1d")
    res = get(u)["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    out = []
    for t, c in zip(res["timestamp"], q["close"]):
        if c is not None:
            out.append({"ts": t * 1000, "date": dstr(t * 1000), "close": c})
    return out


# ── MVRV (Coin Metrics community) ─────────────────────────────────────────
def mvrv(start):
    out, url = [], (f"https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur"
                    f"&frequency=1d&start_time={start:%Y-%m-%d}&page_size=10000")
    while url:
        d = get(url)
        for r in d["data"]:
            if r.get("CapMVRVCur"):
                out.append({"date": r["time"][:10], "mvrv": float(r["CapMVRVCur"])})
        url = d.get("next_page_url")
    return out


# ── COT (CFTC, leveraged funds) ───────────────────────────────────────────
def cot():
    u = ("https://publicreporting.cftc.gov/resource/gpe5-46if.json"
         "?market_and_exchange_names=BITCOIN%20-%20CHICAGO%20MERCANTILE%20EXCHANGE"
         "&$order=report_date_as_yyyy_mm_dd%20ASC&$limit=1000")
    out = []
    for r in get(u):
        out.append({"date": r["report_date_as_yyyy_mm_dd"][:10],
                    "net_lev": float(r.get("lev_money_positions_long", 0) or 0) - float(r.get("lev_money_positions_short", 0) or 0)})
    return out


# ── ETF flows (Farside, all data) ─────────────────────────────────────────
def farside():
    req = urllib.request.Request("https://farside.co.uk/bitcoin-etf-flow-all-data/", headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        "Accept": "text/html", "Referer": "https://www.google.com/"})
    try:
        html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    except Exception:
        from curl_cffi import requests as cr
        html = cr.get("https://farside.co.uk/bitcoin-etf-flow-all-data/", impersonate="chrome", timeout=30).text
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL):
        cells = [re.sub(r"\((\d[\d,]*\.?\d*)\)", r"-\1", re.sub(r"<[^>]+>", "", c).strip())
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)]
        if not cells or not re.match(r"\d{1,2}\s+\w{3}\s+\d{4}", cells[0]):
            continue
        tot = cells[-1].replace(",", "").strip()
        try:
            v = 0.0 if tot in ("-", "") else float(tot)
            out.append({"date": datetime.strptime(cells[0], "%d %b %Y").strftime("%Y-%m-%d"), "flow_m": v})
        except ValueError:
            pass
    return out


# ── Stablecoins (DefiLlama) ───────────────────────────────────────────────
def stables():
    out = {}
    for sym, cid in {"USDT": 1, "USDC": 2, "PYUSD": 120}.items():
        d = get(f"https://stablecoins.llama.fi/stablecoin/{cid}")
        rows = []
        for t in d.get("tokens", []):
            circ = t.get("circulating", {}).get("peggedUSD")
            if circ is not None:
                rows.append({"date": int(t["date"]), "circulating": float(circ)})
        out[sym] = rows
    return out


# ── DVOL daily ────────────────────────────────────────────────────────────
def dvol(start):
    out, t = {}, start
    while t < NOW:
        t2 = min(t + timedelta(days=900), NOW)
        d = get(f"https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC"
                f"&start_timestamp={ms(t)}&end_timestamp={ms(t2)}&resolution=86400")["result"]["data"]
        for r in d:
            out[r[0]] = r[4]
        t = t2
    return [{"ts": k, "dvol": out[k]} for k in sorted(out)]


# ── Options: daily skew / iv_term from historical trades ──────────────────
MON = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}


def parse_inst(name):
    # BTC-29MAR24-15000-P
    _, exp, k, cp = name.split("-")
    m = re.match(r"(\d{1,2})([A-Z]{3})(\d{2})", exp)
    dt = datetime(2000 + int(m.group(3)), MON[m.group(2)], int(m.group(1)), 8, 0, tzinfo=timezone.utc)
    return ms(dt), float(k), cp


def ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def bs_delta(S, K, T, sig, cp):
    if T <= 0 or sig <= 0:
        return None
    d1 = (math.log(S / K) + 0.5 * sig * sig * T) / (sig * math.sqrt(T))
    return ncdf(d1) if cp == "C" else ncdf(d1) - 1


def wmedian(pairs):
    pairs = sorted(pairs)
    tot = sum(w for _, w in pairs)
    acc = 0
    for v, w in pairs:
        acc += w
        if acc >= tot / 2:
            return v
    return None


def surface_metrics(trades, T0):
    """trades -> dict(skew_25d=call25-put25 @~30d, atm30, atm7, iv_term=atm30-atm7)."""
    pts = []
    for t in trades:
        try:
            exp, K, cp = parse_inst(t["instrument_name"])
        except Exception:
            continue
        Td = (exp - t["timestamp"]) / 86400000
        iv = t.get("iv")
        S = t.get("index_price")
        if not iv or not S or Td <= 0.5:
            continue
        dl = bs_delta(S, K, Td / 365, iv / 100, cp)
        if dl is None:
            continue
        pts.append((Td, dl, iv, cp, float(t.get("amount") or 1)))

    def band(tlo, thi, dlo, dhi, cp=None):
        return [(iv, w) for Td, dl, iv, c, w in pts if tlo <= Td <= thi and dlo <= dl <= dhi and (cp is None or c == cp)]

    res = {"n_trades": len(pts)}
    # 30d bucket: 20-45 days; fallback 14-60
    for lo, hi in ((20, 45), (14, 60)):
        c25 = band(lo, hi, 0.17, 0.33, "C")
        p25 = band(lo, hi, -0.33, -0.17, "P")
        if len(c25) >= 3 and len(p25) >= 3:
            res["call25_30d"] = round(wmedian(c25), 2)
            res["put25_30d"] = round(wmedian(p25), 2)
            res["skew_25d"] = round(res["call25_30d"] - res["put25_30d"], 2)
            res["n_c25"], res["n_p25"], res["bucket30"] = len(c25), len(p25), f"{lo}-{hi}"
            break
    for lo, hi in ((20, 45), (14, 60)):
        a = band(lo, hi, 0.40, 0.60, "C") + band(lo, hi, -0.60, -0.40, "P")
        if len(a) >= 3:
            res["atm30"] = round(wmedian(a), 2)
            break
    for lo, hi in ((4, 11), (2, 14)):
        a = band(lo, hi, 0.40, 0.60, "C") + band(lo, hi, -0.60, -0.40, "P")
        if len(a) >= 3:
            res["atm7"] = round(wmedian(a), 2)
            break
    if "atm30" in res and "atm7" in res:
        res["iv_term"] = round(res["atm30"] - res["atm7"], 2)
    return res


def options_day(day):
    T = ms(day)
    try:
        d = get(f"https://history.deribit.com/api/v2/public/get_last_trades_by_currency_and_time?currency=BTC&kind=option"
                f"&start_timestamp={T - 6 * 3600000}&end_timestamp={T}&count=1000&sorting=desc&include_old=true", timeout=30)
        trades = d["result"]["trades"]
        r = surface_metrics(trades, T)
    except Exception as e:
        r = {"error": str(e)[:120]}
    r["date"] = day.strftime("%Y-%m-%d")
    return r


def options_history(start):
    days = []
    d = start
    while d <= NOW:
        days.append(d)
        d += timedelta(days=1)
    out = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, r in enumerate(ex.map(options_day, days)):
            out.append(r)
            if i % 200 == 0:
                print("  options", r["date"], {k: r.get(k) for k in ("skew_25d", "iv_term", "n_trades")}, flush=True)
    return out


if __name__ == "__main__":
    only = sys.argv[1:]
    try:
        RAW = json.load(open(OUT))
    except Exception:
        RAW = {}
    jobs = {
        "btc_1w": lambda: okx_candles("1W", ms(datetime(2021, 1, 1, tzinfo=timezone.utc))),
        "btc_1h": lambda: okx_candles("1H", ms(datetime(2023, 12, 25, tzinfo=timezone.utc))),
        "funding_deribit": lambda: deribit_funding(datetime(2023, 10, 1, tzinfo=timezone.utc)),
        "funding_okx_recent": okx_funding_recent,
        "oi_1d": lambda: okx_oi("1D"),
        "oi_1w": lambda: okx_oi("1W"),
        "tips10": lambda: treasury_real_10y(range(2021, NOW.year + 1)),
        "vix": lambda: yahoo_daily("^VIX", datetime(2021, 1, 1, tzinfo=timezone.utc)),
        "cme_btc_f": lambda: yahoo_daily("BTC=F", datetime(2023, 10, 1, tzinfo=timezone.utc)),
        "mvrv": lambda: mvrv(datetime(2021, 1, 1)),
        "cot": cot,
        "etf": farside,
        "stables": stables,
        "dvol": lambda: dvol(datetime(2021, 6, 1, tzinfo=timezone.utc)),
        "options_daily": lambda: options_history(datetime(2022, 1, 1, tzinfo=timezone.utc)),
    }
    for k, fn in jobs.items():
        if only and k not in only:
            continue
        t0 = time.time()
        try:
            RAW[k] = fn()
            n = len(RAW[k]) if not isinstance(RAW[k], dict) else {s: len(v) for s, v in RAW[k].items()}
            print(f"{k}: {n} rows ({time.time() - t0:.0f}s)", flush=True)
        except Exception as e:
            print(f"{k}: FAIL {e}", flush=True)
        json.dump(RAW, open(OUT, "w"))
    RAW["fetched_at"] = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(RAW, open(OUT, "w"))
    print("saved", OUT)
