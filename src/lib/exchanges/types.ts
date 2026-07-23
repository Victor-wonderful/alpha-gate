import "server-only";

/**
 * Venue-neutral exchange adapter contract.
 *
 * Every supported exchange (Binance, Bybit, …) implements `ExchangeAdapter`.
 * Call sites (placeLiveTradeAction, the sync cron, the key-verification UI)
 * talk to this interface via `getAdapter(exchange)` and never import a
 * venue-specific module directly. Adding a new venue = one new adapter file.
 *
 * Normalization rules the interface guarantees:
 *  - `orderId` is always a STRING (Bybit uses UUID-style ids; Binance numeric).
 *  - `status` is always one of the normalized `OrderStatus` values below,
 *    which match the `exchange_orders` / `trades` CHECK vocabulary — so call
 *    sites store it directly without a per-venue status map.
 *  - Quantities/prices are numbers, not strings.
 */

export type Exchange = "binance" | "bybit";

export type OrderSide = "BUY" | "SELL";

/** Normalized order status shared across venues.
 *  Matches supabase CHECK constraints on exchange_orders.status / trades.exchange_status. */
export type OrderStatus =
  | "pending"
  | "submitted"
  | "open"
  | "partial"
  | "filled"
  | "canceled"
  | "rejected"
  | "expired"
  | "error";

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  /** When true, route to the venue's testnet endpoint instead of mainnet. */
  testnet?: boolean;
}

export interface UnifiedOrderResult {
  orderId: string;
  symbol: string;
  status: OrderStatus;
  side: OrderSide;
  type: string;
  origQty: number;
  executedQty: number;
  avgPrice?: number;
  /** Raw venue payload — stored in exchange_orders.raw_response for debugging. */
  raw?: unknown;
}

export interface AccountInfo {
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  /** Total wallet balance in USDT (quote currency). */
  totalWalletBalance: number;
  /** Available (free) balance in USDT. */
  availableBalance: number;
}

export interface KeyVerificationResult {
  valid: boolean;
  permissions: { canTrade: boolean; canDeposit: boolean; canWithdraw: boolean };
  /** Total wallet balance in USDT. */
  balance: number;
  error?: string;
}

export interface MarketOrderArgs {
  symbol: string;
  side: OrderSide;
  quantity: number;
  reduceOnly?: boolean;
}

export interface ProtectiveOrderArgs {
  symbol: string;
  /** Opposite side of the entry (BUY entry → SELL protective). */
  side: OrderSide;
  stopPrice: number;
  quantity: number;
}

/** A single exchange integration. Stateless — credentials are passed per call. */
export interface ExchangeAdapter {
  readonly id: Exchange;

  /** Ping the account endpoint: is the key valid, and what can it do? Never throws. */
  verifyCredentials(creds: ExchangeCredentials): Promise<KeyVerificationResult>;

  /** Account snapshot (permissions + balances). Throws on API error. */
  getAccount(creds: ExchangeCredentials): Promise<AccountInfo>;

  /** Set leverage for a symbol BEFORE placing the entry. */
  setLeverage(creds: ExchangeCredentials, symbol: string, leverage: number): Promise<void>;

  /** Market entry (or reduce-only market close). */
  placeMarketOrder(creds: ExchangeCredentials, args: MarketOrderArgs): Promise<UnifiedOrderResult>;

  /** Stop-loss as a reduce-only stop-market order. */
  placeStopMarketOrder(
    creds: ExchangeCredentials,
    args: ProtectiveOrderArgs,
  ): Promise<UnifiedOrderResult>;

  /** Take-profit as a reduce-only take-profit-market order. */
  placeTakeProfitMarketOrder(
    creds: ExchangeCredentials,
    args: ProtectiveOrderArgs,
  ): Promise<UnifiedOrderResult>;

  /** Current state of a single order. */
  getOrder(
    creds: ExchangeCredentials,
    symbol: string,
    orderId: string,
  ): Promise<UnifiedOrderResult>;

  /** Cancel a single open order. */
  cancelOrder(
    creds: ExchangeCredentials,
    symbol: string,
    orderId: string,
  ): Promise<{ orderId: string; status: OrderStatus }>;
}
