"use client";

import { useEffect, useRef, useState } from "react";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";
import type { AnalysisReport } from "@/lib/analysis/synthesize";

interface Props {
  snapshot: AnalysisSnapshot;
  report: AnalysisReport;
  scenarioIndex: number;
}

const STOP_COLOR = "hsl(0 84% 60%)";
const TARGET_COLOR = "hsl(142 71% 45%)";
const ENTRY_COLOR = "hsl(199 89% 56%)";
const POC_COLOR = "hsl(38 92% 50%)";
const SWING_COLOR = "hsl(240 5% 64.9%)";

type ChartRole = "HTF" | "MTF" | "LTF";

/** 캔들 배열에서 주어진 Unix 초 시각에 가장 가까운(≤) 봉 찾기 */
function findNearestBar<T extends { time: number }>(bars: readonly T[], target: number): T | null {
  if (bars.length === 0) return null;
  // 시간순 정렬됐다고 가정 — 이진 탐색
  let lo = 0;
  let hi = bars.length - 1;
  let best: T | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= target) {
      best = bars[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function ScenarioChart({ snapshot, report, scenarioIndex }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [role, setRole] = useState<ChartRole>("MTF");

  const sc = report.scenarios[scenarioIndex];
  const isLong = sc?.direction === "long";

  // Resolve active TF + candles. Falls back to legacy mtfChart for older saved analyses without byRole.
  const byRole = snapshot.mtfChart.byRole;
  const activeChart = byRole
    ? byRole[role]
    : { tf: snapshot.mtfChart.tf, candles: snapshot.mtfChart.candles };
  const tfLabel = activeChart.tf.toUpperCase();
  const hasToggle = !!byRole;

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "hsl(220 9% 55%)",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "hsl(222 12% 16%)" },
        horzLines: { color: "hsl(222 12% 16%)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "hsl(222 12% 16%)" },
      timeScale: { borderColor: "hsl(222 12% 16%)", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "hsl(142 71% 45%)",
      downColor: "hsl(0 84% 60%)",
      borderUpColor: "hsl(142 71% 45%)",
      borderDownColor: "hsl(0 84% 60%)",
      wickUpColor: "hsl(142 71% 45%)",
      wickDownColor: "hsl(0 84% 60%)",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      try {
        chart.remove();
      } catch {
        // already disposed
      }
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Set candle data when active TF / snapshot changes
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = activeChart.candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    try {
      series.setData(data);
      chart.timeScale().fitContent();
    } catch {
      // chart disposed mid-update; safe to ignore
    }
  }, [activeChart.candles]);

  // Manage overlays — context + scenario lines
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const lines: ReturnType<typeof series.createPriceLine>[] = [];
    const addLine = (
      price: number,
      color: string,
      title: string,
      style: LineStyle = LineStyle.Solid,
      width: 1 | 2 | 3 | 4 = 2,
      labelVisible = true,
    ) => {
      try {
        const line = series.createPriceLine({
          price,
          color,
          lineWidth: width,
          lineStyle: style,
          axisLabelVisible: labelVisible,
          title,
        });
        lines.push(line);
      } catch {
        // chart disposed
      }
    };

    // Context — MTF structure (faint guides, no axis labels to reduce clutter)
    const mtf = snapshot.multiTf.find((t) => t.role === "MTF");
    if (mtf?.lastSwingHigh != null)
      addLine(mtf.lastSwingHigh, SWING_COLOR, "", LineStyle.Dashed, 1, false);
    if (mtf?.lastSwingLow != null)
      addLine(mtf.lastSwingLow, SWING_COLOR, "", LineStyle.Dashed, 1, false);
    addLine(snapshot.volumeProfile.poc, POC_COLOR, "POC", LineStyle.Dotted, 1);

    // Scenario — only 3 labels on axis: entry, stop, target. Zone bounds visual only.
    if (sc) {
      const entry = (sc.entryZone.low + sc.entryZone.high) / 2;
      // Entry zone bounds: dashed guides, NO axis labels (avoid clutter)
      addLine(sc.entryZone.high, ENTRY_COLOR, "", LineStyle.Dashed, 1, false);
      addLine(sc.entryZone.low, ENTRY_COLOR, "", LineStyle.Dashed, 1, false);
      // Main 3 lines with short labels (price shown in axis already, so label is just identifier)
      addLine(entry, ENTRY_COLOR, "▶ 진입", LineStyle.Solid, 3);
      addLine(sc.invalidation, STOP_COLOR, "✕ 손절", LineStyle.Solid, 3);
      addLine(sc.target, TARGET_COLOR, "★ 목표", LineStyle.Solid, 3);
    }

    return () => {
      for (const l of lines) {
        try {
          series.removePriceLine(l);
        } catch {
          // chart already disposed
        }
      }
    };
  }, [snapshot, sc]);

  // 백테스트 시뮬 결과 마커 — 진입/청산 시점을 차트 위에 표시
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // 기존 마커 정리
    if (markersRef.current) {
      try {
        markersRef.current.detach();
      } catch {
        // already disposed
      }
      markersRef.current = null;
    }

    const sim = sc?.simulation;
    const boundary = snapshot.mtfChart?.boundaryTime;
    const candles = activeChart.candles;

    const markers: SeriesMarker<Time>[] = [];

    // 분석 ↔ forward 경계 마커 (백테스트만)
    if (boundary && candles.length > 0) {
      // 경계 시각에 가장 가까운 봉을 찾기 (≤ boundary)
      let boundaryBar: typeof candles[number] | null = null;
      for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i].time <= boundary) {
          boundaryBar = candles[i];
          break;
        }
      }
      if (boundaryBar) {
        markers.push({
          time: boundaryBar.time as Time,
          position: "inBar",
          color: "hsl(199 89% 56%)",
          shape: "circle",
          text: "📍 분석 시점",
          size: 1,
        });
      }
    }

    if (sim && sim.entryAt) {
      const isLongDir = sc!.direction === "long";
      const isWin = sim.resultR > 0;

      // 진입 마커
      const entryTimeMs = new Date(sim.entryAt).getTime();
      const entryBar = findNearestBar(candles, Math.floor(entryTimeMs / 1000));
      if (entryBar) {
        markers.push({
          time: entryBar.time as Time,
          position: isLongDir ? "belowBar" : "aboveBar",
          color: ENTRY_COLOR,
          shape: isLongDir ? "arrowUp" : "arrowDown",
          text: `진입 $${formatNumber(sim.entryFillPrice)}`,
          size: 2,
        });
      }

      // 청산 마커
      if (sim.exitAt && sim.exitReason !== "no_entry") {
        const exitTimeMs = new Date(sim.exitAt).getTime();
        const exitBar = findNearestBar(candles, Math.floor(exitTimeMs / 1000));
        if (exitBar) {
          const exitColor =
            sim.exitReason === "target"
              ? TARGET_COLOR
              : sim.exitReason === "stop"
                ? STOP_COLOR
                : "hsl(38 92% 50%)";
          const exitLabel =
            sim.exitReason === "target"
              ? `🎯 목표 $${formatNumber(sim.exitPrice)}`
              : sim.exitReason === "stop"
                ? `✕ 손절 $${formatNumber(sim.exitPrice)}`
                : `⏱ 시간 만료 $${formatNumber(sim.exitPrice)}`;
          markers.push({
            time: exitBar.time as Time,
            position: isLongDir ? "aboveBar" : "belowBar",
            color: exitColor,
            shape: isWin ? "circle" : "square",
            text: exitLabel,
            size: 2,
          });
        }
      }
    }

    if (markers.length === 0) return; // 보여줄 마커 없음

    // 시간순 정렬 (lightweight-charts 요구사항)
    markers.sort((a, b) => (a.time as number) - (b.time as number));

    try {
      markersRef.current = createSeriesMarkers(series, markers);
    } catch {
      // chart disposed
    }

    return () => {
      if (markersRef.current) {
        try {
          markersRef.current.detach();
        } catch {
          // already disposed
        }
        markersRef.current = null;
      }
    };
  }, [sc, snapshot.mtfChart?.boundaryTime, activeChart.candles]);

  async function downloadPng() {
    if (!captureRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0b0e14",
      });
      const a = document.createElement("a");
      const scenarioLetter = String.fromCharCode(65 + scenarioIndex);
      a.download = `${snapshot.symbol}_${tfLabel}_시나리오${scenarioLetter}_${new Date()
        .toISOString()
        .slice(0, 10)}.png`;
      a.href = dataUrl;
      a.click();
      toast.success("차트 이미지를 저장했습니다.");
    } catch {
      toast.error("이미지 저장에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  const entry = sc ? (sc.entryZone.low + sc.entryZone.high) / 2 : 0;
  const rr = sc ? Math.abs(sc.target - entry) / Math.abs(entry - sc.invalidation) : 0;
  const stopDistPct = sc ? (Math.abs(entry - sc.invalidation) / entry) * 100 : 0;
  const targetDistPct = sc ? (Math.abs(sc.target - entry) / entry) * 100 : 0;
  const currentVsEntry = sc
    ? ((snapshot.ticker.last - entry) / entry) * 100
    : 0;

  return (
    <div className="space-y-3">
      {/* Toolbar — symbol + TF toggle + download */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono font-semibold text-foreground">
            {snapshot.symbol}
          </span>
          {hasToggle ? (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/40 p-0.5">
              {(["HTF", "MTF", "LTF"] as ChartRole[]).map((r) => {
                const active = role === r;
                const tf = byRole![r].tf.toUpperCase();
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    title={
                      r === "HTF"
                        ? "Higher TF — 큰 추세 편향"
                        : r === "MTF"
                        ? "Mid TF — 셋업 잡는 TF (기본)"
                        : "Lower TF — 트리거 확인"
                    }
                    className={cn(
                      "rounded px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    <span className="mr-0.5 text-[9px] opacity-70">{r}</span>
                    {tf}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-mono font-semibold text-primary">
              {tfLabel}
            </span>
          )}
          <span className="text-muted-foreground">· 캔들 {activeChart.candles.length}개</span>
        </div>
        <Button variant="ghost" size="sm" onClick={downloadPng} disabled={downloading}>
          <Download className="h-3.5 w-3.5" />
          {downloading ? "저장 중..." : "PNG 저장"}
        </Button>
      </div>

      <div ref={captureRef} className="space-y-3 rounded-md bg-card/30 p-2">
      <div className="relative">
        {/* Direction badge overlay — top-left */}
        {sc ? (
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 backdrop-blur-md shadow-lg">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md text-white shadow-sm",
                isLong ? "bg-grade-a" : "bg-grade-d",
              )}
            >
              {isLong ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            </span>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-bold leading-tight">
                <span>시나리오 {String.fromCharCode(65 + scenarioIndex)}</span>
                <span className={cn("text-xs", isLong ? "text-grade-a" : "text-grade-d")}>
                  · {isLong ? "롱" : "숏"}
                </span>
                <span className="ml-1 rounded border border-border bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {tfLabel}
                </span>
              </div>
              <div className="mt-0.5 max-w-[260px] truncate text-[10px] text-muted-foreground">
                {sc.name}
              </div>
            </div>
          </div>
        ) : null}

        <div
          ref={containerRef}
          className="h-[480px] w-full overflow-hidden rounded-md border border-border bg-card/30"
        />
      </div>

      {/* Summary strip — entry/stop/target with distances */}
      {sc ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCell
            label="▶ 진입"
            value={`$${formatTick(entry)}`}
            sub={
              currentVsEntry === 0
                ? "현재가 동일"
                : `현재가 대비 ${currentVsEntry > 0 ? "+" : ""}${currentVsEntry.toFixed(2)}%`
            }
            color={ENTRY_COLOR}
          />
          <SummaryCell
            label="✕ 손절"
            value={`$${formatTick(sc.invalidation)}`}
            sub={`-${stopDistPct.toFixed(2)}% (1R)`}
            color={STOP_COLOR}
          />
          <SummaryCell
            label="★ 목표"
            value={`$${formatTick(sc.target)}`}
            sub={`+${targetDistPct.toFixed(2)}% (${rr.toFixed(1)}R)`}
            color={TARGET_COLOR}
          />
          <SummaryCell
            label="📌 트리거"
            value={sc.trigger}
            valueClass="text-xs font-medium leading-snug"
            sub=""
            color="hsl(220 9% 55%)"
          />
        </div>
      ) : null}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  color,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color }}>
        <span>{label}</span>
      </div>
      <div className={cn("mt-1 font-mono text-base font-bold leading-tight", valueClass)}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function formatTick(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return formatNumber(n, { maximumFractionDigits: 0 });
  if (n >= 1) return formatNumber(n, { maximumFractionDigits: 2 });
  return formatNumber(n, { maximumFractionDigits: 6 });
}
