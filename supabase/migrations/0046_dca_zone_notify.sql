-- 밸류 존 알림 — "지금 싼 구간입니다" 를 판정이 바뀔 때만 보내기 위한 상태.
--
-- 매주 정기 매수는 금액만 기울이고(cheap 2배/중립 1배/비쌈 0.5배), "지금 진짜 싸다"
-- 싶을 때 추가로 담을지는 사용자가 정한다. 그 판단 시점을 알려주는 게 이 알림이다.
-- 매일 같은 문구를 보내면 소음이 되므로 직전 판정을 남겨 전이(→ cheap)에서만 발송한다.
--
-- cf. docs/DCA-모드-설계.md §5 · §10(B안을 알림+수동 매수로 제공)

ALTER TABLE dca_plans
  ADD COLUMN IF NOT EXISTS last_zone_verdict TEXT
    CHECK (last_zone_verdict IS NULL OR last_zone_verdict IN ('cheap', 'neutral', 'expensive')),
  ADD COLUMN IF NOT EXISTS zone_notified_at TIMESTAMPTZ;
