// Ridge Runner — trend-hold variant for the cbBTC minute-bar race.
//
// One decision, held with conviction: the first time the close pushes
// 0.3% above the 240-bar EMA with the 60-bar EMA above it, the bot buys
// with (nearly) everything and then simply holds. It sells only on a
// genuine trend break — a close 1.5% under the slow EMA — or an 8%
// trailing disaster stop. In a rising window this behaves like
// buy-and-hold with an emergency brake; in a falling window it never
// enters at all and keeps the stake. A small late probe guarantees at
// least one trade in a window with no trend to ride.
//
// Pure function of the bars: no clock, no randomness, no environment —
// two runs produce byte-identical actions.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const EMA_FAST = 60;
const EMA_SLOW = 240;
const ENTRY_LIFT = 1.003; // close must be 0.3% above the slow EMA
const BREAK = 0.985; // exit if close < 98.5% of the slow EMA
const TRAIL_KEEP = 0.92; // disaster stop: 8% under the peak close
const COOLDOWN = 360;
const SLIP_BPS = 200;
const PROBE_AFTER = 1000;
const PROBE_FRAC = 25n;

let emaFast = 0;
let emaSlow = 0;
let ema60 = 0;
let seeded = false;
let peak = 0;
let cooldownUntil = -1;
let anyFill = false;
let barsSeen = 0;

function ema(prev: number, value: number, n: number): number {
  return prev + (2 / (n + 1)) * (value - prev);
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    for (const f of batch.fills) if (f.status === 'filled') anyFill = true;
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const scale = state.symbols.get(SYMBOL)?.price_scale ?? 5;
    const close = Number(BigInt(bar.c)) / 10 ** scale;
    barsSeen += 1;

    if (!seeded) {
      emaFast = close;
      emaSlow = close;
      ema60 = close;
      seeded = true;
    } else {
      emaFast = ema(emaFast, close, EMA_FAST);
      emaSlow = ema(emaSlow, close, EMA_SLOW);
      ema60 = ema(ema60, close, 60);
    }
    if (state.warmingUp) return [];

    const pos = state.positions.get(SYMBOL);
    const holding = pos !== undefined && pos.qty > 0n;
    const orders: OrderInput[] = [];

    if (holding) {
      peak = peak === 0 ? close : Math.max(peak, close);
      if (close < emaSlow * BREAK || close < peak * TRAIL_KEEP) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: SLIP_BPS });
        peak = 0;
        cooldownUntil = barsSeen + COOLDOWN;
      }
      return orders;
    }

    peak = 0;
    if (barsSeen <= EMA_SLOW || barsSeen < cooldownUntil) return orders;
    if (state.cash <= 1_000_000n) return orders;

    if (close > emaSlow * ENTRY_LIFT && emaFast > emaSlow) {
      orders.push({
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: (state.cash * 99n) / 100n,
        max_slippage_bps: SLIP_BPS,
      });
      return orders;
    }

    const scoredSeq = state.seq - state.warmupBars;
    if (!anyFill && scoredSeq >= PROBE_AFTER && close > ema60) {
      orders.push({
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: (state.cash * PROBE_FRAC) / 100n,
        max_slippage_bps: SLIP_BPS,
      });
    }
    return orders;
  },
});
