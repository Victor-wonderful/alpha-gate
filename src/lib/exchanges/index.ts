import "server-only";
import type { Exchange, ExchangeAdapter } from "./types";
import { binanceAdapter } from "./binance";
import { bybitAdapter } from "./bybit";

/**
 * Exchange adapter registry.
 *
 * Every live-trading call site resolves its venue via `getAdapter(exchange)`
 * and talks to the returned `ExchangeAdapter` — no venue-specific imports.
 * Adding a venue = implement the adapter + register it here.
 */
const ADAPTERS: Partial<Record<Exchange, ExchangeAdapter>> = {
  binance: binanceAdapter,
  bybit: bybitAdapter,
};

/** Resolve the adapter for a stored `exchange` string. Throws if unsupported. */
export function getAdapter(exchange: string): ExchangeAdapter {
  const adapter = ADAPTERS[exchange as Exchange];
  if (!adapter) {
    throw new Error(`지원하지 않는 거래소입니다: ${exchange}`);
  }
  return adapter;
}

/** Exchanges that currently support live trading through an adapter. */
export function supportedExchanges(): Exchange[] {
  return Object.keys(ADAPTERS) as Exchange[];
}

export * from "./types";
