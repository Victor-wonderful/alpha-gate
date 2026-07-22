-- 레이더 후보의 "예상 등급" — scan-radar 크론이 후보마다 봇과 동일 경로
-- (스냅샷 → 코드 시나리오 → gradeTrade, 사용자 무관 중립)로 계산해 저장한다.
-- 레이더 점수(진입 자리 근접·추세 랭킹)와 별개로, "이 셋업이 A/B/C/D 급인가"를
-- 클릭 전에 보여주기 위함. null = 계산 실패(스캔은 막지 않음, best-effort).
-- cf. lib/analysis/radar-grade.ts · api/cron/scan-radar

alter table radar_candidates
  add column if not exists grade text
    check (grade is null or grade in ('A', 'B', 'C', 'D'));
