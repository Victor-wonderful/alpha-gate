import "server-only";
import { getSupabaseServer } from "@/lib/supabase/server";

/** 실거래 잔액 캐시가 이보다 오래되면 stale 로 표시(재조회 유도). */
const BALANCE_STALE_MS = 10 * 60_000;

export type AccountMode = "real" | "virtual";

export interface EffectiveAccount {
  mode: AccountMode;
  /** 수동(분석 후 거래)에 쓸 유효 자금 = 전체 - 봇 배정. 결정 불가 시 fallback 10000. */
  accountSize: number;
  /** 전체 운영 자금(봇 배정 포함). 봉투 모델의 분모. */
  total: number;
  /** 자동매매 봇에 맡긴 금액(전체를 넘지 않게 clamp). */
  botAlloc: number;
  /** accountSize 를 신뢰할 수 있는가(실거래인데 잔액/배정 미설정이면 false). */
  resolved: boolean;
  /** 사용자 안내용 사유(미설정/잔액없음/stale 등). */
  note?: string;
  real: {
    allocType: "amount" | "pct";
    allocAmount: number | null;
    allocPct: number | null;
    balanceCached: number | null;
    balanceStale: boolean;
  };
  virtual: { capital: number };
}

const FALLBACK = 10000;

/**
 * 활성 모드 기준 "유효 자금"을 계산한다. 앱 전체(분석·거래·자금관리)의 단일 기준.
 *  - virtual: 가상 자금(default_account_size)
 *  - real   : 배정 방식에 따라 amount=min(배정액, 잔액) / pct=잔액×%
 */
export async function getEffectiveAccount(): Promise<EffectiveAccount> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const virtualCapital = FALLBACK;
  const base: EffectiveAccount = {
    mode: "virtual",
    accountSize: virtualCapital,
    total: virtualCapital,
    botAlloc: 0,
    resolved: true,
    real: { allocType: "amount", allocAmount: null, allocPct: null, balanceCached: null, balanceStale: true },
    virtual: { capital: virtualCapital },
  };
  if (!user) return base;

  // select("*") — bot_alloc_amount 컬럼이 아직 없어도(마이그 0048 적용 전) 깨지지 않게.
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  const vCap = Number(p?.default_account_size) || FALLBACK;
  const allocType = (p?.real_alloc_type as "amount" | "pct") ?? "amount";
  const allocAmount = p?.real_alloc_amount != null ? Number(p.real_alloc_amount) : null;
  const allocPct = p?.real_alloc_pct != null ? Number(p.real_alloc_pct) : null;
  const balanceCached = p?.real_balance_cached != null ? Number(p.real_balance_cached) : null;
  const cachedAt = p?.real_balance_cached_at ? new Date(p.real_balance_cached_at).getTime() : 0;
  // Date.now 는 서버 액션/RSC 컨텍스트라 사용 가능.
  const balanceStale = !cachedAt || Date.now() - cachedAt > BALANCE_STALE_MS;

  const mode = (p?.account_mode as AccountMode) ?? "virtual";
  const real = { allocType, allocAmount, allocPct, balanceCached, balanceStale };
  const virtual = { capital: vCap };
  const botAllocRaw = Number((p as { bot_alloc_amount?: number | null } | null)?.bot_alloc_amount) || 0;

  // 봉투 모델: 전체(total)를 먼저 구하고, 봇 몫을 뗀 나머지를 수동 자금(accountSize)으로.
  const split = (total: number, resolved: boolean, note?: string): EffectiveAccount => {
    const botAlloc = Math.min(Math.max(0, botAllocRaw), total);
    return { mode, accountSize: Math.max(0, total - botAlloc), total, botAlloc, resolved, note, real, virtual };
  };

  if (mode === "virtual") {
    return split(vCap, true);
  }

  // real 모드 — 배정액 계산
  let size: number | null = null;
  let note: string | undefined;
  if (balanceCached == null) {
    note = "실거래 잔액 미조회 — 설정에서 API 연결/잔액 갱신 필요";
  } else if (allocType === "amount") {
    if (allocAmount == null) note = "실거래 배정 금액 미설정";
    else size = Math.min(allocAmount, balanceCached); // 잔액 초과 배정 방지
  } else {
    if (allocPct == null) note = "실거래 배정 비율 미설정";
    else size = (balanceCached * allocPct) / 100;
  }

  if (size == null || !(size > 0)) {
    return split(FALLBACK, false, note ?? "실거래 자금 미설정");
  }
  return split(size, true, balanceStale ? "실거래 잔액이 오래됨 — 갱신 권장" : undefined);
}
