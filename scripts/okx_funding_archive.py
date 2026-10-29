"""OKX official daily funding archive (BTC-USDT-SWAP) -> raw_backtest_full.json['funding_okx']"""
import json, urllib.request, zipfile, io, csv
from datetime import date, timedelta
from concurrent.futures import ThreadPoolExecutor
P = "/home/user/workspace/macro-dashboard/scripts/raw_backtest_full.json"
def one(d):
    u = f"https://www.okx.com/cdn/okex/traderecords/swaprate/monthly/{d:%Y%m}/allswaprate-swaprate-{d:%Y-%m-%d}.zip"
    for _ in range(3):
        try:
            b = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read()
            z = zipfile.ZipFile(io.BytesIO(b)); txt = z.read(z.namelist()[0]).decode("utf-8", "ignore")
            out = []
            for row in csv.reader(io.StringIO(txt)):
                if row and row[0] == "BTC-USDT-SWAP":
                    out.append({"ts": int(row[4]), "rate": float(row[3]), "pred": float(row[2])})
            return out
        except Exception as e:
            err = e
    print("miss", d, err); return []
if __name__ == "__main__":
    days = []; d = date(2023, 12, 1)
    while d <= date.today():
        days.append(d); d += timedelta(days=1)
    rows = {}
    with ThreadPoolExecutor(8) as ex:
        for res in ex.map(one, days):
            for r in res: rows[r["ts"]] = r
    R = json.load(open(P)); R["funding_okx"] = [rows[k] for k in sorted(rows)]; json.dump(R, open(P, "w"))
    print(len(rows))
