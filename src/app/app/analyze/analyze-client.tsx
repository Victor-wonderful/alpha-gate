"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { X, Upload, History } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { runAnalysisAction, loadAnalysisAction } from "./_actions";
import { AnalysisResult } from "./analysis-result";
import { useAnalysisStore } from "@/lib/stores/analysis-store";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";

const PRESETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT"];
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export function AnalyzeClient(props: {
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
}) {
  return (
    <Suspense fallback={null}>
      <AnalyzeClientInner {...props} />
    </Suspense>
  );
}

function AnalyzeClientInner({
  accountSize,
  riskPct,
  currency,
}: {
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
}) {
  const [pending, startTransition] = useTransition();
  const [loadingFromHistory, setLoadingFromHistory] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadId = searchParams.get("load");

  // Persisted state (sessionStorage)
  const result = useAnalysisStore((s) => s.result);
  const setResult = useAnalysisStore((s) => s.setResult);
  const symbol = useAnalysisStore((s) => s.symbol);
  const custom = useAnalysisStore((s) => s.custom);
  const style = useAnalysisStore((s) => s.style);
  const setForm = useAnalysisStore((s) => s.setForm);
  const clearStore = useAnalysisStore((s) => s.clear);

  // Hydration: zustand persist may not have hydrated on first render
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Load past analysis when ?load=<id> is in URL
  useEffect(() => {
    if (!loadId) return;
    let cancelled = false;
    setLoadingFromHistory(true);
    (async () => {
      const r = await loadAnalysisAction(loadId);
      if (cancelled) return;
      if ("error" in r) {
        toast.error(r.error);
      } else {
        setResult({ snapshot: r.snapshot, strategy: r.strategy, report: r.report });
        toast.success("저장된 분석을 불러왔습니다.");
      }
      setLoadingFromHistory(false);
      // Clean URL — remove ?load param so reload doesn't re-fetch
      router.replace("/app/analyze");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadId]);

  // Transient (not persisted) — image is large and bound to one run
  const [image, setImage] = useState<{ dataUrl: string; mediaType: string; base64: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function setSymbol(v: string) {
    setForm({ symbol: v });
  }
  function setCustom(v: string) {
    setForm({ custom: v });
  }
  function setStyle(v: TradingStyle) {
    setForm({ style: v });
  }

  function onPickFile(file: File) {
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error("PNG / JPG / WEBP / GIF 이미지만 업로드 가능합니다.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("이미지 크기는 5MB 이하여야 합니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      setImage({ dataUrl, mediaType: file.type, base64 });
    };
    reader.onerror = () => toast.error("이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function run() {
    const target = (custom || symbol).toUpperCase().trim();
    if (!target) {
      toast.error("심볼을 선택하거나 입력하세요.");
      return;
    }
    startTransition(async () => {
      setResult(null);
      const r = await runAnalysisAction(
        target,
        style,
        image ? { mediaType: image.mediaType, base64: image.base64 } : undefined,
      );
      if (r.snapshot && r.strategy && r.report) {
        setResult({ snapshot: r.snapshot, strategy: r.strategy, report: r.report });
      }
      if (r.error) toast.error(r.error);
      else toast.success("분석 완료");
    });
  }

  function clearResult() {
    clearStore();
    toast.success("저장된 분석 결과를 비웠습니다.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>분석 대상</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
            <div>
              <label className="text-xs text-muted-foreground">프리셋</label>
              <Select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setCustom("");
                }}
              >
                {PRESETS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">또는 직접 입력</label>
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="예: ARBUSDT"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">트레이딩 스타일</label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(STYLE_PRESETS) as TradingStyle[]).map((s) => {
                const p = STYLE_PRESETS[s];
                const active = style === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    className={
                      "rounded-md border p-3 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background/40 hover:bg-accent/40")
                    }
                  >
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{p.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={run} disabled={pending} size="lg">
              {pending ? "분석 중... (10~20초)" : "분석 실행"}
            </Button>
          </div>
          <div className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">차트 이미지 (선택)</div>
                <div className="text-xs text-muted-foreground">
                  본인 차트(드로잉·커스텀 인디케이터 등)를 함께 올리면 AI가 보조 컨텍스트로 활용합니다.
                </div>
              </div>
              {image ? (
                <Button variant="ghost" size="sm" onClick={clearImage}>
                  <X className="h-4 w-4" />
                  제거
                </Button>
              ) : null}
            </div>
            {image ? (
              <div className="relative overflow-hidden rounded-md border border-border">
                <Image
                  src={image.dataUrl}
                  alt="차트 미리보기"
                  width={1200}
                  height={600}
                  className="h-auto w-full object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <label
                htmlFor="chart-upload"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/40 p-6 text-sm text-muted-foreground transition-colors hover:bg-accent/40"
              >
                <Upload className="h-4 w-4" />
                차트 이미지 업로드 (PNG / JPG / WEBP / GIF, 최대 5MB)
              </label>
            )}
            <input
              ref={fileRef}
              id="chart-upload"
              type="file"
              accept={ALLOWED_MIME.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            분석은 Binance 공개 API에서 다중 타임프레임 데이터를 가져온 뒤 Claude가 종합합니다.
            특정 매수/매도 추천이 아닌 시나리오 및 무효화 조건을 제시합니다.
          </p>
        </CardContent>
      </Card>

      {pending ? (
        <Card>
          <CardContent className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            데이터 수집 → AI 분석 중...
          </CardContent>
        </Card>
      ) : null}

      {loadingFromHistory ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            저장된 분석 불러오는 중...
          </CardContent>
        </Card>
      ) : null}

      {hydrated && result ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              저장된 분석 결과 표시 중 — {result.snapshot.symbol} ·{" "}
              {new Date(result.snapshot.generatedAt).toLocaleString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <button
              type="button"
              onClick={clearResult}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              결과 지우기
            </button>
          </div>
          <AnalysisResult
            snapshot={result.snapshot}
            strategy={result.strategy}
            report={result.report}
            accountSize={accountSize}
            riskPct={riskPct}
            currency={currency}
          />
        </>
      ) : null}
    </div>
  );
}
