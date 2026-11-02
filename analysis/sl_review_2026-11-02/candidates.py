import sys, json, statistics
sys.path.insert(0, '/home/user/workspace/macro-dashboard/scripts')
import run_backtest_v4_full as E
mid = E.weekly_runs[len(E.weekly_runs)//2]
C = {'поточна TP3/SL1.5': dict(tp_pct=3, sl_pct=1.5), 'TP3/SL3': dict(tp_pct=3, sl_pct=3), 'TP6/SL4': dict(tp_pct=6, sl_pct=4),
     'без TP, SL1.5': dict(tp_pct=None, sl_pct=1.5), 'без TP, SL2.5': dict(tp_pct=None, sl_pct=2.5), 'без TP, SL4': dict(tp_pct=None, sl_pct=4),
     'без TP, SL=1.5×ATR': dict(tp_pct=None, atr_mult=1.5), 'TP4.5, SL=2×ATR': dict(tp_pct=4.5, atr_mult=2.0)}
out = {}
for v in ('v3', 'v4_rw+stables'):
    out[v] = {}
    for name, kw in C.items():
        r = E.simulate(v, 'tpsl_first_touch', **kw)
        h1 = E.simulate(v, 'tpsl_first_touch', t1=mid, **kw)['pnl_usd']; h2 = E.simulate(v, 'tpsl_first_touch', t0=mid, **kw)['pnl_usd']
        pn = sorted([x['pnl_usd'] for x in r['trade_list']], reverse=True)
        top3 = round(sum(pn[:3]) / r['pnl_usd'] * 100) if r['pnl_usd'] > 0 else None
        live = [x for x in r['trade_list'] if x['opened'] >= '2026-07-27']
        live_s = ' | '.join(f"{x['opened'][5:]}→{x['closed'][5:]} {x['reason']} {x['move_pct']:+.1f}%" for x in live)
        hold = [ (x['t_open'], x) for x in r['trade_list']]
        avg_days = round(statistics.mean((E.datetime.fromisoformat(x['closed']) - E.datetime.fromisoformat(x['opened'])).days for x in r['trade_list']), 1)
        out[v][name] = dict(trades=r['trades'], wr=r['win_rate'], pnl=r['pnl_usd'], dd=r['max_dd_pct_deposit'], h1=h1, h2=h2, top3_share=top3,
                            avg_days=avg_days, live_pnl=round(sum(x['pnl_usd'] for x in live), 1), live=live_s, open=r['open_position'])
        print(v, name, {k: out[v][name][k] for k in ('trades','wr','pnl','dd','h1','h2','top3_share','avg_days','live_pnl')})
        print('    live:', live_s, r['open_position'])
print('mid', E.dstr(mid))
json.dump(out, open('candidates.json', 'w'), indent=1, ensure_ascii=False)
