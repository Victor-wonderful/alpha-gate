import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "Alpha Gate — 매매 전 의사결정 체크",
    template: "%s · Alpha Gate",
  },
  description:
    "진입 버튼을 누르기 전에 이 거래를 해도 되는지 점검하세요. AI 분석 + 매매 등급 + 거래 저널 + AI 복기.",
  openGraph: {
    type: "website",
    siteName: "Alpha Gate",
    title: "Alpha Gate — 매매 전 의사결정 체크",
    description:
      "진입 버튼을 누르기 전에 이 거래를 해도 되는지 점검하세요. AI 분석 + 매매 등급 + 거래 저널 + AI 복기.",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Alpha Gate — 매매 전 의사결정 체크",
    description:
      "AI 시장 분석 · 매매 등급 평가 · 거래 저널 · AI 복기. 진입 전에 점검하세요.",
  },
};

// Synchronously installed BEFORE Next.js dev overlay so we can silence
// lightweight-charts "Object is disposed" async errors (ResizeObserver etc.)
const SUPPRESS_DISPOSED = `
(function(){
  function isDisposed(m){return m && (m+'').toLowerCase().indexOf('disposed')!==-1;}
  window.addEventListener('error', function(e){
    var m = e && (e.message || (e.error && e.error.message));
    if (isDisposed(m)) { e.preventDefault(); e.stopImmediatePropagation(); return false; }
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    var m = typeof r === 'string' ? r : (r && r.message);
    if (isDisposed(m)) { e.preventDefault(); return false; }
  }, true);
  var oe = console.error;
  console.error = function(){
    var a = arguments[0];
    var m = typeof a === 'string' ? a : (a && a.message);
    if (isDisposed(m)) return;
    return oe.apply(console, arguments);
  };
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        {/* Synchronously installed BEFORE Next.js dev overlay to silence
            lightweight-charts "Object is disposed" async errors. Uses
            next/script (Next.js 16 disallows raw <script> in component tree). */}
        <Script id="suppress-disposed" strategy="beforeInteractive">
          {SUPPRESS_DISPOSED}
        </Script>
        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors theme="dark" />
      </body>
    </html>
  );
}
