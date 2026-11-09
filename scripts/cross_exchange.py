"""Міжбіржові деривативи BTC — фандинг і відкритий інтерес по всьому ринку (інформаційний блок, НЕ входить у composite).

Навіщо: OKX — лише одна біржа. Фандинг окремої біржі шумний (кореляція з OKX щодня ≈ 0.4),
а середнє по ринку збігається з OKX на ≈0.79 щодня / ≈0.88 на 7-денному середньому (90 днів, 2026-08-11…11-08).
Тобто «ринок» — це той самий сигнал, але менш залежний від однієї біржі, а розбіжності (особливо
Hyperliquid vs CEX, кореляція ≈0.33) показують, де саме перекіс.

Джерела без ключів (працюють із середовища кронів): OKX, Bitget, Gate, KuCoin, HTX, BingX,
Kraken Futures, Deribit, Hyperliquid. Binance і Bybit із середовища заблоковані.
Опційно CoinMarketCap (безкоштовний план Basic): додає Binance/Bybit та інші біржі і агреговані
ліквідації лонгів/шортів за 24 год. Ключ НІКОЛИ не зберігається в репозиторії — його підставляє
захищений проксі під час запуску (pplx credentials run ...). Без ключа CMC-частина просто пропускається.

Фандинг нормовано до ставки за 8 год (%). Пороги — загальноприйняті, не калібровані:
  < 0          → «шорти платять»
  0 … 0.01%    → «нейтрально» (0.01%/8 год — базова ставка більшості бірж)
  0.01 … 0.03% → «лонги активні»
  ≥ 0.03%      → «перегрів лонгів»
Запуск: python3 cross_exchange.py  (друкує блок у JSON)
"""
import json, time, datetime as dt, urllib.request

CMC = 'https://pro-api.coinmarketcap.com'
FUND_NEUTRAL, FUND_HOT = 0.01, 0.03  # % за 8 год
HIST_DAYS = 30


