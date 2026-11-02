"""
Swing position-management backtest (3rd iteration, 2026-11-02).

Reuses the full-data engine (scripts/run_backtest_v4_full.py: same snapshots, same composites,
same entry filters, no look-ahead) and replaces the position management:

  entries   : weekly run (Mon 07:00 UTC), LONG c>=53 & MVRV<=3.5 & VIX<=30, SHORT c<40 & MVRV>=1.3 & VIX<=30
  grid      : 40% at market, 20% limits at -3/-6/-9% (mirrored for SHORT); unfilled limits cancelled
              after 28 days, on the first partial TP, or when the position is closed
  stop      : one stop for the whole position at -12% from the signal price (3% below the last level)
  sizing    : risk-based — full grid filled + stop hit = -2% of the current deposit
  targets   : TP1 +10% from avg entry -> close 25%, stop to breakeven;
              TP2 +20% -> close another 25%, trailing stop 15% from the peak (never below TP1 level)
  exit      : regime/momentum exit at any daily/weekly run (LONG c<46, SHORT c>44 or MVRV<1)
  execution : 1H bars, conservative order inside a bar (limit fills -> stop -> TPs)
  costs     : taker 0.05% (market, stop, regime exit), maker 0.02% (limits, TPs),
              perpetual funding paid/received on the filled notional every 8h (real series)

Leverage does not change PnL here (PnL = qty x price move); it only changes margin.
"""
import sys, json, statistics, bisect
sys.path.insert(0, "/home/user/workspace/macro-dashboard/scripts")
import run_backtest_v4_full as E

H, D = E.H, E.D
OUT = "/home/user/workspace/macro-dashboard/public/data/backtest_swing.json"

# v4-lite = v4 weights, Options fixed at neutral 50 (basis-corrected tech + stables)
for s in E.SNAP.values():
    s["v4_lite"] = round(s["macro"] * 0.20 + s["crypto"] * 0.30 + s["tech_corr"] * 0.30 + 50 * 0.12 + s["stables_score"] * 0.08, 1)
COMPOSITES = {"v3": "v3 (прод)", "v4_lite": "v4-lite", "v4_rw+stables": "v4 ваги + лише стейблкоїни"}

TAKER, MAKER = 0.0005, 0.0002
fund_k, fund_v = E.fund.k, E.fund.v      # % per 8h


def funding_between(t0, t1):
    """sum of funding rates (fraction) with settlement ts in (t0, t1]."""
    i0 = bisect.bisect_right(fund_k, t0); i1 = bisect.bisect_right(fund_k, t1)
    return sum(fund_v[i0:i1]) / 100.0


MGMT = {
    "M0_prod": dict(label="Поточна: TP +3% / SL −1.5%, усе по ринку", grid=[(0, 1.0)], stop=1.5, tps=[(3.0, 1.0)], trail=None, regime_exit=True),
    "M1_noTP_SL4": dict(label="Без TP, SL −4%, вихід за режимом", grid=[(0, 1.0)], stop=4.0, tps=[], trail=None, regime_exit=True),
    "M2_swing_grid": dict(label="Свінг-сітка (узгоджена)", grid=[(0, 0.4), (3, 0.2), (6, 0.2), (9, 0.2)], stop=12.0,
                          tps=[(10.0, 0.25), (20.0, 0.25)], trail=15.0, regime_exit=True),
    "M3_grid_noTP": dict(label="Сітка без часткових тейків", grid=[(0, 0.4), (3, 0.2), (6, 0.2), (9, 0.2)], stop=12.0,
                         tps=[], trail=None, regime_exit=True),
    "M4_market_TP": dict(label="Усе по ринку + ті самі тейки", grid=[(0, 1.0)], stop=12.0,
                         tps=[(10.0, 0.25), (20.0, 0.25)], trail=15.0, regime_exit=True),
}
RISK = 0.02
CANCEL_DAYS = 28


