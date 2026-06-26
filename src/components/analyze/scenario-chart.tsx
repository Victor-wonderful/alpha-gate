"use client";

import { useEffect, useRef, useState } from "react";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
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

export function ScenarioChart({ snapshot, report, scenarioIndex }: Props) {
  const t = useT();
  const captureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
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
      addLine(entry, ENTRY_COLOR, "▶ " + t("analyze.cmpC.entry"), LineStyle.Solid, 3);
      addLine(sc.invalidation, STOP_COLOR, "✕ " + t("analyze.cmpC.stop"), LineStyle.Solid, 3);
      addLine(sc.target, TARGET_COLOR, "★ " + t("analyze.cmpC.target"), LineStyle.Solid, 3);
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
      a.download = `${snapshot.symbol}_${tfLabel}_${t("analyze.cmpC.scenarioFile", { letter: scenarioLetter })}_${new Date()
        .toISOString()
        .slice(0, 10)}.png`;
      a.href = dataUrl;
      a.click();
      toast.success(t("analyze.cmpC.pngSaved"));
    } catch {
      toast.error(t("analyze.cmpC.pngFailed"));
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
                        ? t("analyze.cmpC.tfHtf")
                        : r === "MTF"
                        ? t("analyze.cmpC.tfMtf")
                        : t("analyze.cmpC.tfLtf")
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
          <span className="text-muted-foreground">{t("analyze.cmpC.candleCount", { n: activeChart.candles.length })}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={downloadPng} disabled={downloading}>
          <Download className="h-3.5 w-3.5" />
          {downloading ? t("analyze.cmpC.saving") : t("analyze.cmpC.pngSave")}
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
                <span>{t("analyze.cmpC.scenarioLabel", { letter: String.fromCharCode(65 + scenarioIndex) })}</span>
                <span className={cn("text-xs", isLong ? "text-grade-a" : "text-grade-d")}>
                  · {isLong ? t("common.long") : t("common.short")}
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
            label={"▶ " + t("analyze.cmpC.entry")}
            value={`$${formatTick(entry)}`}
            sub={
              currentVsEntry === 0
                ? t("analyze.cmpC.currentSame")
                : t("analyze.cmpC.currentVsEntry", { pct: `${currentVsEntry > 0 ? "+" : ""}${currentVsEntry.toFixed(2)}` })
            }
            color={ENTRY_COLOR}
          />
          <SummaryCell
            label={"✕ " + t("analyze.cmpC.stop")}
            value={`$${formatTick(sc.invalidation)}`}
            sub={`-${stopDistPct.toFixed(2)}% (1R)`}
            color={STOP_COLOR}
          />
          <SummaryCell
            label={"★ " + t("analyze.cmpC.target")}
            value={`$${formatTick(sc.target)}`}
            sub={`+${targetDistPct.toFixed(2)}% (${rr.toFixed(1)}R)`}
            color={TARGET_COLOR}
          />
          <SummaryCell
            label={"📌 " + t("analyze.cmpC.trigger")}
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
