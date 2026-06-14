import { getSupabaseServer } from "@/lib/supabase/server";
import { ApiKeysClient } from "./api-keys-client";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: keys } = await supabase
    .from("exchange_api_keys")
    .select(
      "id, exchange, nickname, api_key_masked, permissions, verification_status, verification_error, last_verified_at, created_at",
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">거래소 API 키</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          등록된 키로 거래 실행에서 "거래 시작" 버튼이 실제 주문으로 연결됩니다. 출금 권한이
          켜진 키는 등록할 수 없으며, 모든 키는 AES-256-GCM으로 암호화되어 저장됩니다.
        </p>
      </div>
      <ApiKeysClient initial={keys ?? []} />
    </div>
  );
}
