import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  LineChart as LineChartIcon,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const metadata = {
  title: "사용 방법",
};

export default async function GuidePage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-[1100px] space-y-14 px-1 py-4">
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("guide.home.backHome")}
        </Link>
      </div>

      {/* Intro */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">getting started</div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">{t("guide.home.title")}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t("guide.home.introLead")}{" "}
          <span className="font-medium text-foreground">{t("guide.home.introEmphasis")}</span>
          {t("guide.home.introTail")}
        </p>
      </section>

      {/* 4단계 사이클 — 가로 다이어그램 */}
      <section className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("guide.home.cycleLabel")}
        </div>
        <div className="grid divide-y divide-border/60 rounded-xl border border-border/60 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <CycleStep
            n="01"
            Icon={Sparkles}
            color="text-primary"
            bg="bg-primary/10"
            title={t("guide.home.cycle1Title")}
            sub={t("guide.home.cycle1Sub")}
          />
          <CycleStep
            n="02"
            Icon={CheckCircle2}
            color="text-grade-a"
            bg="bg-grade-a/10"
            title={t("guide.home.cycle2Title")}
            sub={t("guide.home.cycle2Sub")}
          />
          <CycleStep
            n="03"
            Icon={Wallet}
            color="text-grade-b"
            bg="bg-grade-b/10"
            title={t("guide.home.cycle3Title")}
            sub={t("guide.home.cycle3Sub")}
          />
          <CycleStep
            n="04"
            Icon={LineChartIcon}
            color="text-grade-c"
            bg="bg-grade-c/10"
            title={t("guide.home.cycle4Title")}
            sub={t("guide.home.cycle4Sub")}
          />
        </div>
      </section>

      {/* 기능별 가이드 — 5 카드 */}
      <section className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("guide.home.featureLabel")}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GuideCard
            href="/app/guide/analyze"
            Icon={Sparkles}
            iconColor="text-primary"
            title={t("guide.home.cardAnalyzeTitle")}
            desc={t("guide.home.cardAnalyzeDesc")}
          />
          <GuideCard
            href="/app/guide/trading"
            Icon={Wallet}
            iconColor="text-grade-b"
            title={t("guide.home.cardTradingTitle")}
            desc={t("guide.home.cardTradingDesc")}
          />
          <GuideCard
            href="/app/guide/results"
            Icon={LineChartIcon}
            iconColor="text-grade-a"
            title={t("guide.home.cardResultsTitle")}
            desc={t("guide.home.cardResultsDesc")}
          />
        </div>
      </section>

      {/* 화폐 시스템 */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{t("guide.home.currencyLabel")}</div>
        <h2 className="text-2xl font-bold leading-[1.15] tracking-tight">{t("guide.home.currencyHeading")}</h2>
        <div className="grid gap-6 pt-2 lg:grid-cols-3">
          <CurrencyCard
            Icon={Coins}
            iconColor="text-primary"
            title="vUSDT"
            body={
              <>
                {t("guide.home.vusdtLead")}{" "}
                <span className="font-mono font-medium tabular-nums text-foreground">10,000</span>{t("guide.home.vusdtTail")}
              </>
            }
          />
          <CurrencyCard
            Icon={Coins}
            iconColor="text-primary"
            title="AAG"
            body={
              <>
                {t("guide.home.aagLead")}{" "}
                <span className="font-mono font-medium tabular-nums text-foreground">
                  1 AAG = 1 USDT = 1,000 vUSDT
                </span>
                {t("guide.home.aagTail")}
              </>
            }
          />
          <CurrencyCard
            Icon={Sparkles}
            iconColor="text-amber-400"
            title={t("guide.home.creditTitle")}
            body={
              <>
                {t("guide.home.creditLead")}{" "}
                <span className="font-medium text-foreground">{t("guide.home.creditEmphasis")}</span>{t("guide.home.creditTail")}
              </>
            }
          />
        </div>
      </section>

      {/* 공통 FAQ */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">FAQ</div>
        <h2 className="text-2xl font-bold leading-[1.15] tracking-tight">{t("guide.home.faqHeading")}</h2>
        <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
          <Faq question={t("guide.home.faqAutoSettleQ")}>
            {t("guide.home.faqAutoSettleA")}
          </Faq>
          <Faq question={t("guide.home.faqHitRateQ")}>
            {t("guide.home.faqHitRateA")}
          </Faq>
          <Faq question={t("guide.home.faqMoneyMgmtQ")}>
            {t("guide.home.faqMoneyMgmtA")}
          </Faq>
          <Faq question={t("guide.home.faqLiveTradeQ")}>
            {t("guide.home.faqLiveTradeA")}
          </Faq>
          <Faq question={t("guide.home.faqSignupAssetsQ")}>
            {t("guide.home.faqSignupAssetsA")}
          </Faq>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-transparent px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">ready</div>
            <h3 className="mt-2 text-2xl font-bold leading-[1.15]">{t("guide.home.ctaTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("guide.home.ctaDesc")}
            </p>
          </div>
          <Link
            href="/app/analyze"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t("guide.home.ctaButton")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function CycleStep({
  n,
  Icon,
  color,
  bg,
  title,
  sub,
}: {
  n: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-md", bg, color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold tabular-nums text-muted-foreground/70">STEP {n}</div>
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function GuideCard({
  href,
  Icon,
  iconColor,
  title,
  desc,
}: {
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card/30 p-5 transition-colors hover:border-border/80 hover:bg-card/60"
    >
      <div className="flex items-center justify-between">
        <Icon className={cn("h-5 w-5", iconColor)} />
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
      </div>
      <div>
        <div className="text-base font-semibold">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}

function CurrencyCard({
  Icon,
  iconColor,
  title,
  body,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn("h-4 w-4", iconColor)} />
        {title}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center justify-between py-4">
        <span className="text-sm font-medium">{question}</span>
        <Plus className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-45" />
      </summary>
      <div className="max-w-2xl pb-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
