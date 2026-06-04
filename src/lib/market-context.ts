import "server-only";
import type { MarketContext } from "@/types/trade";

const FAPI = "https://fapi.binance.com";
const SAPI = "https://api.binance.com";

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

/** Symbol 현재가 — 선물(fapi) last price.
 *  신규/선물전용 코인(LAB·MAGMA 등)은 Binance 현물에 없어 Spot 조회가 404 → null이 된다.
 *  거래 평가는 무기한 선물 기준이므로 fapi를 1순위로, 실패 시에만 Spot 폴백. */
async function fetchSymbolPrice(symbol: string): Promise<number | null> {
  try {
    const t = await jget<{ price: string }>(`${FAPI}/fapi/v1/ticker/price?symbol=${symbol}`);
    const p = Number(t.price);
    if (Number.isFinite(p) && p > 0) return p;
  } catch {
    // fall through to spot
  }
  try {
    const t = await jget<{ price: string }>(`${SAPI}/api/v3/ticker/price?symbol=${symbol}`);
    const p = Number(t.price);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

/**
 * Binance Futures에서 BTC 24h 변동률 + 심볼 펀딩비 + 다음 정산까지 시간.
 * 거래 평가 페이지의 "시장 컨텍스트" 블록 + 시장가 진입 가격에 사용.
 */
export async function getMarketContext(symbol: string): Promise<MarketContext> {
  const empty: MarketContext = {
    btcPrice: null,
    btc24hChangePct: null,
    symbolPrice: null,
    fundingRate: null,
    minutesToFunding: null,
  };

  try {
    const [btcTicker, premium, symbolPrice] = await Promise.all([
      jget<{ lastPrice: string; priceChangePercent: string }>(
        `${FAPI}/fapi/v1/ticker/24hr?symbol=BTCUSDT`,
      ),
      jget<{ lastFundingRate: string; nextFundingTime: number }>(
        `${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`,
      ),
      fetchSymbolPrice(symbol),
    ]);

    const nextFundingMs = Number(premium.nextFundingTime);
    const minutesToFunding = Number.isFinite(nextFundingMs)
      ? Math.max(0, Math.round((nextFundingMs - Date.now()) / 60_000))
      : null;

    return {
      btcPrice: Number(btcTicker.lastPrice) || null,
      btc24hChangePct: Number(btcTicker.priceChangePercent) || null,
      symbolPrice,
      fundingRate: Number(premium.lastFundingRate),
      minutesToFunding,
    };
  } catch {
    // 펀딩/BTC가 실패해도 symbolPrice는 별도 fallback 시도
    const sp = await fetchSymbolPrice(symbol);
    return { ...empty, symbolPrice: sp };
  }
}
