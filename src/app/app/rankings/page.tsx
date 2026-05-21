import { RankingsClient } from "./rankings-client";

export default function RankingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">랭킹</h1>
        <p className="text-sm text-muted-foreground mt-1">
          게임 · 트레이딩 · 통합 랭킹 · 매주 월요일 00:00 KST 상위 10명 보상 자동 지급
        </p>
      </div>
      <RankingsClient />
    </div>
  );
}
