import "server-only";
import { createHmac } from "node:crypto";
import type {
  AccountInfo,
  ExchangeAdapter,
  ExchangeCredentials,
  KeyVerificationResult,
  MarketOrderArgs,
  OrderSide,
  OrderStatus,
  ProtectiveOrderArgs,
  UnifiedOrderResult,
} from "./types";

/**
 * Bybit V5 USDT Perpetual (category=linear) REST client.
 *
 * V5 auth (very different from Binance's query-string signing):
 *   signStr   = timestamp + apiKey + recvWindow + payload
 *     - GET:  payload = the querystring (no leading '?')
 *     - POST: payload = the raw JSON body
 *   signature = HMAC-SHA256(signStr, apiSecret), hex
 *   Headers:  X-BAPI-API-KEY / X-BAPI-TIMESTAMP / X-BAPI-RECV-WINDOW / X-BAPI-SIGN
 *
 * Every response is the envelope { retCode, retMsg, result, ... }; retCode !== 0 is an error.
 *
 * Docs: https://bybit-exchange.github.io/docs/v5/intro
 *
 * ASSUMPTIONS (first integration):
 *  - Account is UNIFIED (falls back to CONTRACT for balance reads).
 *  - Position mode is ONE-WAY (positionIdx omitted). Hedge mode would need positionIdx 1/2.
 *  - Protective stop/take-profit are placed as reduce-only CONDITIONAL market orders,
 *    each with its own orderId — parity with the Binance 3-order design so the sync
 *    cron can track/cancel them identically.
 *
 * NEVER calls withdraw/transfer endpoints. Key verification blocks withdraw-enabled keys.
 */

const MAINNET_URL = "https://api.bybit.com";
const TESTNET_URL = "https://api-testnet.bybit.com";
const RECV_WINDOW = "5000";
const CATEGORY = "linear";

function baseUrl(creds: ExchangeCredentials): string {
  return creds.testnet ? TESTNET_URL : MAINNET_URL;
}

interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

/** Sign + send a Bybit V5 authenticated request. Throws on retCode !== 0. */
async function bybitRequest<T>(
  creds: ExchangeCredentials,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const timestamp = String(Date.now());

  // Drop undefined params.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    clean[k] = String(v);
  }

  let url: string;
  let body: string | undefined;
  let payload: string;

  if (method === "GET") {
    const qs = new URLSearchParams(clean).toString();
    payload = qs;
    url = `${baseUrl(creds)}${path}${qs ? `?${qs}` : ""}`;
  } else {
    body = JSON.stringify(clean);
    payload = body;
    url = `${baseUrl(creds)}${path}`;
  }

  const signStr = timestamp + creds.apiKey + RECV_WINDOW + payload;
  const signature = createHmac("sha256", creds.apiSecret).update(signStr).digest("hex");

  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": creds.apiKey,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    "X-BAPI-SIGN": signature,
  };
  if (method === "POST") headers["Content-Type"] = "application/json";

  const res = await fetch(url, { method, headers, body, cache: "no-store" });
  const text = await res.text();

  let parsed: BybitEnvelope<T>;
  try {
    parsed = JSON.parse(text) as BybitEnvelope<T>;
  } catch {
    throw new Error(`Bybit ${path} 실패: HTTP ${res.status} (비정상 응답)`);
  }

  if (!res.ok || parsed.retCode !== 0) {
    const e = new Error(
      `Bybit ${path} 실패: ${parsed.retMsg || `HTTP ${res.status}`} (retCode ${parsed.retCode})`,
    );
    (e as Error & { code?: number }).code = parsed.retCode;
    throw e;
  }

  return parsed.result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status normalization
// ─────────────────────────────────────────────────────────────────────────────

function normStatus(s: string): OrderStatus {
  const m: Record<string, OrderStatus> = {
    New: "open",
    Untriggered: "open", // conditional order waiting for its trigger
    Triggered: "open", // trigger hit, becoming a market order
    PartiallyFilled: "partial",
    Filled: "filled",
    Cancelled: "canceled",
    Deactivated: "canceled",
    PartiallyFilledCanceled: "canceled",
    Rejected: "rejected",
  };
  return m[s] ?? "submitted";
}

