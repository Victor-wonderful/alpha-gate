"use client";

import { useEffect, useRef } from "react";
import type { Timeframe } from "@/types/trade";

const TF_MAP: Record<Timeframe, string> = { "15m": "15", "1h": "60", "4h": "240", "1D": "D" };

declare global {
  interface Window {
    TradingView?: { widget: new (config: Record<string, unknown>) => unknown };
  }
}

export function TradingViewWidget({ symbol, timeframe }: { symbol: string; timeframe: Timeframe }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const containerId = `tv_${Math.random().toString(36).slice(2)}`;
    ref.current.innerHTML = `<div id="${containerId}" style="height:100%;width:100%"></div>`;

    function mount() {
      if (!window.TradingView) return;
      new window.TradingView.widget({
        container_id: containerId,
        symbol: symbol.includes(":") ? symbol : `BINANCE:${symbol}`,
        interval: TF_MAP[timeframe],
        autosize: true,
        theme: "dark",
        style: "1",
        locale: "kr",
        timezone: "Asia/Seoul",
        hide_top_toolbar: false,
        hide_side_toolbar: true,
        withdateranges: false,
        allow_symbol_change: true,
        save_image: false,
      });
    }

    if (window.TradingView) {
      mount();
    } else {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = mount;
      document.head.appendChild(script);
    }
  }, [symbol, timeframe]);

  return <div ref={ref} className="h-[480px] w-full overflow-hidden rounded-lg border border-border" />;
}
