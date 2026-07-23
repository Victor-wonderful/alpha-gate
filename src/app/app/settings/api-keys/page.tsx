import { getSupabaseServer } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { ApiKeysClient } from "./api-keys-client";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const t = await getT();
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: keys } = await supabase
    .from("exchange_api_keys")
    .select(
      "id, exchange, nickname, testnet, api_key_masked, permissions, verification_status, verification_error, last_verified_at, created_at",
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.apiKeys.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.apiKeys.description")}
        </p>
      </div>
      <ApiKeysClient initial={keys ?? []} />
    </div>
  );
}
