"""Pull live official data into data/live.json. Run daily by GitHub Actions (.github/workflows/update.yml).

Sources (no API keys needed):
  1. World Bank API (which republishes IMF/RBI BoP data) - annual India series, calendar-year basis.
  2. RBI press-release RSS - watches for new "Balance of Payments" releases.
The file is only rewritten when the data actually changed, so the repo history shows real updates only.
"""
import json, re, sys, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "live.json"
UA = {"User-Agent": "Mozilla/5.0 (india-bop-portal)"}

WB = {  # id: (label, group)
    "BX.GSR.MRCH.CD": ("Goods exports", "trade"),
    "BM.GSR.MRCH.CD": ("Goods imports", "trade"),
    "BX.GSR.NFSV.CD": ("Services exports", "trade"),
    "BM.GSR.NFSV.CD": ("Services imports", "trade"),
    "BN.CAB.XOKA.CD": ("Current account balance", "cab"),
    "BX.TRF.PWKR.CD.DT": ("Remittances received", "flows"),
    "BX.KLT.DINV.CD.WD": ("FDI net inflows", "flows"),
    "BN.KLT.PTXL.CD": ("Portfolio investment, net", "flows"),
    "FI.RES.TOTL.CD": ("Total reserves incl. gold", "reserves"),
    "BN.CAB.XOKA.GD.ZS": ("Current account, % of GDP", "cabpct"),
}


def get(url, as_json=True):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    return json.loads(body) if as_json else body.decode("utf-8-sig", "replace")


def world_bank():
    series, updated = {}, None
    for code, (label, group) in WB.items():
        try:
            d = get(f"https://api.worldbank.org/v2/country/IND/indicator/{code}?format=json&per_page=100&date=2005:2030")
            updated = updated or d[0].get("lastupdated")
            pts = {x["date"]: x["value"] for x in d[1] if x["value"] is not None}
            series[code] = {"label": label, "group": group, "data": dict(sorted(pts.items()))}
        except Exception as e:
            print(f"WB {code} failed: {e}", file=sys.stderr)
    return {"source": "World Bank WDI (from IMF / RBI BoP)", "lastupdated": updated, "series": series}


def rbi_watch():
    try:
        root = ET.fromstring(get("https://www.rbi.org.in/pressreleases_rss.xml", as_json=False).lstrip("﻿"))
    except Exception as e:
        print(f"RBI RSS failed: {e}", file=sys.stderr)
        return {"error": str(e), "items": []}
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        if re.search(r"balance of payments|external debt|foreign exchange reserves|international investment position", title, re.I):
            items.append({"title": title, "link": (it.findtext("link") or "").strip(), "date": (it.findtext("pubDate") or "").strip()})
    return {"feed": "https://www.rbi.org.in/pressreleases_rss.xml", "items": items[:10]}


def main():
    new = {"world_bank": world_bank(), "rbi_watch": rbi_watch()}
    if not new["world_bank"]["series"]:
        sys.exit("No World Bank data fetched - leaving live.json untouched")
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    strip = lambda d: {k: v for k, v in d.items() if k != "fetched_at"}
    if strip(old) == strip(new):
        print("No change in upstream data")
        return
    new["fetched_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    OUT.write_text(json.dumps(new, ensure_ascii=False, indent=1), encoding="utf-8")
    print("live.json updated", new["fetched_at"])


if __name__ == "__main__":
    main()
