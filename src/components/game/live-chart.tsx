"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

interface Props {
  symbol: string;
  entryPrice?: number | null;
  entryTime?: number | null; // ms
  candleCloseTime?: number | null;
  direction?: "call" | "put" | null;
  onCurrentPrice?: (p: number) => void;
}

export function LiveChart({
  symbol,
  entryPrice,
  candleCloseTime,
  direction,
  onCurrentPrice,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLineRef = useRef<ReturnType<
    ISeriesApi<"Line">["createPriceLine"]
  > | null>(null);
  const expiryLineRef = useRef<ReturnType<
    ISeriesApi<"Line">["createPriceLine"]
  > | null>(null);
  const onCurrentPriceRef = useRef(onCurrentPrice);

  // 콜백 ref 최신 유지
  useEffect(() => {
    onCurrentPriceRef.current = onCurrentPrice;
  }, [onCurrentPrice]);

  // 차트 초기화
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
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: "rgba(148, 163, 184, 0.15)",
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      crosshair: { mode: 0 },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lineType: 0,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // 초기 현재가 1포인트
    fetch(`/api/binary/ticker?symbol=${symbol}`)
      .then((r) => r.json())
      .then((data) => {
        if (!seriesRef.current) return;
        const now = Math.floor(Date.now() / 1000);
        seriesRef.current.setData([{ time: now as never, value: data.price }]);
        onCurrentPriceRef.current?.(data.price as number);
      })
      .catch(() => {});

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
      // priceLineRef / expiryLineRef cleanup은 series가 사라지므로 그냥 null 처리
      priceLineRef.current = null;
      expiryLineRef.current = null;
      seriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [symbol]); // symbol 바뀌면 차트 재초기화

  // 가격 폴링 (3초마다)
  useEffect(() => {
    let alive = true;

    async function fetchTick() {
      try {
        const res = await fetch(`/api/binary/ticker?symbol=${symbol}`);
        const data = await res.json();
        if (!alive || !seriesRef.current) return;
        const now = Math.floor(Date.now() / 1000);
        seriesRef.current.update({ time: now as never, value: data.price as number });
        onCurrentPriceRef.current?.(data.price as number);
      } catch {
        // 네트워크 오류 무시
      }
    }

    fetchTick();
    const id = setInterval(fetchTick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol]);

  // 진입가 수평선 + 만기선
  const updatePriceLines = useCallback(() => {
    if (!seriesRef.current) return;

    // 진입가 라인
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

    // 만기선 (현재가와 유사한 수준에 표시 — 시간선은 API 제한으로 가격선으로 대체)
    if (expiryLineRef.current) {
      seriesRef.current.removePriceLine(expiryLineRef.current);
      expiryLineRef.current = null;
    }
  }, [entryPrice, direction]);

  useEffect(() => {
    updatePriceLines();
  }, [updatePriceLines]);

  // 만기 도달 시 점선 제거 (정산 후 시각 정리)
  useEffect(() => {
    if (!candleCloseTime) return;
    const remaining = candleCloseTime - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => {
      if (priceLineRef.current && seriesRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }
    }, remaining + 3000);
    return () => clearTimeout(id);
  }, [candleCloseTime]);

  return <div ref={containerRef} className="h-full w-full" />;
}
