"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Sparkles,
  ShieldCheck,
  Brain,
  ClipboardCheck,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/app/logo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

function LoginInner() {
  const t = useT();
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const initialMode: Mode = params.get("mode") === "signup" ? "signup" : "signin";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "signup") {
      if (password !== passwordConfirm) {
        toast.error(t("login.passwordMismatch"));
        return;
      }
      if (strength.score < 2) {
        toast.error(t("login.passwordTooWeak"));
        return;
      }
      if (!agreeTerms) {
        toast.error(t("login.agreeRequired"));
        return;
      }
    }

    setLoading(true);
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "signup") {
      // 이메일 확인이 꺼져 있으면 가입 즉시 세션이 생긴다 → 바로 앱으로.
      // 이메일 확인이 켜져 있으면 session 이 없다 → 확인 메일 안내.
      if (data.session) {
        toast.success(t("login.signupDoneWelcome"));
        router.replace(next);
        router.refresh();
      } else {
        toast.success(t("login.signupConfirmEmail"));
      }
    } else {
      router.replace(next);
      router.refresh();
    }
  }

  return (
    <main className="relative isolate flex min-h-screen overflow-hidden bg-[#02060f] text-white">
      {/* Background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[20%] top-1/2 h-[140%] w-[60%] -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.30),rgba(14,165,233,0.10)_40%,transparent_65%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-15%] top-[-10%] h-[60%] w-[40%] rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(186,230,253,0.5) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col items-stretch lg:flex-row">
        {/* Left — Brand panel */}
        <aside className="hidden flex-1 flex-col justify-between p-10 lg:flex xl:p-16">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={26} />
            <div>
              <div className="font-mono text-sm font-bold tracking-[0.24em] text-white">
                ALPHA GATE
              </div>
              <div className="text-[9px] font-medium tracking-[0.2em] text-white/40">
                PRE-TRADE DECISION CHECK
              </div>
            </div>
          </Link>

          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
              <span className="inline-block h-px w-8 bg-cyan-400" />
              {mode === "signup" ? t("login.tagSignup") : t("login.tagSignin")}
            </div>
            <h1 className="mt-5 text-4xl font-bold leading-[1.15] xl:text-5xl">
              {t("login.heroTitlePre")}{" "}
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {t("login.heroTitleHighlight")}
              </span>
              {t("login.heroTitlePost")}
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/55">
              {t("login.heroDesc")}
            </p>

            <ul className="mt-10 space-y-4">
              <Bullet icon={Brain} label={t("login.bulletAi")} />
              <Bullet icon={ClipboardCheck} label={t("login.bulletGrade")} />
              <Bullet icon={ShieldCheck} label={t("login.bulletPersist")} />
            </ul>
          </div>

          <div className="text-[11px] text-white/30">
            © {new Date().getFullYear()} Alpha Gate · {t("login.footerDisclaimer")}
          </div>
        </aside>

        {/* Right — Form panel */}
        <div className="flex flex-1 items-center justify-center p-6 sm:p-10 lg:max-w-[640px]">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <Link href="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
              <Logo size={22} />
              <span className="font-mono text-sm font-bold tracking-[0.24em] text-white">
                ALPHA GATE
              </span>
            </Link>

            {/* Mode tabs */}
            <div className="flex rounded-full border border-cyan-500/20 bg-white/[0.03] p-1 backdrop-blur">
              <TabButton active={mode === "signin"} onClick={() => setMode("signin")}>
                {t("login.tabSignin")}
              </TabButton>
              <TabButton active={mode === "signup"} onClick={() => setMode("signup")}>
                {t("login.tabSignup")}
              </TabButton>
            </div>

            <div className="relative mt-8 overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[#091632]/70 via-[#06112a]/60 to-[#040b1d]/80 p-8 shadow-[0_30px_80px_-20px_rgba(56,189,248,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-10">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-x-10 -top-16 h-32 bg-gradient-to-b from-cyan-400/10 to-transparent blur-2xl"
              />

              <div className="relative">
                <h2 className="text-2xl font-bold tracking-tight">
                  {mode === "signup" ? t("login.headingSignup") : t("login.headingSignin")}
                </h2>
                <p className="mt-2 text-sm text-white/55">
                  {mode === "signup"
                    ? t("login.subSignup")
                    : t("login.subSignin")}
                </p>

                <form className="mt-8 space-y-5" onSubmit={submit}>
                  {/* Email */}
                  <FormField
                    id="email"
                    label={t("login.labelEmail")}
                    icon={Mail}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    required
                  />

                  {/* Password */}
                  <FormField
                    id="password"
                    label={mode === "signup" ? t("login.labelPasswordCreate") : t("login.labelPassword")}
                    icon={Lock}
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={setPassword}
                    placeholder={mode === "signup" ? t("login.phPasswordCreate") : t("login.phPassword")}
                    required
                    minLength={mode === "signup" ? 8 : 6}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="text-white/40 transition-colors hover:text-white/70"
                        aria-label={showPassword ? t("login.ariaHidePassword") : t("login.ariaShowPassword")}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />

                  {/* Password strength (signup only) */}
                  {mode === "signup" && password.length > 0 && (
                    <PasswordStrength score={strength.score} labelKey={strength.labelKey} />
                  )}

                  {/* Confirm password (signup) */}
                  {mode === "signup" && (
                    <FormField
                      id="password-confirm"
                      label={t("login.labelPasswordConfirm")}
                      icon={Lock}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={setPasswordConfirm}
                      placeholder={t("login.phPasswordConfirm")}
                      required
                      hint={
                        passwordConfirm.length > 0 && passwordConfirm !== password
                          ? t("login.hintPasswordMismatch")
                          : undefined
                      }
                      hintTone="bad"
                    />
                  )}

                  {/* Signin extras */}
                  {mode === "signin" && (
                    <div className="flex items-center justify-between">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55 hover:text-white/80">
                        <input type="checkbox" className="h-3.5 w-3.5 accent-cyan-400" />
                        {t("login.keepSignedIn")}
                      </label>
                      <button
                        type="button"
                        className="text-xs text-cyan-300 transition-colors hover:text-cyan-200"
                        onClick={() => toast.info(t("login.forgotPasswordToast"))}
                      >
                        {t("login.forgotPassword")}
                      </button>
                    </div>
                  )}

                  {/* Signup agreements */}
                  {mode === "signup" && (
                    <div className="space-y-2.5 pt-1">
                      <Checkbox
                        id="terms"
                        checked={agreeTerms}
                        onChange={setAgreeTerms}
                        required
                      >
                        <span className="text-white/70">
                          {t("login.agreePrefix")}
                          <Link href="/terms" target="_blank" className="text-cyan-300 hover:underline">
                            {t("login.linkTerms")}
                          </Link>{" "}
                          ·{" "}
                          <Link href="/privacy" target="_blank" className="text-cyan-300 hover:underline">
                            {t("login.linkPrivacy")}
                          </Link>{" "}
                          ·{" "}
                          <Link href="/disclaimer" target="_blank" className="text-cyan-300 hover:underline">
                            {t("login.linkDisclaimer")}
                          </Link>
                          {t("login.agreeSuffix")} <span className="text-rose-300">*</span>
                        </span>
                      </Checkbox>
                      <Checkbox id="marketing" checked={marketing} onChange={setMarketing}>
                        <span className="text-white/55">
                          {t("login.marketingOptIn")}
                        </span>
                      </Checkbox>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative mt-6 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-6 py-3.5 text-sm font-semibold text-[#02060f] shadow-[0_0_28px_rgba(56,189,248,0.45)] transition-all hover:gap-3 hover:shadow-[0_0_42px_rgba(56,189,248,0.65)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      t("login.processing")
                    ) : (
                      <>
                        {mode === "signin" ? t("login.submitSignin") : t("login.submitSignup")}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>

                  {/* Mode swap link */}
                  <p className="pt-2 text-center text-sm text-white/55">
                    {mode === "signin" ? t("login.swapToSignup") : t("login.swapToSignin")}
                    <button
                      type="button"
                      onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                      className="font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
                    >
                      {mode === "signin" ? t("login.swapLinkSignup") : t("login.swapLinkSignin")}
                    </button>
                  </p>
                </form>
              </div>
            </div>

            {/* Trust badges (signup only) */}
            {mode === "signup" && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-white/40">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-cyan-400" /> {t("login.badgeNoCard")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-cyan-400" /> {t("login.badgeFree")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-cyan-400" /> {t("login.badgeRefund")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ────────────────────────── helpers ────────────────────────── */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all",
        active
          ? "bg-gradient-to-br from-sky-500/20 to-cyan-500/10 text-cyan-200 shadow-[inset_0_0_20px_rgba(56,189,248,0.2)]"
          : "text-white/55 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Bullet({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-cyan-500/30 bg-gradient-to-br from-sky-500/15 to-blue-600/10 text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="pt-1.5 text-sm leading-relaxed text-white/70">{label}</span>
    </li>
  );
}

function FormField({
  id,
  label,
  icon: Icon,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  suffix,
  hint,
  hintTone = "muted",
}: {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  type: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  suffix?: React.ReactNode;
  hint?: string;
  hintTone?: "muted" | "bad" | "good";
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wider text-white/55"
      >
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 transition-colors focus-within:border-cyan-400/50 focus-within:bg-white/[0.05] focus-within:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]">
        {Icon && <Icon className="h-4 w-4 flex-none text-white/35" />}
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
        />
        {suffix}
      </div>
      {hint && (
        <p
          className={cn(
            "mt-1.5 text-[11px]",
            hintTone === "bad"
              ? "text-rose-300"
              : hintTone === "good"
                ? "text-cyan-300"
                : "text-white/40",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function PasswordStrength({ score, labelKey }: { score: number; labelKey: string }) {
  const t = useT();
  return (
    <div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < score
                ? score >= 3
                  ? "bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]"
                  : score >= 2
                    ? "bg-amber-400"
                    : "bg-rose-400"
                : "bg-white/[0.08]",
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-white/45">
        {t("login.strengthLabel")} ·{" "}
        <span
          className={cn(
            "font-semibold",
            score >= 3 ? "text-cyan-300" : score >= 2 ? "text-amber-300" : "text-rose-300",
          )}
        >
          {labelKey === "—" ? "—" : t(labelKey)}
        </span>
      </p>
    </div>
  );
}

function Checkbox({
  id,
  checked,
  onChange,
  required,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed"
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors",
          checked
            ? "border-cyan-400 bg-gradient-to-br from-sky-400 to-cyan-500 shadow-[0_0_12px_rgba(56,189,248,0.5)]"
            : "border-white/20 bg-white/[0.04] hover:border-white/40",
        )}
      >
        {checked && <Check className="h-3 w-3 text-[#02060f]" strokeWidth={3} />}
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        className="sr-only"
      />
      {children}
    </label>
  );
}

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; labelKey: string } {
  if (pw.length === 0) return { score: 0, labelKey: "—" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^\w]/.test(pw)) s++;
  if (s > 4) s = 4;
  const labelKeys = [
    "login.strengthVeryShort",
    "login.strengthWeak",
    "login.strengthNormal",
    "login.strengthStrong",
    "login.strengthVeryStrong",
  ];
  return { score: s as 0 | 1 | 2 | 3 | 4, labelKey: labelKeys[s] };
}
