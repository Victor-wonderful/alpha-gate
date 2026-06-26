"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowUp, ArrowDown } from "lucide-react";
import type { AdminUserRow } from "@/lib/admin/data";
import { Input } from "@/components/ui/input";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

type SortKey = "createdAt" | "usdtBalance" | "aiCredits" | "analysesCount" | "tradesCount";
type StatusFilter = "all" | "active" | "disabled";

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("admin.tabAll") },
    { key: "active", label: t("admin.statusActive") },
    { key: "disabled", label: t("admin.statusDisabled") },
  ];

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = users;
    if (term) {
      rows = rows.filter(
        (u) =>
          u.email.toLowerCase().includes(term) ||
          (u.displayName ?? "").toLowerCase().includes(term),
      );
    }
    if (status === "active") rows = rows.filter((u) => !u.disabled);
    else if (status === "disabled") rows = rows.filter((u) => u.disabled);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av: number;
      let bv: number;
      if (sortKey === "createdAt") {
        av = new Date(a.createdAt).getTime();
        bv = new Date(b.createdAt).getTime();
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      return (av - bv) * dir;
    });
  }, [q, status, sortKey, sortDir, users]);

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card/40 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                status === t.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">{t("admin.colUser")}</th>
              <th className="px-3 py-2.5 text-right font-medium">
                <SortHeader label="vUSDT" k="usdtBalance" />
              </th>
              <th className="px-3 py-2.5 text-right font-medium">
                <SortHeader label={t("admin.colCredits")} k="aiCredits" />
              </th>
              <th className="px-3 py-2.5 text-right font-medium">
                <SortHeader label={t("admin.colAnalyses")} k="analysesCount" />
              </th>
              <th className="px-3 py-2.5 text-right font-medium">
                <SortHeader label={t("admin.colTrades")} k="tradesCount" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortHeader label={t("admin.colJoined")} k="createdAt" />
              </th>
              <th className="px-3 py-2.5 font-medium">{t("admin.colStatus")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {t("admin.noMatchingUsers")}
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <Link href={`/app/admin/users/${u.id}`} className="block">
                      <div className="font-medium text-foreground hover:text-primary">
                        {u.displayName ?? u.email}
                      </div>
                      {u.displayName ? (
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatNumber(u.usdtBalance, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{u.aiCredits}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{u.analysesCount}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{u.tradesCount}</td>
                  <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.disabled ? (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        {t("admin.disabled")}
                      </span>
                    ) : (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{t("admin.active")}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        {t("admin.userCount", { shown: filtered.length, total: users.length })}
      </div>
    </div>
  );
}
