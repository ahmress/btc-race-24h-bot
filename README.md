# Ridge Runner — cbBTC trend-hold bot

Entry for the make.fun competition **btc-race-24h-20261123-0511**
("Race a BTC trading bot live for 24 hours"), harness `bars-replay/v1`.

The bot trades cbBTC on 1-minute bars with 1,000 USDC of paper money.
One symbol, long only, no leverage.

## Strategy

One decision, held with conviction:

- **Enter** the first time the close pushes 0.3% above the 240-bar EMA
  while the 60-bar EMA sits above it — a confirmed, mature uptrend, not
  a head-fake. Position size is ~99% of cash.
- **Hold** through ordinary noise. There is no take-profit and no tight
  stop; a 24-hour window usually pays for riding the day's drift.
- **Exit** only on a genuine trend break: a close 1.5% under the slow
  EMA, or an 8% trailing disaster stop under the best close since
  entry. After an exit, a 360-bar cooldown prevents re-entry churn.
- **Probe**: if nothing has filled by scored bar 1000, a 25%-of-cash
  probe on mild strength (close above the 60-bar EMA) makes sure the
  run still counts as traded; it exits by the same rules.

Every round trip on this harness costs ~26 bps (4 bps fee + 2 bps
slippage + price impact), so the bot is deliberately patient: on the
dev window it traded exactly once and finished +$20.81 (+2.08%),
max drawdown 1.96%.

The bot is a pure function of the bars it has seen — no clock, no
randomness, no environment, no network — so repeated runs produce
byte-identical action logs.

## Layout

- `main.ts` — the strategy (Node 22, erasable TypeScript only).
- `vendor/makefun-bars.ts` — the kit's protocol shim, copied unchanged.

## Run it the way the grader does

From the unpacked competition kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repo> --driver process
```
