-- 봇 배정 자금 (봉투 모델) — 전체 운영 자금 중 자동매매 봇에 "맡기는" 금액.
--
-- 지금까지는 default_account_size 하나를 봇과 수동(분석 후 거래)이 공유해서,
-- 한쪽에 입력하면 다른 쪽을 덮어쓰고 6% 위험 예산·마진을 선착순으로 다퉜다.
-- 이제 전체 자금(default_account_size) 안에서 봇 몫만 떼어준다:
--   봇 자금  = min(bot_alloc_amount, 전체)
--   수동 자금 = max(0, 전체 - bot_alloc_amount)
-- 두 지갑은 각자 자기 자금 기준으로 사이징·위험·마진을 계산 → 서로 안 뺏는다.
--
-- null/0 = 봇에 아무것도 안 맡김(봇은 발주 안 함, 수동이 전체를 씀) = 안전한 기본값.
-- cf. lib/account.ts getEffectiveAccount · lib/auto-trade.ts

alter table profiles
  add column if not exists bot_alloc_amount numeric
    check (bot_alloc_amount is null or bot_alloc_amount >= 0);

comment on column profiles.bot_alloc_amount is
  '자동매매 봇에 배정한 자금(USDT). 전체(default_account_size) 중 봇 몫. null/0 = 봇 미배정.';
