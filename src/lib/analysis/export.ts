import type { AnalysisSnapshot } from "./analyze";
import type { AnalysisReport } from "./synthesize";
import { STRATEGY_LABELS, type StrategyResult } from "./strategy";

const GRADE_LABEL: Record<string, string> = {
  A: "좋은 거래 (A)",
  B: "조건부 진입 (B)",
  C: "비추천 · 축소 (C)",
  D: "강한 자제 (D)",
};

export function buildAnalysisMarkdown(args: {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
  report: AnalysisReport;
}): string {
  const { snapshot, strategy, report } = args;
  const ts = new Date(snapshot.generatedAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const lines: string[] = [];
  lines.push(`# Alpha Gate 분석 — ${snapshot.symbol}`);
  lines.push("");
  lines.push(`- 분석 시각: ${ts} KST`);
  lines.push(`- 현재가: $${snapshot.ticker.last.toLocaleString("en-US")}`);
  lines.push(
    `- 24h 변동: ${snapshot.ticker.change24hPct >= 0 ? "+" : ""}${snapshot.ticker.change24hPct.toFixed(2)}%`,
  );
  lines.push(`- 트레이딩 스타일: ${snapshot.styleLabel}`);
  lines.push("");

  // AI Recommendation
  lines.push("## AI 추천");
  lines.push("");
  lines.push(`**${report.actionNow}**`);
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  // Strategy
  lines.push("## AI 전략 진단");
  lines.push("");
  lines.push(
    `- **전략**: ${STRATEGY_LABELS[strategy.primary]}${strategy.direction ? ` (${strategy.direction === "long" ? "롱" : "숏"})` : ""}`,
  );
  lines.push(`- **AI 자신감**: ${Math.round(strategy.confidence * 100)}%`);
  lines.push(`- **근거**: ${strategy.reasoning}`);
  if (strategy.rejected.length > 0) {
    lines.push("");
    lines.push("**제외된 전략**");
    for (const r of strategy.rejected) {
      lines.push(`- ${STRATEGY_LABELS[r.strategy] ?? r.strategy}: ${r.reason}`);
    }
  }
  lines.push("");

  // Scenarios
  if (report.scenarios.length > 0) {
    lines.push("## 시나리오");
    lines.push("");
    report.scenarios.forEach((s, i) => {
      const letter = String.fromCharCode(65 + i);
      const entry = (s.entryZone.low + s.entryZone.high) / 2;
      const stopPct = (Math.abs(entry - s.invalidation) / entry) * 100;
      const targetPct = (Math.abs(s.target - entry) / entry) * 100;
      const rr = Math.abs(s.target - entry) / Math.abs(entry - s.invalidation);

      const typeLabel =
        s.entryType === "immediate" ? " · 지금 진입 가능"
        : s.entryType === "pending" ? " · 도달 대기"
        : "";
      lines.push(`### 시나리오 ${letter} · ${s.direction === "long" ? "롱 (사기)" : "숏 (팔기)"}${typeLabel}`);
      lines.push("");
      lines.push(`**${s.name}**`);
      lines.push("");
      lines.push(`- **언제**: ${s.trigger}`);
      lines.push(
        `- **${s.direction === "long" ? "사는" : "파는"} 가격**: $${formatPrice(entry)} (영역 $${formatPrice(s.entryZone.low)} ~ $${formatPrice(s.entryZone.high)})`,
      );
      lines.push(`- **손절**: $${formatPrice(s.invalidation)} (-${stopPct.toFixed(2)}%, 1R)`);
      lines.push(
        `- **목표**: $${formatPrice(s.target)} (+${targetPct.toFixed(2)}%, ${rr.toFixed(2)}R)`,
      );
      lines.push("");
      lines.push(`${s.note}`);
      lines.push("");
    });
  } else {
    lines.push("## 시나리오");
    lines.push("");
    lines.push("> 현재 거래 우위 없음. 다음 셋업까지 관망 권장.");
    lines.push("");
  }

  // Key levels
  if (report.keyLevels.length > 0) {
    lines.push("## 핵심 가격대");
    lines.push("");
    lines.push("| 가격대 | 값 | 설명 |");
    lines.push("|--------|----|------|");
    for (const k of report.keyLevels) {
      lines.push(`| ${k.label} | $${formatPrice(k.price)} | ${k.note} |`);
    }
    lines.push("");
  }

  // Market state
  lines.push("## 시장 상태");
  lines.push("");
  lines.push(`- 최근 매수 비율: ${(snapshot.flow1m.buyRatio * 100).toFixed(1)}%`);
  lines.push(`- 펀딩비: ${snapshot.funding.bias}`);
  if (snapshot.macro.btcDominance != null)
    lines.push(`- BTC 도미넌스: ${snapshot.macro.btcDominance.toFixed(2)}%`);
  lines.push(`- 흐름 노트: ${report.flow.note}`);
  lines.push("");

  // Warnings
  if (report.warnings.length > 0) {
    lines.push("## 주의 사항");
    lines.push("");
    for (const w of report.warnings) lines.push(`- ⚠ ${w}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Alpha Gate — 본 분석은 투자 자문이 아닙니다. 모든 거래 결정과 결과는 본인의 책임입니다.*");

  return lines.join("\n");
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function downloadFile(filename: string, mimeType: string, content: string | Blob) {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(symbol: string, ext: "md" | "json" | "png"): string {
  const date = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 16);
  return `alpha-gate_${symbol}_${date}.${ext}`;
}
