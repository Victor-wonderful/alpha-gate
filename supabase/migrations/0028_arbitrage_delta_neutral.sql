-- 0028_arbitrage_delta_neutral.sql
-- 김프 차익거래를 진짜 델타 중립으로 전환.
--
-- 기존 모델(0020~0022): 양쪽 거래소에 현물 코인 보유 (Upbit 롱 + Binance 롱).
--   → 코인 절대가 노출이 통째로 열려 있어 BTC 하락 시 손실. "차익거래"가 아님.
--
-- 새 모델: Upbit 현물 롱 + Binance 선물 숏.
--   → 현물 롱과 선물 숏이 상쇄되어 코인 가격 노출 = 0 (델타 중립).
--   → 수익 원천은 오직 김프(두 거래소 가격 괴리)의 진동.
--
-- inventory_coin_binance 의 의미가 "Binance 현물 보유량" → "Binance 선물 숏 수량" 으로
-- 바뀌므로 컬럼명을 short 으로 rename 하여 혼동을 막는다.
-- usdt_binance 는 공매도 현금흐름(증거금 + 매도 대금)을 담는 회계 계정으로 사용.

-- 1) Binance 다리: 현물 → 숏 수량 컬럼 rename
alter table arbitrage_positions
  rename column inventory_coin_binance to inventory_short_binance;

-- 2) 사이클 로그도 동일하게 rename
alter table arbitrage_cycles
  rename column binance_coin_after to binance_short_after;

-- 3) 기존 open kimchi 포지션은 회계 모델이 근본적으로 달라(현물 롱 vs 선물 숏)
--    그대로 두면 새 청산 공식으로 잘못 계산된다. 모델 전환 사유로 강제 종료한다.
--    (가상 거래 데이터 — 정산 PnL 은 0 으로 마감)
--
--    3a) 닫기 전에, 해당 포지션이 지갑에 잠가둔 마진(= 2 × notional)을 풀어준다.
--        풀지 않으면 used_margin 이 영구히 부풀려져 가용 잔액이 줄어든다.
update paper_wallets w
set used_margin = greatest(
      0,
      w.used_margin - coalesce((
        select sum(2 * p.notional_usd)
        from arbitrage_positions p
        where p.user_id = w.user_id
          and p.kind = 'kimchi'
          and p.status = 'open'
      ), 0)
    ),
    updated_at = now()
where exists (
  select 1 from arbitrage_positions p
  where p.user_id = w.user_id
    and p.kind = 'kimchi'
    and p.status = 'open'
);

--    3b) 포지션 강제 종료
update arbitrage_positions
set status = 'closed',
    closed_at = now(),
    close_reason = 'model_migration',
    realized_pnl = coalesce(realized_pnl, 0)
where kind = 'kimchi' and status = 'open';
