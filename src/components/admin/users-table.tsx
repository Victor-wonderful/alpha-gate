"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { AdminUserRow } from "@/lib/admin/data";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        (u.displayName ?? "").toLowerCase().includes(term),
    );
  }, [q, users]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이메일 / 표시명 검색"
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">회원</th>
              <th className="px-3 py-2.5 text-right font-medium">vUSDT</th>
              <th className="px-3 py-2.5 text-right font-medium">AI 크레딧</th>
              <th className="px-3 py-2.5 text-right font-medium">분석</th>
              <th className="px-3 py-2.5 text-right font-medium">거래</th>
              <th className="px-3 py-2.5 font-medium">가입일</th>
              <th className="px-3 py-2.5 font-medium">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  일치하는 회원이 없습니다.
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
                        비활성
                      </span>
                    ) : (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">활성</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} / {users.length}명
      </div>
    </div>
  );
}
