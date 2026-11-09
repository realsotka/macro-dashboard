"""Coinbase Premium — попит американського споту на BTC (інформаційна метрика, НЕ входить у composite).

premium (%) = Coinbase BTC-USD / (OKX BTC-USDT × USDT-USD) − 1
Поправка на USDT-USD обов'язкова: без неї «премія» ≈ −0.05…−0.15% — це знижка самого USDT, а не попит.

Джерела (безкоштовні, без ключів): api.exchange.coinbase.com (BTC-USD, USDT-USD),
www.okx.com (BTC-USDT spot), запасне для USDT-USD — api.kraken.com. Binance недоступний із середовища кронів.

Калібрування (2026-11-09, погодинно 2025-10-05…2026-11-09, ~395 днів): 7-денне середнє премії (p7)
  ≤ −0.009%  (нижні ~20%)  → «слабкий»: BTC за наступні 7 днів у середньому −1.8% (обидві половини року)
  ≥ +0.003%  (верхні ~20%) → «сильний»: BTC за наступні 7 днів у середньому +1.1…+1.3%
Spearman p7 vs 7-денна дохідність ≈ 0.15 — слабкий, але стабільний сигнал. Запуск: python3 coinbase_premium.py [--calibrate DAYS]
"""
import json, time, datetime as dt, urllib.request

CB = 'https://api.exchange.coinbase.com'
OKX = 'https://www.okx.com'
P7_WEAK, P7_STRONG = -0.009, 0.003
CALIBRATED = '2026-11-09'
# квантилі p7 (5%…95%, крок 5%) з калібрування — для перцентиля поточного значення
P7_QUANTILES = [-0.0166, -0.0129, -0.0106, -0.0087, -0.0077, -0.0067, -0.0059, -0.0051, -0.0043, -0.0032,
                -0.0023, -0.0015, -0.0004, 0.0003, 0.0014, 0.0026, 0.0037, 0.0052, 0.0075]


def _get(url, tries=3):
    err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'macro-dashboard', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except Exception as e:
            err = e
            time.sleep(1.5 * (i + 1))
    raise err


def _iso(t):
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def coinbase_hourly(product, start, end):
    """{hour_ts: close} — Coinbase віддає максимум 300 свічок за запит."""
    out, t = {}, start
    while t < end:
        e = min(t + 300 * 3600, end)
        for r in _get(f'{CB}/products/{product}/candles?granularity=3600&start={_iso(t)}&end={_iso(e)}'):
            out[int(r[0])] = float(r[4])
        t = e
        time.sleep(0.12)
    return out


