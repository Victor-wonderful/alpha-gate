import { getSupabaseServer } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { NotifyForm } from "./notify-form";

export default async function NotifySettingsPage() {
  const t = await getT();
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
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.notify.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.notify.description")}
        </p>
      </div>
      <NotifyForm initial={data} />
    </div>
  );
}
