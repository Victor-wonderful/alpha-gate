import "server-only";
import { createHmac } from "node:crypto";
import type {
  AccountInfo,
  ExchangeAdapter,
  ExchangeCredentials,
  KeyVerificationResult,
  MarketOrderArgs,
  OrderStatus,
  ProtectiveOrderArgs,
  UnifiedOrderResult,
} from "./types";

/**
 * Binance USDT-M Futures REST client.
 *
 * Authenticated endpoints use HMAC-SHA256 signing per Binance spec:
 *   - All params (incl. timestamp) become a query string
 *   - signature = HMAC-SHA256(query, apiSecret), hex
 *   - signature is appended to the query
 *   - X-MBX-APIKEY header carries the public key
 *
 * Docs: https://developers.binance.com/docs/derivatives/usds-margined-futures
 *
 * IMPORTANT: This adapter NEVER calls withdraw endpoints. If you ever need to,
 * audit the call site carefully. The whole point of the product's positioning is
 * "we cannot withdraw your funds."
 */

const MAINNET_URL = "https://fapi.binance.com";
const TESTNET_URL = "https://testnet.binancefuture.com";

function baseUrl(creds: ExchangeCredentials): string {
  return creds.testnet ? TESTNET_URL : MAINNET_URL;
}

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface BinanceOrderResult {
  orderId: number;
  symbol: string;
  status: string;
  side: "BUY" | "SELL";
  type: string;
  origQty: string;
  executedQty: string;
  avgPrice?: string;
  stopPrice?: string;
  reduceOnly?: boolean;
  updateTime?: number;
}

export interface BinanceAccountInfo {
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  totalWalletBalance: number;
  availableBalance: number;
  feeTier?: number;
}