def okx_hourly(start):
    out, after = {}, ''
    while True:
        d = _get(f'{OKX}/api/v5/market/history-candles?instId=BTC-USDT&bar=1H&limit=100' + (f'&after={after}' if after else ''))['data']
        if not d:
            break
        for r in d:
            out[int(r[0]) // 1000] = float(r[4])
        after = d[-1][0]
        if int(after) // 1000 < start:
            break
        time.sleep(0.11)
    return out


def kraken_usdt_hourly():
    j = _get('https://api.kraken.com/0/public/OHLC?pair=USDTUSD&interval=60')
    rows = next(iter(v for k, v in j['result'].items() if k != 'last'))
    return {int(r[0]): float(r[4]) for r in rows}


def hourly_premium(hours=720):
    """[(hour_ts, premium_pct)] за останні `hours` годин + назва джерела USDT-USD."""
    end = int(time.time()) // 3600 * 3600
    start = end - hours * 3600
    btc = coinbase_hourly('BTC-USD', start, end)
    okx = okx_hourly(start)
    usdt_src = 'Coinbase USDT-USD'
    try:
        usdt = coinbase_hourly('USDT-USD', start, end)
        if len(usdt) < hours * 0.5:
            raise RuntimeError('too few USDT-USD candles')
    except Exception:
        usdt, usdt_src = kraken_usdt_hourly(), 'Kraken USDT-USD'
    rows, last_u = [], None
    for t in sorted(btc):
        u = usdt.get(t, last_u)
        if t in usdt:
            last_u = usdt[t]
        if t < start or t not in okx or not u or not (0.97 < u < 1.03):
            continue
        p = (btc[t] / (okx[t] * u) - 1) * 100
        if abs(p) < 2:                       # відсікаємо биті свічки
            rows.append((t, p))
    return rows, usdt_src


def label_for(p7):
    if p7 is None:
        return None
    if p7 >= P7_STRONG:
        return 'strong'
    if p7 <= P7_WEAK:
        return 'weak'
    return 'neutral'


def percentile_for(p7):
    if p7 is None:
        return None
    below = sum(1 for q in P7_QUANTILES if q < p7)
    return below * 5 if below < len(P7_QUANTILES) else 97


def premium_block(days=30):
    """Ключі cb_premium_* для state.json. Ніколи не кидає виняток: при збої — тільки cb_premium_status."""
    try:
        rows, usdt_src = hourly_premium(days * 24 + 24)
        if len(rows) < 48:
            return {'cb_premium_status': f'error: only {len(rows)} hourly points'}
        last_t = rows[-1][0]
        mean = lambda xs: sum(xs) / len(xs) if xs else None
        h24 = [p for t, p in rows if t > last_t - 24 * 3600]
        h7 = [p for t, p in rows if t > last_t - 168 * 3600]
        p7 = mean(h7)
        daily = {}
        for t, p in rows:
            daily.setdefault(dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime('%Y-%m-%d'), []).append(p)
        hist = [{'d': d, 'v': round(mean(v), 4)} for d, v in sorted(daily.items()) if len(v) >= 12][-days:]
        status = 'ok' if len(h7) >= 140 else f'partial ({len(h7)}/168 h)'
        return {
            'cb_premium_pct': round(rows[-1][1], 4),
            'cb_premium_24h': round(mean(h24), 4),
            'cb_premium_7d': round(p7, 4),
            'cb_premium_pos_hours_7d': sum(1 for p in h7 if p > 0),
            'cb_premium_hours_7d': len(h7),
            'cb_premium_label': label_for(p7),
            'cb_premium_pctile': percentile_for(p7),
            'cb_premium_history': hist,
            'cb_premium_thresholds': {'weak': P7_WEAK, 'strong': P7_STRONG, 'calibrated': CALIBRATED},
            'cb_premium_updated': _iso(last_t),
            'cb_premium_source': f'Coinbase BTC-USD vs OKX BTC-USDT × {usdt_src}',
            'cb_premium_status': status,
        }
    except Exception as e:
        return {'cb_premium_status': f'error: {type(e).__name__}: {e}'[:200]}


def calibrate(days=400):
    """Друкує розподіл p7 і середню дохідність BTC через 3/7/14 днів по зонах (для перекалібрування порогів)."""
    rows, _ = hourly_premium(days * 24)
    daily, close = {}, {}
    btc = coinbase_hourly('BTC-USD', rows[0][0], rows[-1][0] + 3600)
    for t, p in rows:
        d = dt.datetime.fromtimestamp(t, dt.timezone.utc).date()
        daily.setdefault(d, []).append(p)
        close[d] = btc.get(t, close.get(d))
    ds = sorted(daily)
    dm = [sum(daily[d]) / len(daily[d]) for d in ds]
    p7 = [None if i < 6 else sum(dm[i - 6:i + 1]) / 7 for i in range(len(ds))]
    zones = {'weak': [], 'neutral': [], 'strong': []}
    for i, d in enumerate(ds):
        if p7[i] is None or i + 14 >= len(ds):
            continue
        f = {n: (close[ds[i + n]] / close[d] - 1) * 100 for n in (3, 7, 14)}
        zones[label_for(p7[i])].append(f)
    vals = sorted(x for x in p7 if x is not None)
    print('p7 quantiles 5..95%:', [round(vals[int(len(vals) * k / 20)], 4) for k in range(1, 20)])
    for z, fs in zones.items():
        if fs:
            print(z, len(fs), {n: round(sum(f[n] for f in fs) / len(fs), 2) for n in (3, 7, 14)},
                  'hit7', round(sum(1 for f in fs if f[7] > 0) / len(fs), 2))


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == '--calibrate':
        calibrate(int(sys.argv[2]))
    else:
        b = premium_block()
        print(json.dumps({k: v for k, v in b.items() if k != 'cb_premium_history'}, ensure_ascii=False, indent=1))
        print('history days:', len(b.get('cb_premium_history', [])))
