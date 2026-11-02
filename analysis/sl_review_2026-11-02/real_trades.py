import json, bisect
from datetime import datetime, timezone, timedelta
R = json.load(open('/home/user/workspace/macro-dashboard/scripts/raw_backtest_full.json'))
T = json.load(open('/home/user/workspace/sl_analysis/trades.json'))['closed_trades']
H = 3600000
h1 = R['btc_1h']; ts = [c[0] for c in h1]
f = lambda t: datetime.fromtimestamp(t/1000, tz=timezone.utc).strftime('%m-%d %H:%M')
last = h1[-1][0] + H
out = []
for tr in T:
    e = tr['entry_price']; d0 = datetime.fromisoformat(tr['opened_at']).replace(tzinfo=timezone.utc)
    # locate entry hour: first bar on/after open date (07:00 for Mondays) whose range contains entry
    if d0.weekday() != 0: d0 = d0 - timedelta(days=d0.weekday())
    start = int(d0.timestamp()*1000)
    mon7 = start + 7*H
    i = bisect.bisect_left(ts, start)
    cand = [j for j in range(i, i+48) if h1[j][3] <= e <= h1[j][2]]
    pref = [j for j in cand if datetime.fromtimestamp(h1[j][0]/1000, tz=timezone.utc).hour == 7]
    if not cand:
        cand = [min(range(i, i+48), key=lambda j: abs(h1[j][4]-e))]; print('approx entry', tr['id'], h1[cand[0]][4])
    j0 = min(cand, key=lambda j: abs(h1[j][0]-mon7))
    t_entry = h1[j0][0]
    tp, sl = e*1.03, e*0.985
    # walk forward 14 days
    k0 = bisect.bisect_left(ts, t_entry)
    sl_hit = tp_hit = None; mae_before_tp = 0; mfe7 = 0; mae7 = 0
    for k in range(k0, min(len(h1), k0 + 14*24)):
        c = h1[k]; hrs = (c[0]-t_entry)/H
        if sl_hit is None and tp_hit is None:
            if c[3] <= sl: sl_hit = c[0]
            elif c[2] >= tp: tp_hit = c[0]
        if hrs < 7*24:
            mfe7 = max(mfe7, c[2]/e-1); mae7 = min(mae7, c[3]/e-1)
    # first time +3% reached (regardless of SL) within 7d and 14d, and MAE until then
    tp_any = None; mae_until = 0
    for k in range(k0, min(len(h1), k0 + 14*24)):
        c = h1[k]
        if c[2] >= tp:
            tp_any = c[0]; break
        mae_until = min(mae_until, c[3]/e-1)
    nxt = t_entry + 7*24*H
    knx = bisect.bisect_left(ts, nxt); p_next = h1[knx][1] if knx < len(h1) else None
    row = dict(id=tr['id'], opened=f(t_entry), result=tr.get('exit_reason') or 'SL_HIT', entry=e,
               sl_after_h=round((sl_hit - t_entry)/H) if sl_hit else None,
               tp_reached_after_d=round((tp_any - t_entry)/H/24, 1) if tp_any else None,
               mae_before_tp=round(mae_until*100, 2) if tp_any else None,
               mfe7=round(mfe7*100, 2), mae7=round(mae7*100, 2),
               ret_next_monday=round((p_next/e-1)*100, 2) if p_next else None)
    out.append(row); print(row)
json.dump(out, open('/home/user/workspace/sl_analysis/real_trades_analysis.json','w'), indent=1)
