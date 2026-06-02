-- 분석 시간 텔레그램 알림 — 사용자가 받을 KST 시각(분누계)을 복수 선택.
-- 빈 배열 = 알림 꺼짐.
alter table notification_channels
  add column if not exists analysis_alert_times int[] not null default '{}';
