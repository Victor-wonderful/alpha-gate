"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { runRadarScan } from "@/lib/analysis/radar";
import { fetchAllTickers24h } from "@/lib/analysis/binance";
import {
  saveRadarScan,
  loadLatestRadar,
  type RadarSnapshot,
} from "@/lib/analysis/radar-persist";

/** 표시 중인 심볼들의 라이브 시세(현재가)만 가볍게 반환. bulk 티커 1콜.
 *  레이더 패널이 주기적으로 호출해 가격·변동률을 실시간 갱신한다. */
export async function getLiveQuotesAction(
  symbols: string[],
): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const want = new Set(symbols);
  try {
    const all = await fetchAllTickers24h();
    const out: Record<string, number> = {};
    for (const t of all) if (want.has(t.symbol)) out[t.symbol] = t.lastPrice;
    return out;
  } catch {
    return {};
  }
}

/** 최신 레이더 배치 읽기 (클라이언트 마운트 시 갱신용). */
export async function loadRadarAction(): Promise<RadarSnapshot> {
  return loadLatestRadar();
}

/**
 * 수동 스캔 트리거. 5분 이내 스캔이 있으면 재사용(남용·비용 방지).
 * 크론이 주기적으로 채우지만, 로컬/첫 사용 시 즉시 채우는 용도로도 쓴다.
 */
export async function refreshRadarAction(): Promise<RadarSnapshot & { error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { candidates: [], scannedAt: null, error: "로그인이 필요합니다." };

  const existing = await loadLatestRadar();
  if (
    existing.scannedAt &&
    Date.now() - new Date(existing.scannedAt).getTime() < 5 * 60 * 1000
  ) {
    return existing;
  }

  try {
    const candidates = await runRadarScan();
    await saveRadarScan(candidates);
    return await loadLatestRadar();
  } catch (e) {
    return { ...existing, error: e instanceof Error ? e.message : "스캔 실패" };
  }
}