def _get(url, data=None, tries=3, timeout=20):
    err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(
                url, data=json.dumps(data).encode() if data is not None else None,
                headers={'User-Agent': 'macro-dashboard', 'Accept': 'application/json',
                         'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception as e:
            err = e
            time.sleep(1.2 * (i + 1))
    raise err


def _f(x):
    try:
        return float(x)
    except Exception:
        return None


# ── окремі біржі: повертають (oi_usd, funding_8h_pct, basis_pct) ─────────────────────────────

def ex_okx():
    oi = _get('https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP')['data'][0]
    fr = _get('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP')['data'][0]
    hours = (int(fr['nextFundingTime']) - int(fr['fundingTime'])) / 3.6e6 or 8
    mk = _get('https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP')['data'][0]
    ix = _get('https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT')['data'][0]
    return float(oi['oiUsd']), float(fr['fundingRate']) * 100 * 8 / hours, (float(mk['markPx']) / float(ix['idxPx']) - 1) * 100


def ex_bitget():
    t = _get('https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES')['data'][0]
    c = _get('https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=USDT-FUTURES')['data'][0]
    hours = _f(c.get('fundingRateInterval')) or 8
    mark, idx = float(t['markPrice']), float(t['indexPrice'])
    return float(t['holdingAmount']) * mark, float(t['fundingRate']) * 100 * 8 / hours, (mark / idx - 1) * 100


def ex_gate():
    t = _get('https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=BTC_USDT')[0]
    c = _get('https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT')
    hours = (_f(c.get('funding_interval')) or 28800) / 3600
    mark, idx = float(t['mark_price']), float(t['index_price'])
    oi = float(t['total_size']) * float(t.get('quanto_multiplier') or c.get('quanto_multiplier')) * mark
    return oi, float(t['funding_rate']) * 100 * 8 / hours, (mark / idx - 1) * 100


def ex_kucoin():
    d = _get('https://api-futures.kucoin.com/api/v1/contracts/XBTUSDTM')['data']
    hours = (_f(d.get('fundingRateGranularity')) or 28800000) / 3.6e6
    mark, idx = float(d['markPrice']), float(d['indexPrice'])
    return float(d['openInterest']) * float(d['multiplier']) * mark, float(d['fundingFeeRate']) * 100 * 8 / hours, (mark / idx - 1) * 100


def ex_htx():
    oi = _get('https://api.hbdm.com/linear-swap-api/v1/swap_open_interest?contract_code=BTC-USDT')['data'][0]
    fr = _get('https://api.hbdm.com/linear-swap-api/v1/swap_funding_rate?contract_code=BTC-USDT')['data']
    return float(oi['value']), float(fr['funding_rate']) * 100, None


def ex_bingx():
    p = _get('https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex?symbol=BTC-USDT')['data']
    oi = _get('https://open-api.bingx.com/openApi/swap/v2/quote/openInterest?symbol=BTC-USDT')['data']
    hours = _f(p.get('fundingIntervalHours')) or 8
    mark, idx = float(p['markPrice']), float(p['indexPrice'])
    return float(oi['openInterest']), float(p['lastFundingRate']) * 100 * 8 / hours, (mark / idx - 1) * 100


def ex_kraken():
    t = _get('https://futures.kraken.com/derivatives/api/v3/tickers/PF_XBTUSD')['ticker']
    mark, idx = float(t['markPrice']), float(t['indexPrice'])
    # relativeFundingRate — погодинна відносна ставка
    return float(t['openInterest']) * mark, float(t['relativeFundingRate']) * 100 * 8, (mark / idx - 1) * 100


def ex_deribit():
    r = _get('https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-PERPETUAL')['result']
    return float(r['open_interest']), float(r['funding_8h']) * 100, (float(r['mark_price']) / float(r['index_price']) - 1) * 100


def ex_hyperliquid():
    meta, ctx = _get('https://api.hyperliquid.xyz/info', {'type': 'metaAndAssetCtxs'})
    c = ctx[[u['name'] for u in meta['universe']].index('BTC')]
    mark, orc = float(c['markPx']), float(c['oraclePx'])
    # funding — погодинна ставка
    return float(c['openInterest']) * mark, float(c['funding']) * 100 * 8, (mark / orc - 1) * 100


EXCHANGES = [('OKX', ex_okx), ('Bitget', ex_bitget), ('Gate', ex_gate), ('KuCoin', ex_kucoin), ('HTX', ex_htx),
             ('BingX', ex_bingx), ('Kraken', ex_kraken), ('Deribit', ex_deribit), ('Hyperliquid', ex_hyperliquid)]
DEX = {'Hyperliquid'}


# ── CoinMarketCap (опційно, лише з ключем через проксі) ─────────────────────────────────────

def cmc_block(known):
    """Біржі, яких немає серед прямих джерел (Binance, Bybit…), + ліквідації. None — якщо ключа немає/помилка."""
    try:
        d = _get(f'{CMC}/v5/cryptocurrency/derivatives/market-pairs/list/latest?crypto_id=1&category=perpetual'
                 f'&center_type=cex&limit=250&sort=cmc_rank_advanced', tries=1)
    except Exception as e:
        return {'status': 'CMC: немає ключа' if '401' in str(e) or '403' in str(e) else f'CMC: {str(e)[:80]}'}
    extra = {}
    for p in (d.get('data') or {}).get('market_pairs') or []:
        name = ((p.get('exchange') or {}).get('exchange_name') or '').strip()
        if not name or any(name.lower().startswith(k.lower()) for k in known):
            continue
        q = (p.get('quotes') or [{}])[0]
        rq = (p.get('exchange_reported_quotes') or [{}])[0]
        oi, fr = _f(q.get('open_interest')), _f(rq.get('funding_rate'))
        if not oi or oi <= 0:
            continue
        e = extra.setdefault(name, {'oi': 0.0, 'fw': 0.0, 'fo': 0.0})
        e['oi'] += oi
        if fr is not None:
            e['fw'] += fr * 100 * oi
            e['fo'] += oi
    out = {'status': 'ok', 'extra': [
        {'ex': k, 'oi_usd': v['oi'], 'funding_8h': (v['fw'] / v['fo']) if v['fo'] else None, 'basis': None, 'src': 'CMC'}
        for k, v in sorted(extra.items(), key=lambda kv: -kv[1]['oi'])[:8]]}
    try:
        q = _get(f'{CMC}/v5/derivatives/liquidations/quotes/latest', tries=1)['data']['quotes'][0]
        out['liq'] = {'long_24h': _f(q.get('long_liquidations_24h')), 'short_24h': _f(q.get('short_liquidations_24h')),
                      'total_24h': _f(q.get('total_liquidations_24h'))}
    except Exception:
        pass
    return out


# ── блок ─────────────────────────────────────────────────────────────────────────────────

def label_for(f):
    if f is None:
        return None
    if f < 0:
        return 'шорти платять'
    if f < FUND_NEUTRAL:
        return 'нейтрально'
    if f < FUND_HOT:
        return 'лонги активні'
    return 'перегрів лонгів'


def xex_block(prev=None, use_cmc=True):
    """Ніколи не кидає виняток. prev — поточний state.json (для зміни OI та 30-денної історії)."""
    prev = prev or {}
    today = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d')
    rows, failed = [], []
    for name, fn in EXCHANGES:
        try:
            oi, fr, basis = fn()
            if not oi or oi <= 0:
                raise ValueError('no OI')
            rows.append({'ex': name, 'oi_usd': oi, 'funding_8h': fr, 'basis': basis, 'src': 'API'})
        except Exception:
            failed.append(name)
    if len(rows) < 3:
        return {'xex_status': f'error: лише {len(rows)} бірж відповіли', 'xex_date': today}

    cmc = cmc_block([r['ex'] for r in rows]) if use_cmc else None
    if cmc and cmc.get('extra'):
        rows += cmc['extra']
    rows.sort(key=lambda r: -r['oi_usd'])

    total = sum(r['oi_usd'] for r in rows)
    fr_rows = [r for r in rows if r['funding_8h'] is not None]
    fo = sum(r['oi_usd'] for r in fr_rows)
    f_oiw = sum(r['funding_8h'] * r['oi_usd'] for r in fr_rows) / fo
    b_rows = [r for r in rows if r['basis'] is not None]
    b_oiw = sum(r['basis'] * r['oi_usd'] for r in b_rows) / sum(r['oi_usd'] for r in b_rows) if b_rows else None
    cex = [r for r in fr_rows if r['ex'] not in DEX]
    cex_f = sum(r['funding_8h'] * r['oi_usd'] for r in cex) / sum(r['oi_usd'] for r in cex) if cex else None
    hl = next((r for r in rows if r['ex'] == 'Hyperliquid'), None)
    okx = next((r for r in rows if r['ex'] == 'OKX'), None)

    # зміна OI за добу — лише по біржах, присутніх в обидва дні (щоб склад бірж не спотворював)
    prev_by = {r['ex']: r['oi_usd'] for r in (prev.get('xex_exchanges') or []) if r.get('oi_usd')}
    common = [r for r in rows if r['ex'] in prev_by]
    oi_chg = None
    if prev.get('xex_date') and prev['xex_date'] != today and len(common) >= 3:
        oi_chg = (sum(r['oi_usd'] for r in common) / sum(prev_by[r['ex']] for r in common) - 1) * 100

    hist = [h for h in (prev.get('xex_hist') or []) if h.get('date') != today]
    hist.append({'date': today, 'oi_usd': round(total), 'funding_8h': round(f_oiw, 5),
                 'okx_funding_8h': round(okx['funding_8h'], 5) if okx else None})
    hist = hist[-HIST_DAYS:]
    f7 = [h['funding_8h'] for h in hist[-7:] if h.get('funding_8h') is not None]

    src = 'CMC + ' if cmc and cmc.get('extra') else ''
    out = {
        'xex_date': today,
        'xex_status': 'ok' + (f"; без відповіді: {', '.join(failed)}" if failed else '') +
                      (f"; {cmc['status']}" if cmc and cmc.get('status') != 'ok' else ''),
        'xex_source': src + f"{len(rows) - (len(cmc['extra']) if src else 0)} бірж напряму",
        'xex_n_ex': len(rows),
        'xex_oi_total_usd': round(total),
        'xex_oi_chg_24h_pct': round(oi_chg, 2) if oi_chg is not None else None,
        'xex_okx_oi_share_pct': round(okx['oi_usd'] / total * 100, 1) if okx else None,
        'xex_funding_oiw_8h': round(f_oiw, 5),
        'xex_funding_7d_8h': round(sum(f7) / len(f7), 5) if f7 else None,
        'xex_funding_okx_8h': round(okx['funding_8h'], 5) if okx else None,
        'xex_funding_cex_8h': round(cex_f, 5) if cex_f is not None else None,
        'xex_funding_hl_8h': round(hl['funding_8h'], 5) if hl else None,
        'xex_funding_min_8h': round(min(r['funding_8h'] for r in fr_rows), 5),
        'xex_funding_max_8h': round(max(r['funding_8h'] for r in fr_rows), 5),
        'xex_funding_pos_n': sum(1 for r in fr_rows if r['funding_8h'] > 0),
        'xex_funding_n': len(fr_rows),
        'xex_basis_oiw_pct': round(b_oiw, 4) if b_oiw is not None else None,
        'xex_label': label_for(f_oiw),
        'xex_exchanges': [{'ex': r['ex'], 'oi_usd': round(r['oi_usd']),
                           'funding_8h': round(r['funding_8h'], 5) if r['funding_8h'] is not None else None,
                           'basis': round(r['basis'], 4) if r['basis'] is not None else None, 'src': r['src']}
                          for r in rows],
        'xex_hist': hist,
    }
    liq = (cmc or {}).get('liq')
    if liq and liq.get('total_24h'):
        out.update({'xex_liq_long_24h': round(liq['long_24h'] or 0), 'xex_liq_short_24h': round(liq['short_24h'] or 0),
                    'xex_liq_total_24h': round(liq['total_24h']),
                    'xex_liq_long_share_pct': round((liq['long_24h'] or 0) / liq['total_24h'] * 100, 1)})
    return out


if __name__ == '__main__':
    import sys
    prev = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {}
    print(json.dumps(xex_block(prev), ensure_ascii=False, indent=1))
