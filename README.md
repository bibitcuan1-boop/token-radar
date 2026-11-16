[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bibitcuan1-boop/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bibitcuan1-boop/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# token-radar

A token launch radar: a dashboard that finds pre-token protocols, ranks them
by an implied value, and shows a reader how to farm each one.

Built for the [make.fun](https://make.fun/bounty/token-radar-01) bounty
**"Build the best token launch radar"**
([token-radar-01](https://make.fun/bounty/token-radar-01)).

## The model (radar-2)

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json`: 758
protocols, 40 on the watchlist) and scores every pre-token protocol. The
implied value follows only from the snapshot's own figures — no protocol name
is special-cased, and no multiple is written in by hand:

- **Base multiple** — the median market-cap / TVL the market already pays
  live tokens in this same snapshot: per category where that category has at
  least 8 live protocols with a market cap, else the whole snapshot's median
  (0.21x here), clamped to [0.05x, 1.00x].
- **Growth** — `1 + clamp(change_7d, -60, 120) / 100 × 0.5`.
- **Maturity** — the launch window: `0.60x` at listing rising to `1.00x` at
  two years, then decaying 3% a year floored at `0.70x`. A protocol in its
  first two years without a token is in its prime launch window; one that has
  run four-plus years with no token has had its chances fade.
- **Breadth** — `1 + 0.03 × min(chains − 1, 4)`: more chains, more surface
  for a future token.

The board holds 178 rows: all 40 watchlist protocols plus the 138 pre-token
protocols below the $50M floor the model ranks highest (wrapped, staked and
bridged products of tokens that already trade are left out, as the watchlist
rule leaves them out). Live-token protocols are set aside with their market
caps shown — the market's own values, never mixed into the ranking. Every row
carries a seven-step farm plan with what each step costs and how long it
takes, derived from the protocol's category, chains, TVL and age.

## The dashboard

A static page with no network: `dashboard/index.html`, `app.css`, `app.js`
and `model.js` read `data.js`, which `main.ts` writes from the same board.
The page recomputes each row's implied value and regenerates each farm plan
in the browser, so what it shows is what `board.json` holds. It is sortable
and filterable (search, category, chain, watchlist-only, pre-token / live
token), and every protocol opens a detail panel with the model's working, its
farm plan and live comparables in its category.

Deep links: `?shot=board` shows the board; `?shot=detail&slug=<slug>` opens
that protocol's detail; `?shot=filtered&category=<name>` applies that filter.

## Layout

- `main.ts` — the driver the harness runs as `node /bot/main.ts`
- `lib/model.ts` — the radar-2 model, the farm plans and the board checks
- `vendor/makefun-board.ts` — make.fun's dossier library, as the kit ships it
- `dashboard/` — `index.html`, `app.css`, `app.js`, `model.js`
- `screenshots/` — three real renders of the dashboard (board, detail, filtered)
- `LICENSE` — MIT

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`)
and take the three screenshots at 1280×800:

1. `dashboard/index.html?shot=board` — the board
2. `dashboard/index.html?shot=detail&slug=<rank 1 slug>` — a detail view
3. `dashboard/index.html?shot=filtered&category=<a top category>` — a filtered view

Save them as `screenshots/1-board.jpg`, `screenshots/2-detail.jpg` and
`screenshots/3-filtered.jpg`, then run `main.ts` again so the dossier is
built from them.

## License

MIT. See [LICENSE](LICENSE).