def simulate(variant, m, el=53, xl=46, es=40, xs=44, t0=None, t1=None, fees=True, funding=True, risk=RISK):
    cfg = MGMT[m]
    dep = 10000.0; peak = dep; mdd = 0.0
    pos = None; trades = []
    runs = E.runs
    stats = dict(fills=[0] * len(cfg["grid"]), signals=0)

    def mtm(price):
        if not pos: return 0.0
        sgn = 1 if pos["dir"] == "LONG" else -1
        return pos["realized"] + sgn * pos["qty"] * (price - pos["avg"]) if pos["qty"] > 0 else pos["realized"]

    def close_qty(q, px, fee, why, t):
        sgn = 1 if pos["dir"] == "LONG" else -1
        pnl = sgn * q * (px - pos["avg"]) - (q * px * fee if fees else 0)
        pos["realized"] += pnl; pos["qty"] -= q
        pos["events"].append((E.dstr(t), why, round(px, 1), round(q, 5), round(pnl, 2)))

    def finish(t, reason):
        nonlocal dep, pos
        dep += pos["realized"]
        filled_levels = sum(1 for o in pos["orders"] if o["filled"])
        trades.append(dict(dir=pos["dir"], opened=E.dstr(pos["t_open"]), closed=E.dstr(t), signal_px=round(pos["p0"], 1),
                           avg_entry=round(pos["avg_final"], 1), levels_filled=filled_levels, reason=reason,
                           comp_open=pos["comp"], hold_days=round((t - pos["t_open"]) / D, 1),
                           pnl_usd=round(pos["realized"], 2), risk_usd=round(pos["risk_usd"], 2),
                           R=round(pos["realized"] / pos["risk_usd"], 2), funding_usd=round(pos["funding"], 2),
                           fees_usd=round(pos["fees"], 2), dep_after=round(dep, 2), events=pos["events"]))
        pos = None

    for idx, (t, kind) in enumerate(runs):
        if t0 and t < t0:
            continue
        s = E.SNAP[t]; c = s[variant]; price = s["price"]
        # ---- path between previous run and this run (1H bars) ----
        if pos:
            sgn = 1 if pos["dir"] == "LONG" else -1
            for b in E.bars_between(pos["checked_to"], t):
                bt, hi, lo = b[0], b[2], b[3]
                if funding and pos["qty"] > 0:
                    f = funding_between(bt, bt + H) * pos["qty"] * b[4]
                    pos["realized"] -= sgn * f; pos["funding"] += sgn * f
                # cancel stale limits
                if bt - pos["t_open"] > CANCEL_DAYS * D:
                    for o in pos["orders"]:
                        if not o["filled"]: o["cancelled"] = True
                # 1) limit fills
                for k, o in enumerate(pos["orders"]):
                    if o["filled"] or o.get("cancelled"): continue
                    if (sgn > 0 and lo <= o["px"]) or (sgn < 0 and hi >= o["px"]):
                        o["filled"] = True; stats["fills"][k] += 1
                        fee = o["q"] * o["px"] * MAKER if fees else 0
                        pos["avg"] = (pos["avg"] * pos["qty"] + o["px"] * o["q"]) / (pos["qty"] + o["q"])
                        pos["qty"] += o["q"]; pos["realized"] -= fee; pos["fees"] += fee
                        pos["avg_final"] = pos["avg"]
                        pos["events"].append((E.dstr(bt), f"fill L{k}", round(o["px"], 1), round(o["q"], 5), 0))
                # 2) stop
                if (sgn > 0 and lo <= pos["stop"]) or (sgn < 0 and hi >= pos["stop"]):
                    q = pos["qty"]; f0 = pos["realized"]
                    close_qty(q, pos["stop"], TAKER, "STOP", bt + H)
                    pos["fees"] += q * pos["stop"] * TAKER if fees else 0
                    finish(bt + H, pos["stop_kind"]); break
                # 3) take-profits
                for j, (lvl, frac) in enumerate(cfg["tps"]):
                    if j < pos["tp_done"]: continue
                    tpx = pos["avg"] * (1 + sgn * lvl / 100)
                    if (sgn > 0 and hi >= tpx) or (sgn < 0 and lo <= tpx):
                        if j == 0:
                            pos["tp_base"] = pos["qty"]
                            for o in pos["orders"]:
                                if not o["filled"]: o["cancelled"] = True
                        q = min(pos["qty"], pos["tp_base"] * frac) if frac < 1 else pos["qty"]
                        close_qty(q, tpx, MAKER, f"TP{j+1}", bt + H)
                        pos["fees"] += q * tpx * MAKER if fees else 0
                        pos["tp_done"] = j + 1
                        if j == 0:
                            pos["stop"] = pos["avg"]; pos["stop_kind"] = "BREAKEVEN"; pos["tp1_px"] = tpx
                        if j == 1 and cfg["trail"]:
                            pos["trail_on"] = True; pos["stop_kind"] = "TRAIL"
                        if pos["qty"] <= 1e-12:
                            finish(bt + H, f"TP{j+1}"); break
                    else:
                        break
                if pos is None: break
                if pos.get("trail_on"):
                    pos["ext"] = max(pos.get("ext", hi), hi) if sgn > 0 else min(pos.get("ext", lo), lo)
                    tr = pos["ext"] * (1 - sgn * cfg["trail"] / 100)
                    pos["stop"] = max(pos["stop"], tr, pos["tp1_px"]) if sgn > 0 else min(pos["stop"], tr, pos["tp1_px"])
            if pos:
                pos["checked_to"] = t
        # ---- regime / momentum exit at the run ----
        if pos and cfg["regime_exit"]:
            ex = (pos["dir"] == "LONG" and c < xl) or (pos["dir"] == "SHORT" and (c > xs or s["mvrv"] < 1.0))
            if ex:
                if pos["qty"] > 0:
                    q = pos["qty"]
                    close_qty(q, price, TAKER, "REGIME", t)
                    pos["fees"] += q * price * TAKER if fees else 0
                finish(t, "REGIME")
                eq = dep; peak = max(peak, eq); mdd = min(mdd, eq / peak - 1)
                continue
        # ---- entry ----
        if kind == "weekly" and pos is None and not (t1 and t > t1):
            mv, vx = s["mvrv"], s["vix"]
            dr = "LONG" if (c >= el and mv <= 3.5 and vx <= 30) else "SHORT" if (c < es and mv >= 1.3 and vx <= 30) else None
            if dr:
                stats["signals"] += 1
                sgn = 1 if dr == "LONG" else -1
                levels = [(price * (1 - sgn * off / 100), fr) for off, fr in cfg["grid"]]
                stop = price * (1 - sgn * cfg["stop"] / 100)
                loss_per_q = sum(fr * abs(px - stop) for px, fr in levels)       # per 1 unit of planned qty
                risk_usd = dep * risk
                Q = risk_usd / loss_per_q
                orders = [dict(px=px, q=Q * fr, filled=False) for px, fr in levels]
                pos = dict(dir=dr, p0=price, t_open=t, checked_to=t, comp=c, orders=orders, qty=0.0, avg=0.0, avg_final=price,
                           realized=0.0, stop=stop, stop_kind="STOP", tp_done=0, risk_usd=risk_usd, funding=0.0, fees=0.0, events=[])
                o = orders[0]                       # market tranche
                o["filled"] = True; stats["fills"][0] += 1
                fee = o["q"] * price * TAKER if fees else 0
                pos["qty"] = o["q"]; pos["avg"] = price; pos["realized"] -= fee; pos["fees"] += fee
                pos["events"].append((E.dstr(t), "fill L0 (market)", round(price, 1), round(o["q"], 5), 0))
        if t1 and t > t1 and pos is None:
            break
        eq = dep + mtm(price)
        peak = max(peak, eq); mdd = min(mdd, eq / peak - 1)

    open_info = None
    last = E.SNAP[runs[-1][0]]["price"]
    if pos:
        open_info = dict(dir=pos["dir"], opened=E.dstr(pos["t_open"]), avg_entry=round(pos["avg"], 1), qty=round(pos["qty"], 5),
                         unrealized_usd=round(mtm(last), 2), levels_filled=sum(1 for o in pos["orders"] if o["filled"]))
    final_eq = dep + (mtm(last) if pos else 0)
    Rs = [x["R"] for x in trades]
    wins = sum(1 for x in trades if x["pnl_usd"] > 0)
    gross_win = sum(x["pnl_usd"] for x in trades if x["pnl_usd"] > 0)
    gross_loss = -sum(x["pnl_usd"] for x in trades if x["pnl_usd"] < 0)
    top3 = sum(sorted((x["pnl_usd"] for x in trades), reverse=True)[:3])
    realized = dep - 10000
    return dict(variant=variant, mgmt=m, label=cfg["label"], trades=len(trades), wins=wins,
                win_rate=round(wins / len(trades) * 100, 1) if trades else None,
                pnl_usd=round(final_eq - 10000, 2), realized_usd=round(realized, 2), ret_pct=round((final_eq / 10000 - 1) * 100, 2),
                max_dd_pct=round(mdd * 100, 2), sum_R=round(sum(Rs), 2), avg_R=round(statistics.mean(Rs), 2) if Rs else None,
                profit_factor=round(gross_win / gross_loss, 2) if gross_loss else None,
                top3_share_pct=round(top3 / realized * 100, 0) if realized > 0 else None,
                avg_hold_days=round(statistics.mean(x["hold_days"] for x in trades), 1) if trades else None,
                max_hold_days=max((x["hold_days"] for x in trades), default=None),
                funding_usd=round(sum(x["funding_usd"] for x in trades), 2), fees_usd=round(sum(x["fees_usd"] for x in trades), 2),
                reasons={r: sum(1 for x in trades if x["reason"] == r) for r in sorted(set(x["reason"] for x in trades))},
                long=sum(1 for x in trades if x["dir"] == "LONG"), short=sum(1 for x in trades if x["dir"] == "SHORT"),
                grid_fill_rate=[round(f / stats["signals"] * 100, 0) for f in stats["fills"]] if stats["signals"] else None,
                open_position=open_info, trade_list=trades)


