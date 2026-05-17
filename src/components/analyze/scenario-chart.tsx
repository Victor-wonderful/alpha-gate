"use client";

import { useEffect, useRef } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
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

export function ScenarioChart({ snapshot, report, scenarioIndex }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const sc = report.scenarios[scenarioIndex];
  const isLong = sc?.direction === "long";

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

  // Set candle data when snapshot changes
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = snapshot.mtfChart.candles.map((c) => ({
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
  }, [snapshot.mtfChart.candles]);

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
    ) => {
      try {
        const line = series.createPriceLine({
          price,
          color,
          lineWidth: width,
          lineStyle: style,
          axisLabelVisible: true,
          title,
        });
        lines.push(line);
      } catch {
        // chart disposed
      }
    };

    // Context — MTF structure (faint, plain Korean labels)
    const mtf = snapshot.multiTf.find((t) => t.role === "MTF");
    if (mtf?.lastSwingHigh != null)
      addLine(mtf.lastSwingHigh, SWING_COLOR, `최근 고점`, LineStyle.Dashed, 1);
    if (mtf?.lastSwingLow != null)
      addLine(mtf.lastSwingLow, SWING_COLOR, `최근 저점`, LineStyle.Dashed, 1);
    addLine(snapshot.volumeProfile.poc, POC_COLOR, "거래량 중심", LineStyle.Dotted, 1);

    // Scenario — bold + clear labels
    if (sc) {
      const entry = (sc.entryZone.low + sc.entryZone.high) / 2;
      addLine(sc.entryZone.high, ENTRY_COLOR, "진입 상단", LineStyle.Dashed, 1);
      addLine(sc.entryZone.low, ENTRY_COLOR, "진입 하단", LineStyle.Dashed, 1);
      addLine(entry, ENTRY_COLOR, `▶ 진입 ${formatTick(entry)}`, LineStyle.Solid, 3);
      addLine(sc.invalidation, STOP_COLOR, `✕ 손절 ${formatTick(sc.invalidation)}`, LineStyle.Solid, 3);
      addLine(sc.target, TARGET_COLOR, `★ 목표 ${formatTick(sc.target)}`, LineStyle.Solid, 3);
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

  const entry = sc ? (sc.entryZone.low + sc.entryZone.high) / 2 : 0;
  const rr = sc ? Math.abs(sc.target - entry) / Math.abs(entry - sc.invalidation) : 0;
  const stopDistPct = sc ? (Math.abs(entry - sc.invalidation) / entry) * 100 : 0;
  const targetDistPct = sc ? (Math.abs(sc.target - entry) / entry) * 100 : 0;
  const currentVsEntry = sc
    ? ((snapshot.ticker.last - entry) / entry) * 100
    : 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        {/* Direction badge overlay — top-left */}
        {sc ? (
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 backdrop-blur-md shadow-lg">
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