function normSide(s: string): OrderSide {
  return s.toLowerCase() === "sell" ? "SELL" : "BUY";
}

interface BybitOrder {
  orderId: string;
  symbol: string;
  side: string;
  orderType: string;
  orderStatus: string;
  qty: string;
  cumExecQty?: string;
  avgPrice?: string;
}

function toUnified(o: BybitOrder, fallback?: Partial<UnifiedOrderResult>): UnifiedOrderResult {
  const avg = o.avgPrice && parseFloat(o.avgPrice) > 0 ? parseFloat(o.avgPrice) : undefined;
  return {
    orderId: o.orderId,
    symbol: o.symbol,
    status: normStatus(o.orderStatus),
    side: normSide(o.side),
    type: o.orderType ?? fallback?.type ?? "Market",
    origQty: parseFloat(o.qty) || fallback?.origQty || 0,
    executedQty: o.cumExecQty ? parseFloat(o.cumExecQty) || 0 : 0,
    avgPrice: avg,
    raw: o,
  };
}

/** Look up a single order — realtime (open/conditional) first, then history. Returns null if absent. */
async function queryOrder(
  creds: ExchangeCredentials,
  symbol: string,
  orderId: string,
): Promise<BybitOrder | null> {
  for (const path of ["/v5/order/realtime", "/v5/order/history"]) {
    try {
      const r = await bybitRequest<{ list: BybitOrder[] }>(creds, "GET", path, {
        category: CATEGORY,
        symbol: symbol.toUpperCase(),
        orderId,
      });
      if (r.list && r.list.length > 0) return r.list[0];
    } catch {
      // try the next source
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Account / verification
// ─────────────────────────────────────────────────────────────────────────────

interface WalletList {
  list: Array<{ totalWalletBalance?: string; totalAvailableBalance?: string }>;
}

async function getWalletBalance(
  creds: ExchangeCredentials,
): Promise<{ total: number; available: number }> {
  for (const accountType of ["UNIFIED", "CONTRACT"]) {
    try {
      const r = await bybitRequest<WalletList>(creds, "GET", "/v5/account/wallet-balance", {
        accountType,
      });
      const row = r.list?.[0];
      if (row) {
        return {
          total: parseFloat(row.totalWalletBalance ?? "0") || 0,
          available: parseFloat(row.totalAvailableBalance ?? "0") || 0,
        };
      }
    } catch {
      // try the next account type
    }
  }
  return { total: 0, available: 0 };
}

interface ApiKeyInfo {
  readOnly: number;
  permissions: Record<string, string[]>;
}

async function getKeyPermissions(
  creds: ExchangeCredentials,
): Promise<{ canTrade: boolean; canWithdraw: boolean }> {
  const info = await bybitRequest<ApiKeyInfo>(creds, "GET", "/v5/user/query-api", {});
  const perms = info.permissions ?? {};
  const canTrade =
    (perms.ContractTrade?.length ?? 0) > 0 || (perms.Derivatives?.length ?? 0) > 0;
  // Bybit exposes a "Withdraw" permission under the Wallet group when enabled.
  const canWithdraw = (perms.Wallet ?? []).includes("Withdraw");
  return { canTrade, canWithdraw };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter
// ─────────────────────────────────────────────────────────────────────────────

export const bybitAdapter: ExchangeAdapter = {
  id: "bybit",

  async verifyCredentials(creds): Promise<KeyVerificationResult> {
    try {
      const [perms, wallet] = await Promise.all([
        getKeyPermissions(creds),
        getWalletBalance(creds),
      ]);
      return {
        valid: true,
        permissions: {
          canTrade: perms.canTrade,
          canDeposit: false,
          canWithdraw: perms.canWithdraw,
        },
        balance: wallet.total,
      };
    } catch (err) {
      return {
        valid: false,
        permissions: { canTrade: false, canDeposit: false, canWithdraw: false },
        balance: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async getAccount(creds): Promise<AccountInfo> {
    const [perms, wallet] = await Promise.all([
      getKeyPermissions(creds),
      getWalletBalance(creds),
    ]);
    return {
      canTrade: perms.canTrade,
      canDeposit: false,
      canWithdraw: perms.canWithdraw,
      totalWalletBalance: wallet.total,
      availableBalance: wallet.available,
    };
  },

  async setLeverage(creds, symbol, leverage): Promise<void> {
    try {
      await bybitRequest(creds, "POST", "/v5/position/set-leverage", {
        category: CATEGORY,
        symbol: symbol.toUpperCase(),
        buyLeverage: String(leverage),
        sellLeverage: String(leverage),
      });
    } catch (e) {
      // 110043 = "leverage not modified" — already at the requested value. Not an error.
      if ((e as Error & { code?: number }).code === 110043) return;
      throw e;
    }
  },

  async placeMarketOrder(creds, args: MarketOrderArgs): Promise<UnifiedOrderResult> {
    const symbol = args.symbol.toUpperCase();
    const created = await bybitRequest<{ orderId: string }>(creds, "POST", "/v5/order/create", {
      category: CATEGORY,
      symbol,
      side: args.side === "BUY" ? "Buy" : "Sell",
      orderType: "Market",
      qty: String(args.quantity),
      reduceOnly: args.reduceOnly ? true : undefined,
    });
    // Create returns only the id; query once to surface fill price/qty (entry slippage).
    const filled = await queryOrder(creds, symbol, created.orderId);
    if (filled) return toUnified(filled);
    return {
      orderId: created.orderId,
      symbol,
      status: "submitted",
      side: args.side,
      type: "Market",
      origQty: args.quantity,
      executedQty: 0,
      raw: created,
    };
  },

  async placeStopMarketOrder(creds, args: ProtectiveOrderArgs): Promise<UnifiedOrderResult> {
    return placeConditional(creds, args, "stop");
  },

  async placeTakeProfitMarketOrder(
    creds,
    args: ProtectiveOrderArgs,
  ): Promise<UnifiedOrderResult> {
    return placeConditional(creds, args, "take_profit");
  },

  async getOrder(creds, symbol, orderId): Promise<UnifiedOrderResult> {
    const o = await queryOrder(creds, symbol, orderId);
    if (!o) throw new Error(`Bybit 주문 조회 실패: ${orderId} 없음`);
    return toUnified(o);
  },

  async cancelOrder(creds, symbol, orderId) {
    await bybitRequest(creds, "POST", "/v5/order/cancel", {
      category: CATEGORY,
      symbol: symbol.toUpperCase(),
      orderId,
    });
    return { orderId, status: "canceled" };
  },
};

/**
 * Place a reduce-only conditional market order (stop-loss or take-profit).
 *
 * triggerDirection on Bybit: 1 = trigger when price RISES to triggerPrice,
 * 2 = when price FALLS. Derive it from the exit side + kind:
 *   - stop-loss, exit SELL (long position)  → stop is below → falls  → 2
 *   - stop-loss, exit BUY  (short position) → stop is above → rises  → 1
 *   - take-profit, exit SELL (long)         → target above  → rises  → 1
 *   - take-profit, exit BUY  (short)        → target below  → falls  → 2
 */
async function placeConditional(
  creds: ExchangeCredentials,
  args: ProtectiveOrderArgs,
  kind: "stop" | "take_profit",
): Promise<UnifiedOrderResult> {
  const symbol = args.symbol.toUpperCase();
  const exitIsSell = args.side === "SELL";
  const triggerDirection =
    kind === "stop" ? (exitIsSell ? 2 : 1) : exitIsSell ? 1 : 2;

  const created = await bybitRequest<{ orderId: string }>(creds, "POST", "/v5/order/create", {
    category: CATEGORY,
    symbol,
    side: args.side === "BUY" ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(args.quantity),
    triggerPrice: String(args.stopPrice),
    triggerDirection,
    triggerBy: "MarkPrice",
    reduceOnly: true,
    closeOnTrigger: true,
  });

  return {
    orderId: created.orderId,
    symbol,
    status: "open", // Untriggered conditional order
    side: args.side,
    type: kind === "stop" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET",
    origQty: args.quantity,
    executedQty: 0,
    raw: created,
  };
}
