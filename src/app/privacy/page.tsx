import type { Metadata } from "next";
import { LegalLayout } from "@/components/marketing/legal-layout";

export const metadata: Metadata = {
  title: "개인정보처리방침 — Alpha Gate",
  description: "Alpha Gate가 수집·이용·보관하는 개인정보의 종류와 처리 절차를 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="개인정보처리방침"
      eyebrow="Privacy Policy"
      effectiveDate="2026년 5월 17일"
      currentHref="/privacy"
    >
      <p>
        Alpha Gate(이하 &ldquo;서비스&rdquo;)는 회원의 개인정보를 중요시하며, 개인정보 보호법 등 관련 법령을 준수합니다.
        본 방침은 서비스가 어떤 개인정보를 수집·이용·보관·제공·파기하는지 안내합니다.
      </p>

      <h2>1. 수집하는 개인정보 항목</h2>
      <h3>필수 항목 (회원가입 시)</h3>
      <ul>
        <li>이메일 주소</li>
        <li>비밀번호 (해시 저장, 평문 보관 X)</li>
      </ul>
      <h3>서비스 이용 과정에서 자동 수집</h3>
      <ul>
        <li>거래 입력값(코인·진입가·손절가·목표가·계좌·리스크 등)</li>
        <li>AI 분석 결과 및 거래 결과 기록</li>
        <li>접속 IP, 브라우저 정보, 접속 시각(쿠키/세션)</li>
      </ul>
      <h3>유료 결제 시 (해당하는 경우)</h3>
      <ul>
        <li>결제 식별자(결제 대행사 발급, 카드번호 직접 보관 X)</li>
        <li>결제 영수증 정보(세금계산서 요청 시 사업자 정보)</li>
      </ul>
      <h3>선택 항목</h3>
      <ul>
        <li>Telegram chat ID, Discord 웹훅 URL(알림 사용 시)</li>
        <li>거래소 read-only API 키(자동 저널 사용 시, 암호화 보관)</li>
      </ul>

      <h2>2. 수집 및 이용 목적</h2>
      <ul>
        <li>회원 식별, 계정 관리, 본인 확인</li>
        <li>AI 분석 결과 생성 및 거래 기록 저장</li>
        <li>유료 플랜 결제 및 환불 처리</li>
        <li>고객 문의 응대</li>
        <li>서비스 개선을 위한 통계 분석(개별 식별 불가능한 형태)</li>
        <li>법령상 의무 이행</li>
      </ul>

      <h2>3. 보유 및 이용 기간</h2>
      <ul>
        <li>회원 정보: 회원 탈퇴 시까지. 탈퇴 즉시 영구 삭제하며 30일 이내 백업에서도 제거합니다.</li>
        <li>결제 기록: 전자상거래법에 따라 5년</li>
        <li>접속 로그: 통신비밀보호법에 따라 3개월</li>
      </ul>

      <h2>4. 제3자 제공</h2>
      <p>
        서비스는 회원의 개인정보를 제3자에게 제공하지 않습니다. 다만 다음의 경우 예외로 합니다.
      </p>
      <ul>
        <li>회원이 사전 동의한 경우</li>
        <li>법령에 의해 요구되거나 수사기관의 적법한 절차에 따른 요청이 있는 경우</li>
      </ul>

      <h2>5. 처리 위탁</h2>
      <p>서비스는 안정적 운영을 위해 일부 업무를 외부 처리자에게 위탁합니다.</p>
      <ul>
        <li>
          <strong>Supabase Inc.</strong> — 데이터베이스 및 사용자 인증 (저장 위치: AWS 도쿄/서울 리전)
        </li>
        <li>
          <strong>Vercel Inc.</strong> — 웹 서비스 호스팅
        </li>
        <li>
          <strong>Anthropic PBC</strong> — AI 분석 API (Zero data retention 설정. 분석 요청 데이터는 학습에 사용되지 않음)
        </li>
        <li>
          <strong>결제 대행사(예정: Stripe·토스페이먼츠 등)</strong> — 결제 처리
        </li>
      </ul>

      <h2>6. 회원의 권리</h2>
      <p>회원은 언제든지 다음의 권리를 행사할 수 있습니다.</p>
      <ul>
        <li>개인정보 열람·정정·삭제 요청</li>
        <li>처리 정지 요청</li>
        <li>동의 철회 및 회원 탈퇴 (설정 화면 또는 이메일 요청)</li>
        <li>개인정보 이동권 (가공 가능한 형태로 본인 데이터 다운로드)</li>
      </ul>

      <h2>7. 안전성 확보 조치</h2>
      <ul>
        <li>비밀번호 단방향 해시 저장(bcrypt 등)</li>
        <li>데이터베이스 Row-Level Security로 사용자별 데이터 격리</li>
        <li>거래소 API 키 암호화 저장</li>
        <li>HTTPS 전 구간 적용</li>
        <li>접근 권한 최소화 및 접근 기록 보관</li>
      </ul>

      <h2>8. 쿠키 사용</h2>
      <p>
        서비스는 로그인 세션 유지 및 사용자 경험 개선을 위해 쿠키를 사용합니다. 회원은 브라우저 설정에서 쿠키 저장을 거부할 수
        있으나, 이 경우 로그인 등 일부 기능이 제한될 수 있습니다.
      </p>

      <h2>9. 개인정보 보호책임자</h2>
      <p>
        개인정보 처리 관련 문의는 아래로 연락 주십시오.
      </p>
      <ul>
        <li>이메일: privacy@alphagate.app</li>
        <li>일반 문의: <a href="/contact">문의 페이지</a></li>
      </ul>

      <h2>10. 방침 변경</h2>
      <p>
        본 방침은 법령 또는 서비스 정책 변경에 따라 개정될 수 있으며, 변경 시 시행일 7일 전부터 공지합니다.
      </p>
    </LegalLayout>
  );
}
