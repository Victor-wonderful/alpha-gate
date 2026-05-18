"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Bucket {
  icon: string;
  title: string;
  desc: string;
  items: string[];
}

const BUCKETS: Bucket[] = [
  {
    icon: "📈",
    title: "가격과 캔들 (3개 TF)",
    desc: "큰 흐름·셋업·트리거를 한 번에 보기 위해 3개 타임프레임을 동시에 분석.",
    items: [
      "HTF (큰 TF) — 시장 편향 (위로 갈지 아래로 갈지)",
      "MTF (중간 TF) — 셋업 위치 (어디서 진입할지)",
      "LTF (작은 TF) — 트리거 (정확한 진입 타이밍)",
      "ATR — 시장 변동성 (손절폭이 노이즈 대비 적절한지 판단)",
      "VWAP — 거래량 가중 평균가 (기관 진입 기준선)",
    ],
  },
  {
    icon: "🧱",
    title: "시장 구조",
    desc: "가격이 어디서 멈추고 돌아오는지를 찾는 객관 지표들.",
    items: [
      "스윙 고점/저점 — 추세 구조 (상승/하락/박스) 판정",
      "FVG (미체결 갭) — 가격이 다시 채우러 오는 경향",
      "Order Block — 강한 반전 직전의 마지막 캔들",
      "유동성 구역 — 청산 stop 주문 몰린 곳 (sweep 후 반전)",
      "Volume Profile (POC) — 거래량 중심 가격대 (단기 자석)",
      "주봉 Volume Profile — 큰 시간대 자석 (목표 설정 참고)",
    ],
  },
  {
    icon: "💰",
    title: "수급·포지셔닝 (실시간)",
    desc: "누가 더 많이 들어와있는지, 진짜 매수/매도 흐름은 어느 쪽인지.",
    items: [
      "호가창 (Order Book) — 매수/매도 벽, 스프레드, 임밸런스",
      "체결 흐름 (Order Flow) — 실제 시장가 매수 vs 매도, 대량 거래",
      "펀딩비 + 24h 추이 — 군집 형성 / 해소 방향",
      "미체결 약정 (OI) + 시간별 변화 — 신규 진입 vs 청산 판별",
      "상위 트레이더 롱/숏 비율 — 큰손 포지셔닝 (정보 비대칭)",
      "현물-선물 괴리 (Basis) — squeeze 신호",
    ],
  },
  {
    icon: "🌍",
    title: "거시 + 심리",
    desc: "개별 코인 너머의 큰 그림 + 시장 분위기.",
    items: [
      "24시간 시세 — 현재가·변동률·고저가·거래량",
      "BTC 도미넌스 — BTC 시총 비중 (알트 매매 필수)",
      "DXY (달러 인덱스) — BTC와 보통 역상관, 거시 risk-on/off",
      "Fear & Greed Index — 시장 심리 종합 (극단은 역방향 신호)",
      "거래 세션 (Asia/EU/US) — 변동성 시간대 컨텍스트",
    ],
  },
];

export function AnalysisInfo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">AI 분석은 어떤 데이터를 보나요?</span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Binance 공개 API에서 객관 데이터를 가져온 뒤, AI가 그 데이터를 해석해서
            시나리오를 만듭니다. AI가 가격을 창작하지 않습니다 — 객관 수치로만 판단.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {BUCKETS.map((b) => (
              <div key={b.title} className="rounded-md border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{b.icon}</span>
                  <span className="text-sm font-semibold">{b.title}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{b.desc}</p>
                <ul className="mt-2 space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {b.items.map((item, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-0.5 inline-block h-1 w-1 flex-none rounded-full bg-primary/60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">분석 파이프라인 (3단계)</strong>
            <ol className="mt-1 space-y-0.5">
              <li>① <strong className="text-foreground">데이터 수집</strong> — 위 데이터를 Binance/CoinGecko에서 병렬 fetch (코드로, 결정론적)</li>
              <li>② <strong className="text-foreground">전략 분류</strong> — 5개 전략(추세 눌림/돌파/박스 반전/반전/대기) 중 1개 선택</li>
              <li>③ <strong className="text-foreground">시나리오 생성</strong> — 선택된 전략 안에서 진입·손절·목표·트리거 도출</li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
