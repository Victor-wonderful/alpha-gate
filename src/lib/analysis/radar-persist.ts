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
    grade: c.grade ?? null,
    signals: c.signals,
    best_style: c.bestStyle,
    style_fit: c.styleFit,
    style_atr: c.styleAtr,
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

type SupabaseLike = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 최신 배치를 읽어 점수순으로 반환.
 *
 * 기본은 인증 사용자 세션(쿠키)으로 접근한다(radar_candidates RLS = authenticated 전용).
 * 세션이 없는 컨텍스트(크론 등)에서는 service role 클라이언트를 주입해야 한다 —
 * 안 그러면 anon 으로 RLS 에 막혀 빈 결과가 오고, 봇이 "후보 없음"으로 조용히 멈춘다.
 */
export async function loadLatestRadar(client?: SupabaseLike): Promise<RadarSnapshot> {
  const supabase = client ?? (await getSupabaseServer());

  const { data: latest } = await supabase
    .from("radar_candidates")
    .select("scanned_at")
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.scanned_at) return { candidates: [], scannedAt: null };

  const { data, error } = await supabase
    .from("radar_candidates")
    // select("*") — grade 컬럼(마이그 0049)이 아직 없어도 로드가 깨지지 않게(=> grade null).
    .select("*")
    .eq("scanned_at", latest.scanned_at)
    .order("score", { ascending: false });

  if (error || !data) return { candidates: [], scannedAt: latest.scanned_at };

  const candidates: RadarCandidate[] = (data as Record<string, unknown>[]).map((r) => ({
    symbol: r.symbol as string,
    score: Number(r.score),
    grade: (r.grade as string | null) ?? null,
    signals: (r.signals as RadarSignal[]) ?? [],
    bestStyle: ((r.best_style as TradingStyle) ?? "swing"),
    styleFit: ((r.style_fit as StyleFit) ?? ({} as StyleFit)),
    styleAtr: ((r.style_atr as StyleFit) ?? ({} as StyleFit)),
    trend: ((r.trend as "up" | "down" | "range") ?? "range"),
    trendStrength: ((r.trend_strength as "strong" | "moderate" | "weak") ?? "weak"),
    // 권장 방향은 trend+strength에서 파생(별도 컬럼 불필요).
    suggestedDirection:
      (r.trend === "up" || r.trend === "down") && r.trend_strength !== "weak"
        ? r.trend === "up"
          ? "long"
          : "short"
        : null,
    rangeLowPct: r.range_low_pct == null ? 0 : Number(r.range_low_pct),
    rangeHighPct: r.range_high_pct == null ? 0 : Number(r.range_high_pct),
    price: Number(r.price),
    change24hPct: Number(r.change24h_pct),
    fundingRate: Number(r.funding_rate),
    volume24hUsd: Number(r.volume24h_usd),
  }));

  return { candidates, scannedAt: latest.scanned_at };
}
