import json, bisect
R = json.load(open('/home/user/workspace/macro-dashboard/scripts/raw_backtest_full.json'))
A = json.load(open('real_trades_analysis.json'))
from datetime import datetime, timezone
H = 3600000; h1 = R['btc_1h']; ts = [c[0] for c in h1]
ent = {}
for a in A:
    t = int(datetime.strptime('2026-' + a['opened'], '%Y-%m-%d %H:%M').replace(tzinfo=timezone.utc).timestamp()*1000)
    ent[a['id']] = (t, a['entry'])
def run(tp, sl, days=7):
    res = []
    for id_, (t, e) in ent.items():
        k0 = bisect.bisect_left(ts, t); out = None
        for k in range(k0, min(len(h1), k0 + days*24)):
            c = h1[k]
            if c[3] <= e*(1-sl/100): out = ('SL', -sl); break
            if c[2] >= e*(1+tp/100): out = ('TP', tp); break
        if not out:
            c = h1[min(len(h1)-1, k0 + days*24 - 1)]; out = ('TIME', round((c[4]/e-1)*100, 2))
        res.append((id_,) + out)
    return res
rows = []
for tp in (3, 4.5, 6):
    for sl in (1.5, 2, 2.5, 3, 3.5, 4, 5):
        r = run(tp, sl)
        tot = sum(x[2] for x in r); usd = sum(1200*x[2]/100*1.5 for x in r)
        rows.append(dict(tp=tp, sl=sl, sum_move=round(tot, 2), usd=round(usd, 1),
                         tp_n=sum(x[1]=='TP' for x in r), sl_n=sum(x[1]=='SL' for x in r), time_n=sum(x[1]=='TIME' for x in r),
                         detail=' '.join(f"{x[0][1:]}:{x[1][0]}{x[2]:+.1f}" for x in r)))
for x in rows: print(x)
json.dump(rows, open('sl_grid_real.json', 'w'), indent=1)
