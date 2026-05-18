-- 0003_backtest_mode.sql
-- 백테스트 모드 지원: trades / analyses 양쪽에 mode 컬럼 추가
-- live = 실시간 분석 / 라이브 거래
-- backtest = 과거 시점 시뮬레이션

-- =================== analyses ===================
alter table analyses
  add column if not exists mode text not null default 'live'
    check (mode in ('live', 'backtest')),
  add column if not exists historical_at timestamptz;
-- historical_at: 백테스트 모드일 때 "분석 시점" (사용자가 선택한 과거 시각)
-- live 모드는 NULL

create index if not exists idx_analyses_mode_user
  on analyses (user_id, mode, created_at desc);

-- =================== trades ===================
alter table trades
  add column if not exists mode text not null default 'live'
    check (mode in ('live', 'backtest')),
  add column if not exists simulated_at timestamptz,
  add column if not exists simulation_meta jsonb;
-- simulated_at: 백테스트 거래의 분석 시점 (analyses.historical_at 와 매칭)
-- simulation_meta: 시뮬레이션 결과 메타 (진입 캔들, 청산 캔들, 봉 수, 청산 사유 상세 등)
--   예: {"entry_candle_time": "...", "exit_candle_time": "...", "bars_held": 7,
--        "max_favorable_excursion_pct": 3.2, "max_adverse_excursion_pct": -1.1}

create index if not exists idx_trades_mode_user
  on trades (user_id, mode, created_at desc);

-- =================== comments ===================
comment on column analyses.mode is 'live = 실시간 분석, backtest = 과거 시점 시뮬레이션';
comment on column analyses.historical_at is '백테스트 모드일 때 분석 기준 시각 (live는 NULL)';
comment on column trades.mode is 'live = 실거래/수동 기록, backtest = 자동 시뮬 결과';
comment on column trades.simulated_at is '백테스트 거래의 분석 시점';
comment on column trades.simulation_meta is '시뮬레이션 상세 메타 (진입봉, 청산봉, MAE/MFE 등)';

-- RLS 정책은 기존 정책 그대로 적용 (user_id 기반 격리)
