"use client";
import { useEffect, useState } from "react";

export function CountdownTimer({
  candleCloseTime,
  onExpired,
}: {
  candleCloseTime: number;
  onExpired: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((candleCloseTime - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = setInterval(() => {
      const r = Math.max(0, Math.ceil((candleCloseTime - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0) {
        clearInterval(tick);
        onExpired();
      }
    }, 500);
    return () => clearInterval(tick);
  }, [candleCloseTime, onExpired]);

  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <span className="font-mono tabular-nums text-lg font-bold">
      {mins}:{secs}
    </span>
  );
}
