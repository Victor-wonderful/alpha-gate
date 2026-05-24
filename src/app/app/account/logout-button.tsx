"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function LogoutButton() {
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
      {pending ? "로그아웃 중…" : "로그아웃"}
    </Button>
  );
}
