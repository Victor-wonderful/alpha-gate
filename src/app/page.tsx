import Link from "next/link";
import { ArrowRight, ShieldCheck, Calculator, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "매매 등급 평가",
    body: "진입가·손절가·목표가·체크리스트를 입력하면 A/B/C/D 등급과 점수 내역으로 답합니다.",
  },
  {
    icon: Calculator,
    title: "포지션 사이징",
    body: "계좌 크기와 허용 손실률로 위험을 통제할 수 있는 권장 수량을 계산합니다.",
  },
  {
    icon: BookOpen,
    title: "거래 저널 + 대시보드",
    body: "진입 시 등급과 실현 R을 같이 기록해 '내가 어디서 잃는가'를 보여줍니다.",
  },
  {
    icon: Sparkles,
    title: "AI 복기 코멘트",
    body: "결과 입력 후 Claude가 당신의 결정과 실행에 대한 코칭 코멘트를 생성합니다.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Alpha Gate
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            로그인
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-4 py-24 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          매매 전 의사결정 체크
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          진입 버튼을 누르기 전에
          <br />
          <span className="text-grade-b">이 거래를 해도 되는가</span>를 답하세요.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
          거래소는 주문을, 차트 사이트는 분석을 줍니다. Alpha Gate는 그 사이에서 매매 판단과 리스크 통제를 담당합니다.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/login">
            <Button size="lg">
              지금 시작하기 <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent className="space-y-3 p-5">
                <f.icon className="h-6 w-6 text-grade-b" />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-border py-8 text-center text-xs text-muted-foreground">
        Alpha Gate는 투자 자문이 아닙니다. 모든 매매 결정과 결과는 사용자 본인의 책임입니다.
      </footer>
    </main>
  );
}
