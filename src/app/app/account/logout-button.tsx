"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function LogoutButton() {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await getSupabaseBrowser().auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      onClick={onClick}
      disabled={pending}
    >
      <LogOut className="mr-2 h-4 w-4" />
      {pending ? t("acct.loggingOut") : t("acct.logout")}
    </Button>
  );
}