/** Sign + send an authenticated Binance Futures request. */
async function signedRequest<T>(
  creds: ExchangeCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | number | boolean> = {},
): Promise<T> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    merged[k] = String(v);
  }
  merged.timestamp = String(timestamp);
  merged.recvWindow = String(recvWindow);

  const query = new URLSearchParams(merged).toString();
  const signature = createHmac("sha256", creds.apiSecret).update(query).digest("hex");
  const fullQuery = `${query}&signature=${signature}`;

  const url = `${baseUrl(creds)}${path}?${fullQuery}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": creds.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    // Binance returns JSON like { "code": -2014, "msg": "API-key format invalid." }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    const errObj =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { code?: number; msg?: string })
        : null;
    const msg = errObj?.msg ?? `HTTP ${res.status}`;
    const code = errObj?.code;
    const e = new Error(`Binance ${path} 실패: ${msg}${code ? ` (code ${code})` : ""}`);
    (e as Error & { code?: number }).code = code;
    throw e;
  }

  return JSON.parse(text) as T;
}

/** Binance order status → normalized OrderStatus. */
function normStatus(s: string): OrderStatus {
  const m: Record<string, OrderStatus> = {
    NEW: "open",
    PARTIALLY_FILLED: "partial",
    FILLED: "filled",
    CANCELED: "canceled",
    REJECTED: "rejected",
    EXPIRED: "expired",
  };
  return m[s] ?? "submitted";
}

function toUnified(r: BinanceOrderResult): UnifiedOrderResult {
  return {
    orderId: String(r.orderId),
    symbol: r.symbol,
    status: normStatus(r.status),
    side: r.side,
    type: r.type,
    origQty: parseFloat(r.origQty) || 0,
    executedQty: parseFloat(r.executedQty) || 0,
    avgPrice: r.avgPrice ? parseFloat(r.avgPrice) : undefined,
    raw: r,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Read endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch account info — used to verify a freshly-entered key works. */
export async function getAccount(creds: ExchangeCredentials): Promise<BinanceAccountInfo> {
  type AccountResponse = {
    canTrade: boolean;
    canDeposit: boolean;
    canWithdraw: boolean;
    totalWalletBalance: string;
    availableBalance: string;
    feeTier?: number;
  };
  const a = await signedRequest<AccountResponse>(creds, "GET", "/fapi/v2/account");
  return {
    canTrade: a.canTrade,
    canDeposit: a.canDeposit,
    canWithdraw: a.canWithdraw,
    totalWalletBalance: parseFloat(a.totalWalletBalance),
    availableBalance: parseFloat(a.availableBalance),
    feeTier: a.feeTier,
  };
}

/** Position info for one or all symbols. */
export async function getPositions(
  creds: ExchangeCredentials,
  symbol?: string,
): Promise<
  Array<{
    symbol: string;
    positionAmt: number;
    entryPrice: number;
    markPrice: number;
    unRealizedProfit: number;
    leverage: number;
  }>
> {
  type PosRes = Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unRealizedProfit: string;
    leverage: string;
  }>;
  const params: Record<string, string> = {};
  if (symbol) params.symbol = symbol.toUpperCase();
  const raw = await signedRequest<PosRes>(creds, "GET", "/fapi/v2/positionRisk", params);
  return raw
    .filter((p) => parseFloat(p.positionAmt) !== 0)
    .map((p) => ({
      symbol: p.symbol,
      positionAmt: parseFloat(p.positionAmt),
      entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice),
      unRealizedProfit: parseFloat(p.unRealizedProfit),
      leverage: parseInt(p.leverage, 10),
    }));
}

/** Get a single order's current state (raw Binance shape). */
export async function getOrder(
  creds: ExchangeCredentials,
  symbol: string,
  orderId: number,
): Promise<BinanceOrderResult> {
  return signedRequest<BinanceOrderResult>(creds, "GET", "/fapi/v1/order", {
    symbol: symbol.toUpperCase(),
    orderId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Write endpoints — orders
// ─────────────────────────────────────────────────────────────────────────────

/** Change leverage for a symbol BEFORE placing the entry. */
export async function setLeverage(
  creds: ExchangeCredentials,
  symbol: string,
  leverage: number,
): Promise<{ leverage: number; symbol: string }> {
  type LevRes = { leverage: number; symbol: string; maxNotionalValue: string };
  const r = await signedRequest<LevRes>(creds, "POST", "/fapi/v1/leverage", {
    symbol: symbol.toUpperCase(),
    leverage,
  });
  return { leverage: r.leverage, symbol: r.symbol };
}

export type OrderSide = "BUY" | "SELL";

/** Market entry order. */
export async function placeMarketOrder(
  creds: ExchangeCredentials,
  args: {
    symbol: string;
    side: OrderSide;
    quantity: number;
    reduceOnly?: boolean;
  },
): Promise<BinanceOrderResult> {
  return signedRequest<BinanceOrderResult>(creds, "POST", "/fapi/v1/order", {
    symbol: args.symbol.toUpperCase(),
    side: args.side,
    type: "MARKET",
    quantity: args.quantity,
    reduceOnly: args.reduceOnly ? "true" : "false",
  });
}

/** Stop-loss order (STOP_MARKET, reduce-only).
 *  When triggered, closes the position at market. */
export async function placeStopMarketOrder(
  creds: ExchangeCredentials,
  args: {
    symbol: string;
    /** Opposite side of the entry (BUY entry → SELL stop). */
    side: OrderSide;
    stopPrice: number;
    quantity: number;
  },
): Promise<BinanceOrderResult> {
  return signedRequest<BinanceOrderResult>(creds, "POST", "/fapi/v1/order", {
    symbol: args.symbol.toUpperCase(),
    side: args.side,
    type: "STOP_MARKET",
    stopPrice: args.stopPrice,
    quantity: args.quantity,
    reduceOnly: "true",
    workingType: "MARK_PRICE",
  });
}

/** Take-profit order (TAKE_PROFIT_MARKET, reduce-only). */
export async function placeTakeProfitMarketOrder(
  creds: ExchangeCredentials,
  args: {
    symbol: string;
    side: OrderSide;
    stopPrice: number;
    quantity: number;
  },
): Promise<BinanceOrderResult> {
  return signedRequest<BinanceOrderResult>(creds, "POST", "/fapi/v1/order", {
    symbol: args.symbol.toUpperCase(),
    side: args.side,
    type: "TAKE_PROFIT_MARKET",
    stopPrice: args.stopPrice,
    quantity: args.quantity,
    reduceOnly: "true",
    workingType: "MARK_PRICE",
  });
}

/** Cancel a single open order. */
export async function cancelOrder(
  creds: ExchangeCredentials,
  symbol: string,
  orderId: number,
): Promise<{ orderId: number; status: string }> {
  return signedRequest(creds, "DELETE", "/fapi/v1/order", {
    symbol: symbol.toUpperCase(),
    orderId,
  });
}

/** Cancel all open orders for a symbol. */
export async function cancelAllOrders(
  creds: ExchangeCredentials,
  symbol: string,
): Promise<{ code: number; msg: string }> {
  return signedRequest(creds, "DELETE", "/fapi/v1/allOpenOrders", {
    symbol: symbol.toUpperCase(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification (used by the key-registration UI)
// ─────────────────────────────────────────────────────────────────────────────

/** Ping the account endpoint to verify a key works AND surface permissions.
 *  Catches errors and returns them in the result rather than throwing. */
export async function verifyCredentials(
  creds: ExchangeCredentials,
): Promise<KeyVerificationResult> {
  try {
    const a = await getAccount(creds);
    return {
      valid: true,
      permissions: {
        canTrade: a.canTrade,
        canDeposit: a.canDeposit,
        canWithdraw: a.canWithdraw,
      },
      balance: a.totalWalletBalance,
    };
  } catch (err) {
    return {
      valid: false,
      permissions: { canTrade: false, canDeposit: false, canWithdraw: false },
      balance: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter — the venue-neutral surface used by call sites via getAdapter()
// ─────────────────────────────────────────────────────────────────────────────

export const binanceAdapter: ExchangeAdapter = {
  id: "binance",

  verifyCredentials,

  async getAccount(creds): Promise<AccountInfo> {
    const a = await getAccount(creds);
    return {
      canTrade: a.canTrade,
      canDeposit: a.canDeposit,
      canWithdraw: a.canWithdraw,
      totalWalletBalance: a.totalWalletBalance,
      availableBalance: a.availableBalance,
    };
  },

  async setLeverage(creds, symbol, leverage): Promise<void> {
    await setLeverage(creds, symbol, leverage);
  },

  async placeMarketOrder(creds, args: MarketOrderArgs): Promise<UnifiedOrderResult> {
    return toUnified(await placeMarketOrder(creds, args));
  },

  async placeStopMarketOrder(creds, args: ProtectiveOrderArgs): Promise<UnifiedOrderResult> {
    return toUnified(await placeStopMarketOrder(creds, args));
  },

  async placeTakeProfitMarketOrder(
    creds,
    args: ProtectiveOrderArgs,
  ): Promise<UnifiedOrderResult> {
    return toUnified(await placeTakeProfitMarketOrder(creds, args));
  },

  async getOrder(creds, symbol, orderId): Promise<UnifiedOrderResult> {
    return toUnified(await getOrder(creds, symbol, parseInt(orderId, 10)));
  },

  async cancelOrder(creds, symbol, orderId) {
    const r = await cancelOrder(creds, symbol, parseInt(orderId, 10));
    return { orderId: String(r.orderId), status: normStatus(r.status) };
  },
};
