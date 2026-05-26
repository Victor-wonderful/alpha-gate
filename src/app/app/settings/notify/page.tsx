import { getSupabaseServer } from "@/lib/supabase/server";
import { NotifyForm } from "./notify-form";

export default async function NotifySettingsPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("notification_channels")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">알림 설정</h1>
        <p className="text-sm text-muted-foreground">
          텔레그램·디스코드로 D급 거래·연속 손실·AI 복기 완료, 그리고 시나리오 가격 도달 알림(분석 결과에서 🔔 등록한 시나리오 한정)을 받습니다. 한 번 등록하면 모든 알림이 같은 채널로 옵니다.
        </p>
      </div>
      <NotifyForm initial={data} />
    </div>
  );
}
