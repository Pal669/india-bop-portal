# India Balance of Payments Portal

Static site (GitHub Pages) with two data layers.

| Layer | What | How it updates |
|---|---|---|
| Live Data tab | World Bank annual series (trade, current account, remittances, FDI, portfolio flows, reserves) plus an RBI press-release watcher | Automatic. `.github/workflows/update.yml` runs `scripts/fetch_live.py` daily and commits `data/live.json` only if something changed. |
| Six analysis tabs | The curated workbook `India_BoP_Analysis_v2.xlsx` (partner splits, forecasts, commentary) | Manual. Re-export with `python scripts/excel_to_json.py`, then commit `data/curated.json`. |

The RBI watcher shows a banner when RBI publishes a Balance of Payments, external debt or reserves release,
which is the cue to refresh the workbook.

## Run locally
    python -m http.server 8000     # then open http://localhost:8000

## Refresh the curated tabs
    python scripts/excel_to_json.py "path/to/India_BoP_Analysis_v2.xlsx"
    git add data/curated.json && git commit -m "Refresh curated data" && git push

## Deploy
Repo Settings > Pages > Deploy from branch > `main` / root. Site: `https://<user>.github.io/<repo>/`.