if __name__ == "__main__":
    wr = E.weekly_runs
    mid = wr[len(wr) // 2]
    p0 = E.SNAP[wr[0]]["price"]; p1 = E.SNAP[E.runs[-1][0]]["price"]
    out = dict(version="swing-backtest-1", generated_at=E.datetime.now(E.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               period=dict(start=E.dstr(wr[0]), end=E.dstr(E.runs[-1][0]), weeks=len(wr), mid=E.dstr(mid)),
               buy_hold_pct=round((p1 / p0 - 1) * 100, 2), risk_per_trade=RISK, mgmt={k: v["label"] for k, v in MGMT.items()},
               results={}, no_costs={}, halves={}, robustness={}, risk1={})
    GRID = [(el, xl) for el in (51, 53, 55) for xl in (44, 46, 48) if xl < el]
    for v in COMPOSITES:
        out["results"][v] = {}; out["no_costs"][v] = {}; out["halves"][v] = {}; out["robustness"][v] = {}
        for m in MGMT:
            r = simulate(v, m)
            out["results"][v][m] = r
            nc = simulate(v, m, fees=False, funding=False)
            out["no_costs"][v][m] = dict(pnl_usd=nc["pnl_usd"], max_dd_pct=nc["max_dd_pct"])
            a = simulate(v, m, t1=mid); b = simulate(v, m, t0=mid)
            out["halves"][v][m] = dict(h1_pnl=a["pnl_usd"], h1_n=a["trades"], h2_pnl=b["pnl_usd"], h2_n=b["trades"])
            g = [simulate(v, m, el, xl)["pnl_usd"] for el, xl in GRID]
            out["robustness"][v][m] = dict(median=round(statistics.median(g), 1), min=round(min(g), 1), max=round(max(g), 1),
                                           positive=f"{sum(1 for x in g if x > 0)}/{len(g)}")
            print(f"{v:14s} {m:14s} n={r['trades']:2d} wr={r['win_rate']} pnl={r['pnl_usd']:8.1f} dd={r['max_dd_pct']:6.2f} "
                  f"R={r['sum_R']:6.2f} pf={r['profit_factor']} top3={r['top3_share_pct']} hold={r['avg_hold_days']}/{r['max_hold_days']} "
                  f"fund={r['funding_usd']} fees={r['fees_usd']} fills={r['grid_fill_rate']} {r['reasons']} | nc={nc['pnl_usd']} "
                  f"| h1={a['pnl_usd']} h2={b['pnl_usd']} | grid={out['robustness'][v][m]} open={r['open_position']}")
    # equal-drawdown view: risk per trade scaled so that max drawdown = -10%
    out["equal_dd10"] = {}
    for v in ("v3", "v4_lite"):
        out["equal_dd10"][v] = {}
        for m in MGMT:
            lo, hi = 0.001, 0.2
            for _ in range(30):
                r = (lo + hi) / 2
                if simulate(v, m, risk=r)["max_dd_pct"] < -10: hi = r
                else: lo = r
            x = simulate(v, m, risk=lo)
            out["equal_dd10"][v][m] = dict(risk_pct=round(lo * 100, 2), pnl_usd=x["pnl_usd"], max_dd_pct=x["max_dd_pct"],
                                           funding_usd=x["funding_usd"], fees_usd=x["fees_usd"])
            print("DD10", v, m, out["equal_dd10"][v][m])
    print("period", out["period"], "B&H", out["buy_hold_pct"])
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False, default=float)
