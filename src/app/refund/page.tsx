import type { Metadata } from "next";
import { LegalLayout } from "@/components/marketing/legal-layout";

export const metadata: Metadata = {
  title: "환불정책 — Alpha Gate",
  description: "Alpha Gate 유료 플랜의 환불 기준과 절차를 안내합니다.",
};

export default function RefundPage() {
  return (
    <LegalLayout
      title="환불정책"
      eyebrow="Refund Policy"
      effectiveDate="2026년 5월 17일"
      currentHref="/refund"
    >
      <p>
        Alpha Gate(이하 &ldquo;서비스&rdquo;)는 회원의 합리적 신뢰를 보호하기 위해 다음과 같은 환불 기준을 적용합니다.
        본 방침은 전자상거래법 및 콘텐츠산업진흥법을 준수합니다.
      </p>

      <h2>1. 7일 이내 100% 환불 (단순 변심 포함)</h2>
      <p>
        결제일로부터 <strong>7일 이내</strong>에 요청한 경우, 사유를 묻지 않고 결제 금액 전액을 환불합니다. 단, 다음의 경우는
        제외됩니다.
      </p>
      <ul>
        <li>월 AI 분석 횟수의 50%를 이미 사용한 경우</li>
        <li>유료 한정 기능(예: 백테스트, 다중 코인 스캐너)을 5회 이상 사용한 경우</li>
      </ul>
      <p>위의 경우라도 서비스 장애·중대한 결함이 있었다면 전액 환불 대상입니다.</p>

      <h2>2. 8일 이후의 환불</h2>
      <ul>
        <li>월 구독: 결제 주기 종료 시까지 서비스가 정상 제공되며, 일할 환불은 원칙적으로 제공하지 않습니다.</li>
        <li>연간 구독: 잔여 개월 수 × 월 환산액의 50%를 환불합니다(위약금 차감).</li>
        <li>서비스 장애로 7일 이상 정상 이용이 불가했던 경우 일할 환불을 보장합니다.</li>
      </ul>

      <h2>3. 환불이 불가한 경우</h2>
      <ul>
        <li>회원의 약관 중대 위반으로 이용계약이 해지된 경우</li>
        <li>이미 환불받은 결제 건의 재환불</li>
        <li>결제 후 90일이 경과한 건(이의 제기 시한)</li>
      </ul>

      <h2>4. 환불 절차</h2>
      <ol>
        <li>
          <strong>요청:</strong> <a href="/contact">문의 페이지</a> 또는 hello@alphagate.app으로 가입 이메일·결제 일자·환불
          사유를 적어 보내주십시오.
        </li>
        <li>
          <strong>확인:</strong> 영업일 기준 1~2일 이내 본인 확인 후 환불 가능 여부를 안내합니다.
        </li>
        <li>
          <strong>처리:</strong> 환불 승인 후 결제 수단(카드)으로 영업일 기준 3~7일 이내 환불됩니다. 카드사 사정에 따라 다음
          청구 주기에 반영될 수 있습니다.
        </li>
      </ol>

      <h2>5. 환불 금액 계산 예시</h2>
      <h3>예시 1 — 7일 이내 단순 변심</h3>
      <p>5월 1일 Standard 월 ₩24,900 결제 → 5월 5일 환불 요청 → <strong>₩24,900 전액 환불</strong></p>
      <h3>예시 2 — 연간 결제 후 6개월 사용</h3>
      <p>
        Pro 연간 ₩599,000 결제(월 환산 ₩49,917) → 6개월 사용 후 환불 요청 → 잔여 6개월 × ₩49,917 × 50% =
        <strong> ₩149,751 환불</strong>
      </p>

      <h2>6. 자동 갱신 해지</h2>
      <p>
        다음 결제를 막고 싶다면 환불 요청 없이도 설정 화면에서 자동 갱신을 해지할 수 있습니다. 현재 결제 주기까지 정상 이용이
        가능하며 다음 결제부터 과금이 중단됩니다.
      </p>

      <h2>7. 분쟁 해결</h2>
      <p>
        환불 처리에 이의가 있는 경우 한국소비자원(소비자분쟁조정위원회)을 통해 조정을 신청할 수 있습니다.
      </p>

      <hr />

      <p>
        환불 관련 문의는 <a href="/contact">문의 페이지</a> 또는 hello@alphagate.app으로 보내주세요. 영업일 기준 24시간 이내
        회신해드립니다.
      </p>
    </LegalLayout>
  );
}
