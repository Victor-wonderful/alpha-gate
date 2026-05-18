import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Logo } from "@/components/app/logo";

export function MarketingFooter() {
  return (
    <footer className="bg-black">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <Logo size={26} />
              <div>
                <div className="font-mono text-sm font-bold leading-tight tracking-[0.24em] text-white">
                  ALPHA GATE
                </div>
                <div className="text-[9px] font-medium tracking-[0.2em] text-white/40">
                  PRE-TRADE DECISION CHECK
                </div>
              </div>
            </div>
            <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/50">
              매매 전 의사결정 체크. 진입 버튼 누르기 전 5분으로 D급 거래를 막습니다.
            </p>
            <div className="mt-5">
              <a
                href="https://victor-alpha-neon.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"
              >
                Victor Alpha 블로그
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <FooterCol
            title="제품"
            links={[
              { href: "/features", label: "기능" },
              { href: "/how-it-works", label: "작동 방식" },
              { href: "/pricing", label: "가격" },
            ]}
          />
          <FooterCol
            title="지원"
            links={[
              { href: "/faq", label: "FAQ" },
              { href: "/contact", label: "문의" },
              { href: "/login?mode=signup", label: "회원가입" },
              { href: "/login", label: "로그인" },
            ]}
          />
          <FooterCol
            title="법적 고지"
            links={[
              { href: "/terms", label: "이용약관" },
              { href: "/privacy", label: "개인정보처리방침" },
              { href: "/refund", label: "환불정책" },
              { href: "/disclaimer", label: "투자 면책" },
            ]}
          />
        </div>

        <div className="mt-14 border-t border-white/10 pt-6">
          <p className="text-[11px] leading-relaxed text-white/40">
            Alpha Gate는{" "}
            <strong className="text-white/70">투자 자문이 아닙니다</strong>. 본 서비스는 매매 의사결정 점검 도구이며, 모든
            매매 결정과 결과는 사용자 본인의 책임입니다. 자세한 내용은{" "}
            <Link href="/disclaimer" className="text-cyan-400/80 hover:text-cyan-300">
              투자 면책 고지
            </Link>
            를 확인해주세요.
          </p>
          <div className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-white/30">
            © {new Date().getFullYear()} Alpha Gate · All rights reserved
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string; external?: boolean }>;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{title}</div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) =>
          l.external ? (
            <li key={l.label}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white/60 transition-colors hover:text-white"
              >
                {l.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          ) : (
            <li key={l.label}>
              <Link href={l.href} className="text-white/60 transition-colors hover:text-white">
                {l.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
