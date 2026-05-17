"use client";

import { useRef, useState } from "react";
import { Download, FileImage, FileText, FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  buildAnalysisMarkdown,
  downloadFile,
  exportFilename,
} from "@/lib/analysis/export";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";
import type { AnalysisReport } from "@/lib/analysis/synthesize";
import type { StrategyResult } from "@/lib/analysis/strategy";

interface Props {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
  report: AnalysisReport;
  /** Ref to the full result container so we can capture it as PNG */
  captureRef: React.RefObject<HTMLElement | null>;
}

export function DownloadButtons({ snapshot, strategy, report, captureRef }: Props) {
  const [busyPng, setBusyPng] = useState(false);

  async function downloadPng() {
    if (!captureRef.current) {
      toast.error("캡처할 영역을 찾지 못했습니다.");
      return;
    }
    setBusyPng(true);
    try {
      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#0a0a0e",
        filter: (node) => {
          // Don't capture the download bar itself
          if (node instanceof HTMLElement && node.dataset.exportSkip === "true") return false;
          return true;
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = exportFilename(snapshot.symbol, "png");
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("PNG로 저장됨");
    } catch (e) {
      console.error(e);
      toast.error("PNG 캡처 실패");
    } finally {
      setBusyPng(false);
    }
  }

  function downloadMarkdown() {
    try {
      const md = buildAnalysisMarkdown({ snapshot, strategy, report });
      downloadFile(exportFilename(snapshot.symbol, "md"), "text/markdown;charset=utf-8", md);
      toast.success("Markdown으로 저장됨");
    } catch {
      toast.error("Markdown 생성 실패");
    }
  }

  function downloadJson() {
    try {
      const data = { snapshot, strategy, report };
      downloadFile(
        exportFilename(snapshot.symbol, "json"),
        "application/json;charset=utf-8",
        JSON.stringify(data, null, 2),
      );
      toast.success("JSON으로 저장됨");
    } catch {
      toast.error("JSON 생성 실패");
    }
  }

  return (
    <div
      data-export-skip="true"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-2 text-sm">
        <Download className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">결과 저장</span>
        <span className="text-xs text-muted-foreground">
          공유 · 노션 · 저널에 첨부
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadPng}
          disabled={busyPng}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/30 disabled:opacity-50"
        >
          {busyPng ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileImage className="h-3.5 w-3.5" />
          )}
          PNG (전체 페이지)
        </button>
        <button
          type="button"
          onClick={downloadMarkdown}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/30"
        >
          <FileText className="h-3.5 w-3.5" />
          Markdown
        </button>
        <button
          type="button"
          onClick={downloadJson}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/30"
        >
          <FileJson className="h-3.5 w-3.5" />
          JSON
        </button>
      </div>
    </div>
  );
}
