import sys, json, statistics
sys.path.insert(0, '/home/user/workspace/macro-dashboard/scripts')
import run_backtest_v4_full as E
C = json.load(open('candidates.json'))
KW = {'поточна TP3/SL1.5': dict(tp_pct=3, sl_pct=1.5), 'TP3/SL3': dict(tp_pct=3, sl_pct=3), 'TP6/SL4': dict(tp_pct=6, sl_pct=4),
     'без TP, SL1.5': dict(tp_pct=None, sl_pct=1.5), 'без TP, SL2.5': dict(tp_pct=None, sl_pct=2.5), 'без TP, SL4': dict(tp_pct=None, sl_pct=4),
     'без TP, SL=1.5×ATR': dict(tp_pct=None, atr_mult=1.5), 'TP4.5, SL=2×ATR': dict(tp_pct=4.5, atr_mult=2.0)}
res = {}
for v in ('v3', 'v4_rw+stables'):
    res[v] = {}
    for name, kw in KW.items():
        r = E.simulate(v, 'tpsl_first_touch', **kw)
        # equal-risk: every SL loses the same as today (1.5% move); compounding on deposit
        dep = 10000; peak = dep; mdd = 0; R = []
        for x in r['trade_list']:
            k = 1.5 / x['slp']
            pnl = dep * 0.08 * 1.5 * x['move_pct'] / 100 * 1.5 * k
            dep += pnl; peak = max(peak, dep); mdd = min(mdd, dep / peak - 1); R.append(x['move_pct'] / x['slp'])
        res[v][name] = dict(eq_pnl=round(dep - 10000, 1), eq_dd=round(mdd * 100, 2), avg_R=round(statistics.mean(R), 3), sum_R=round(sum(R), 1),
                            avg_sl=round(statistics.mean(x['slp'] for x in r['trade_list']), 2))
        print(v, name, res[v][name])
json.dump(res, open('eqrisk.json', 'w'), indent=1, ensure_ascii=False)
