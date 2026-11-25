# Token Radar — make.fun token-radar-01 entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xctengfeiwls-creator/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xctengfeiwls-creator/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for the [make.fun "Build the best token launch radar" bounty](https://make.fun/bounty/token-radar-01) — $1,325 in USDC.

A radar that ranks pre-token protocols by what a token would be worth if the
protocol issued one today and its record stayed as it is, each with a farm plan.

## The model (radar-2)

`implied = round( tvl_usd x multiple(category) x growthMult x maturityMult )`

- **multiple(category)** is calibrated from this snapshot's own live protocols:
  for each category, the median market-cap-to-TVL ratio of the protocols in that
  category whose token already trades, shrunk toward the global median so a
  category with one or two live comps cannot run away with the board:
  `multiple = clamp((n x median + 4 x globalMedian) / (n + 4), 0.02, 0.80)`.
  A category with no live comp takes the global median. Medians, not means.
- **growthMult** = `1 + clamp(change_7d, -50, 100) / 100 x 0.5` (0.75–1.50).
- **maturityMult** = `0.6 + 0.4 x min(age_days, 1095) / 1095` (0.60–1.00); an
  unlisted age uses 365 days. Age is the time since DefiLlama first listed the
  protocol — how long it has run with no token.
- No protocol name is ever special-cased. Deterministic: same snapshot in,
  same board out. No wall clock, no randomness, no network.

## The board

200 rows: all 40 watchlist protocols, plus the 160 pre-token protocols below
the $50M floor with the most TVL (exchanges and versioned pools excluded).
Live-token protocols are set aside in the Live token tab with their market caps
shown as facts, never as model values. A protocol "records no token" — that is
the record, never proof it has none.

## Farm plans

Six steps per protocol, each with a cost and a time, derived from the
protocol's category, chains, TVL and age. Gas is priced per chain (Ethereum
dollars, rollups cents, Solana a fraction of a cent); capital is sized to TVL
($50–$500); the hold is longer for a young protocol.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes `board.json`, `data.js`,
  copies `dashboard/` and `screenshots/`, writes `dossier.json`.
- `lib/model.ts` — snapshot parsing, board building, gate checks.
- `dashboard/model.js` — the radar-2 model (shared by `main.ts` and the page).
- `dashboard/farm.js` — the farm plans (shared by `main.ts` and the page).
- `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` — the page:
  sortable and filterable board, a detail view for every protocol, the
  methodology with the calibration table. Static, no network.
- `vendor/makefun-board.ts` — the dossier library, copied from the kit.
- `screenshots/` — the board, a protocol detail view, a filtered view.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22.18 or later. Two runs write byte-identical output.
