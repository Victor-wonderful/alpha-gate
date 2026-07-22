import type { Metadata } from "next";
import { Inter, Noto_Sans_KR, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/context";

// VECTA design system typography: Inter (en) / Noto Sans KR (kr) / JetBrains Mono
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  preload: false,
  variable: "--font-noto-kr",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VECTA — 매매 전 의사결정 체크",
    template: "%s · VECTA",
  },
  description:
    "진입 버튼을 누르기 전에 이 거래를 해도 되는지 점검하세요. AI 리서치 + 매매 등급 + 거래 저널 + AI 복기.",
  openGraph: {
    type: "website",
    siteName: "VECTA",
    title: "VECTA — 매매 전 의사결정 체크",
    description:
      "진입 버튼을 누르기 전에 이 거래를 해도 되는지 점검하세요. AI 리서치 + 매매 등급 + 거래 저널 + AI 복기.",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "VECTA — 매매 전 의사결정 체크",
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${notoSansKr.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline script in <head> runs at HTML parse time (before body/hydration),
            silencing lightweight-charts "Object is disposed" async errors.
            dangerouslySetInnerHTML avoids React's "script with children" warning. */}
        <script dangerouslySetInnerHTML={{ __html: SUPPRESS_DISPOSED }} />
      </head>
      <body className="min-h-screen antialiased">
        <I18nProvider locale={locale}>
          <Providers>{children}</Providers>
        </I18nProvider>
        <Toaster position="top-right" richColors theme="light" />
      </body>
    </html>
  );
}
