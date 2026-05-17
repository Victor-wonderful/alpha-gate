import "server-only";
import type { MarketContext } from "@/types/trade";

const FAPI = "https://fapi.binance.com";

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Binance Futures에서 BTC 24h 변동률 + 심볼 펀딩비 + 다음 정산까지 시간.
 * 거래 평가 페이지의 "시장 컨텍스트" 블록에서 사용.
 */
export async function getMarketContext(symbol: string): Promise<MarketContext> {
  const empty: MarketContext = {
    btcPrice: null,
    btc24hChangePct: null,
    fundingRate: null,
    minutesToFunding: null,
  };

  try {
    const [btcTicker, premium] = await Promise.all([
      jget<{ lastPrice: string; priceChangePercent: string }>(
        `${FAPI}/fapi/v1/ticker/24hr?symbol=BTCUSDT`,
      ),
      jget<{ lastFundingRate: string; nextFundingTime: number }>(
        `${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`,
      ),
    ]);

    const nextFundingMs = Number(premium.nextFundingTime);
    const minutesToFunding = Number.isFinite(nextFundingMs)
      ? Math.max(0, Math.round((nextFundingMs - Date.now()) / 60_000))
      : null;

    return {
      btcPrice: Number(btcTicker.lastPrice) || null,
      btc24hChangePct: Number(btcTicker.priceChangePercent) || null,
      fundingRate: Number(premium.lastFundingRate),
      minutesToFunding,
    };
  } catch {
    return empty;
  }
}
