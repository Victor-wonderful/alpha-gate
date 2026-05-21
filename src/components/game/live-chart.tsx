"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts";

type Timeframe = "1m" | "3m";

interface Props {
  symbol: string;
  timeframe?: Timeframe;
  entryPrice?: number | null;
  direction?: "call" | "put" | null;
  onCurrentPrice?: (p: number) => void;
}

export function LiveChart({
  symbol,
  timeframe = "1m",
  entryPrice,
  direction,
  onCurrentPrice,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLineRef = useRef<ReturnType<
    ISeriesApi<"Candlestick">["createPriceLine"]
  > | null>(null);
  const onCurrentPriceRef = useRef(onCurrentPrice);

  useEffect(() => {
    onCurrentPriceRef.current = onCurrentPrice;
  }, [onCurrentPrice]);

  // 차트 초기화 — symbol 또는 timeframe 변경 시 재생성
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3af",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.06)" },
        horzLines: { color: "rgba(148, 163, 184, 0.06)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "rgba(148, 163, 184, 0.15)",
        rightOffset: 5,
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      priceLineRef.current = null;
      seriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [symbol, timeframe]);

  // 캔들 데이터 폴링 (3초마다)
  useEffect(() => {
    let alive = true;

    async function fetchCandles() {
      try {
        const res = await fetch(
          `/api/binary/klines?symbol=${symbol}&interval=${timeframe}&limit=60`,
        );
        const data = await res.json();
        if (!alive || !seriesRef.current || !Array.isArray(data.candles)) return;

        const candles = data.candles as Array<{
          time: number;
          open: number;
          high: number;
          low: number;
          close: number;
        }>;

        seriesRef.current.setData(
          candles.map(
            (c): CandlestickData => ({
              time: c.time as Time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }),
          ),
        );

        const latest = candles[candles.length - 1];
        if (latest) onCurrentPriceRef.current?.(latest.close);
      } catch {
        // 네트워크 오류 무시
      }
    }

    fetchCandles();
    const id = setInterval(fetchCandles, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, timeframe]);

  // 진입가 수평 점선
  useEffect(() => {
    if (!seriesRef.current) return;
    if (priceLineRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (entryPrice && direction) {
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: entryPrice,
        color: direction === "call" ? "#22c55e" : "#ef4444",
        lineWidth: 2,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `진입가 ${direction === "call" ? "▲" : "▼"}`,
      });
    }
  }, [entryPrice, direction]);

  return <div ref={containerRef} className="h-full w-full" />;
}
