import sys, json, bisect, statistics
sys.path.insert(0, '/home/user/workspace/macro-dashboard/scripts')
import run_backtest_v4_full as E
H, D = E.H, E.D
def stopped_but_right(trades, days=7):
    n_sl = right = 0; mae = []
    for t in trades:
        if t['reason'] != 'SL': continue
        n_sl += 1
        k0 = bisect.bisect_left(E.h1_ts, t['t_open']); e = t['entry']; lo = 0
        for k in range(k0, min(len(E.h1), k0 + days*24)):
            c = E.h1[k]
            if t['dir'] == 'LONG':
                if c[2] >= e*1.03: right += 1; mae.append(lo); break
                lo = min(lo, c[3]/e-1)
            else:
                if c[3] <= e*0.97: right += 1; mae.append(lo); break
                lo = min(lo, 1-c[2]/e)
    return n_sl, right, mae
out = {}
for v in ('v3', 'v4_rw+stables'):
    base = E.simulate(v, 'tpsl_first_touch')
    n_sl, right, mae = stopped_but_right(base['trade_list'])
    out[v] = dict(baseline=dict(trades=base['trades'], sl=n_sl, sl_but_tp_within_7d=right,
                               mae_before_tp=sorted(round(x*100, 2) for x in mae)), grid=[])
    print(v, 'trades', base['trades'], 'SL', n_sl, 'SL but +3% within 7d', right, 'MAE needed', sorted(round(x*100,1) for x in mae))
    configs = [(tp, sl, None) for tp in (3, 4.5, 6, None) for sl in (1.5, 2, 2.5, 3, 4, 5)] + [(tp, None, m) for tp in (3, 4.5, None) for m in (1.0, 1.5, 2.0)]
    for tp, sl, m in configs:
        r = E.simulate(v, 'tpsl_first_touch', tp_pct=tp, sl_pct=sl or 1.5, atr_mult=m)
        moves = [x['move_pct'] for x in r['trade_list']]
        row = dict(tp=tp, sl=sl, atr=m, trades=r['trades'], win_rate=r['win_rate'], pnl_usd=r['pnl_usd'], dd=r['max_dd_pct_deposit'],
                   sum_move=round(sum(moves), 1), avg_move=round(statistics.mean(moves), 2) if moves else None, reasons=r['reasons'])
        # robustness across entry/exit thresholds
        g = [E.simulate(v, 'tpsl_first_touch', el, xl, tp_pct=tp, sl_pct=sl or 1.5, atr_mult=m)['pnl_usd'] for el in (52, 53, 54) for xl in (45, 46, 47)]
        row['grid_median_usd'] = round(statistics.median(g), 1); row['grid_pos'] = f"{sum(x > 0 for x in g)}/9"
        out[v]['grid'].append(row)
        print(f"  TP {tp} SL {sl} ATRx{m}: n={r['trades']} wr={r['win_rate']} pnl={r['pnl_usd']:+.0f} dd={r['max_dd_pct_deposit']} sum_move={row['sum_move']} gridmed={row['grid_median_usd']} pos={row['grid_pos']} {r['reasons']}")
print('ATR now', round(E.daily_atr_pct(E.runs[-1][0]), 2), 'ATR median', round(statistics.median(E.daily_atr_pct(t) for t in E.weekly_runs), 2))
json.dump(out, open('/home/user/workspace/sl_analysis/sl_grid_bt.json', 'w'), indent=1)
