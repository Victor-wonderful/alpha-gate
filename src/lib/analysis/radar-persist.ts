import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { RadarCandidate, RadarSignal, StyleFit } from "./radar";
import type { TradingStyle } from "./style";

/** 스캔 결과를 한 배치(동일 scanned_at)로 적재 + 오래된 배치 정리. service role 전용. */
export async function saveRadarScan(candidates: RadarCandidate[]): Promise<number> {
  const supabase = getSupabaseService();
  const scannedAt = new Date().toISOString();
  const payload = candidates.map((c) => ({
    symbol: c.symbol,
    score: c.score,
    signals: c.signals,
    best_style: c.bestStyle,
    style_fit: c.styleFit,
    trend: c.trend,
    trend_strength: c.trendStrength,
    range_low_pct: c.rangeLowPct,
    range_high_pct: c.rangeHighPct,
    price: c.price,
    change24h_pct: c.change24hPct,
    funding_rate: c.fundingRate,
    volume24h_usd: c.volume24hUsd,
    scanned_at: scannedAt,
  }));

  if (payload.length > 0) {
    const { error } = await supabase.from("radar_candidates").insert(payload);
    if (error) throw new Error(error.message);
  }

  // 2시간 이상 지난 배치 정리 (테이블 비대 방지).
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabase.from("radar_candidates").delete().lt("scanned_at", cutoff);

  return payload.length;
}

export interface RadarSnapshot {
  candidates: RadarCandidate[];
  scannedAt: string | null;
}

/** 최신 배치를 읽어 점수순으로 반환. 인증 사용자 RLS로 접근. */
export async function loadLatestRadar(): Promise<RadarSnapshot> {
  const supabase = await getSupabaseServer();

  const { data: latest } = await supabase
    .from("radar_candidates")
    .select("scanned_at")
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.scanned_at) return { candidates: [], scannedAt: null };

  const { data, error } = await supabase
    .from("radar_candidates")
    .select(
      "symbol, score, signals, best_style, style_fit, trend, trend_strength, range_low_pct, range_high_pct, price, change24h_pct, funding_rate, volume24h_usd",
    )
    .eq("scanned_at", latest.scanned_at)
    .order("score", { ascending: false });

  if (error || !data) return { candidates: [], scannedAt: latest.scanned_at };

  const candidates: RadarCandidate[] = data.map((r) => ({
    symbol: r.symbol as string,
    score: Number(r.score),
    signals: (r.signals as RadarSignal[]) ?? [],
    bestStyle: ((r.best_style as TradingStyle) ?? "swing"),
    styleFit: ((r.style_fit as StyleFit) ?? ({} as StyleFit)),
    trend: ((r.trend as "up" | "down" | "range") ?? "range"),
    trendStrength: ((r.trend_strength as "strong" | "moderate" | "weak") ?? "weak"),
    rangeLowPct: r.range_low_pct == null ? 0 : Number(r.range_low_pct),
    rangeHighPct: r.range_high_pct == null ? 0 : Number(r.range_high_pct),
    price: Number(r.price),
    change24hPct: Number(r.change24h_pct),
    fundingRate: Number(r.funding_rate),
    volume24hUsd: Number(r.volume24h_usd),
  }));

  return { candidates, scannedAt: latest.scanned_at };
}
