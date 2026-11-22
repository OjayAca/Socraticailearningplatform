/** Login and password-recovery screen. */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import {
  getDashboardPath,
  isAdminRole,
  useAuthStore,
} from "@/stores/auth-store";
import { MindGuideLogo } from "../MindGuideLogo";
import { Alert } from "../ui/alert";

const REMEMBERED_EMAIL_STORAGE_KEY = "mindguide.rememberedEmail";
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function validateEmailValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Please enter your email address.";
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Please enter a valid email address with an @ symbol.";
  }
  return null;
}

function validateLoginPassword(value: string): string | null {
  if (!value.trim()) {
    return "Please enter your password.";
  }
  return null;
}

/** Screen 2: Email/password login form with Google OAuth option. */
export function Login() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, resetPassword, error, isLoading, clearError } =
    useAuthStore();

  const [email, setEmail] = useState(readRememberedEmail);
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => readRememberedEmail().length > 0
  );
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetSending, setIsResetSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const submitPendingRef = useRef(false);

  useEffect(() => {
    let token: string | null;
    try {
      token = sessionStorage.getItem("mindguide.google.result");
      if (!token) return;
      sessionStorage.removeItem("mindguide.google.result");
    } catch {
      return;
    }
    void signInWithGoogle(token).then((profile) => {
      if (profile) navigate(getDashboardPath(profile.role), { replace: true });
    }).catch(() => { /* The store displays authentication errors. */ });
  }, [navigate, signInWithGoogle]);

  const resetSuccessMessage =
    "If an account exists for this email, a password reset link has been sent.";
  const isBusy = isLoading || isResetSending;

  /**
   * Handles email/password login submission.
   * Allows form submission so inline field-level errors render clearly.
   */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy || submitPendingRef.current) return;
    clearError();
    setResetSuccess(false);

    const nextEmailError = validateEmailValue(email);
    const nextPasswordError = validateLoginPassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) return;

    const trimmedEmail = email.trim();
    submitPendingRef.current = true;
    try {
      const profile = await signIn(trimmedEmail, password, rememberMe);
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_EMAIL_STORAGE_KEY, trimmedEmail);
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
        }
      } catch {
        // Ignore storage write errors in restricted browsing modes.
      }
      const isStudentEmailUnverified =
        profile.emailVerified === false && !isAdminRole(profile.role);
      navigate(
        isStudentEmailUnverified
          ? "/verify-email"
          : getDashboardPath(profile.role)
      );
    } catch {
      // Error is already set in the store
    } finally {
      submitPendingRef.current = false;
    }
  }

  /** Handles Google OAuth sign-in. */
  async function handleGoogleSignIn() {
    if (isBusy || submitPendingRef.current) return;
    clearError();
    setResetSuccess(false);
    submitPendingRef.current = true;
    try {
      const profile = await signInWithGoogle();
      if (profile) navigate(getDashboardPath(profile.role));
    } catch {
      // Error is already set in the store
    } finally {
      submitPendingRef.current = false;
    }
  }

  /** Sends a password reset email for the entered address. */
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy || submitPendingRef.current) return;
    clearError();
    setResetSuccess(false);

    const nextEmailError = validateEmailValue(email);
    setEmailError(nextEmailError);
    if (nextEmailError) return;

    submitPendingRef.current = true;
    setIsResetSending(true);
    try {
      await resetPassword(email.trim());
      setResetSuccess(true);
    } catch {
      // Error is already set in the store
    } finally {
      setIsResetSending(false);
      submitPendingRef.current = false;
    }
  }

  function showResetMode() {
    clearError();
    setResetSuccess(false);
    setEmailError(null);
    setPasswordError(null);
    setIsResetMode(true);
  }

  function showLoginMode() {
    clearError();
    setResetSuccess(false);
    setEmailError(null);
    setPasswordError(null);
    setIsResetMode(false);
  }

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="auth-page flex min-h-full flex-1 flex-col items-center bg-slate-50 p-4 sm:p-6">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, x: -20 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
        className="my-auto w-full max-w-md shrink-0 space-y-6 rounded-3xl bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8"
      >
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to home
          </Link>
        </div>

        <div className="space-y-2 text-center">
          <MindGuideLogo className="mx-auto mb-4 h-24 w-28 rounded-2xl bg-white" />
          <h2 className="text-2xl font-bold text-slate-900">Welcome Back</h2>
          <p className="text-sm text-slate-500">
            {isResetMode
              ? "Enter your email and we'll send a secure reset link."
              : "Log in to continue your learning journey."}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert
            tone="error"
            className="text-red-800 dark:border-red-200 dark:bg-red-50 dark:text-red-800"
            action={
              !isResetMode ? (
                <button
                  type="button"
                  onClick={showResetMode}
                  className="min-h-11 rounded-lg px-2 text-xs font-semibold underline hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Reset password
                </button>
              ) : undefined
            }
          >
            <p>{error}</p>
            <p className="mt-1 text-xs opacity-90">
              Check your email spelling or use Forgot password to recover access.
            </p>
          </Alert>
        )}

        {resetSuccess && (
          <Alert
            tone="success"
            className="dark:border-emerald-200 dark:bg-emerald-50 dark:text-emerald-800"
          >
            <span>{resetSuccessMessage}</span>
          </Alert>
        )}

        {isResetMode ? (
          <>
            <form noValidate onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Mail aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(validateEmailValue(e.target.value));
                    }}
                    onBlur={() => setEmailError(validateEmailValue(email))}
                    placeholder="you@example.com"
                    required
                    disabled={isBusy}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "reset-email-error" : undefined}
                    className={`w-full rounded-xl border py-3 pl-10 pr-4 outline-none transition-all focus:border-transparent focus:ring-2 disabled:opacity-50 ${
                      emailError
                        ? "border-red-500 focus:ring-red-500"
                        : "border-slate-200 focus:ring-indigo-600"
                    }`}
                  />
                </div>
                {emailError && (
                  <p id="reset-email-error" role="alert" className="text-xs font-medium text-red-600">
                    {emailError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? (
                  <>
                    <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                    <span>Sending reset link…</span>
                  </>
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={showLoginMode}
              disabled={isBusy}
              className="min-h-11 w-full rounded-xl text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
            >
              Back to log in
            </button>
          </>
        ) : (
          <>
            <form noValidate onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Mail aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(validateEmailValue(e.target.value));
                    }}
                    onBlur={() => setEmailError(validateEmailValue(email))}
                    placeholder="you@example.com"
                    required
                    disabled={isBusy}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "login-email-error" : undefined}
                    className={`w-full rounded-xl border py-3 pl-10 pr-4 outline-none transition-all focus:border-transparent focus:ring-2 disabled:opacity-50 ${
                      emailError
                        ? "border-red-500 focus:ring-red-500"
                        : "border-slate-200 focus:ring-indigo-600"
                    }`}
                  />
                </div>
                {emailError && (
                  <p id="login-email-error" role="alert" className="text-xs font-medium text-red-600">
                    {emailError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Lock aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <input
                    id="login-password"
                    type={isPasswordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError(validateLoginPassword(e.target.value));
                    }}
                    onBlur={() => setPasswordError(validateLoginPassword(password))}
                    placeholder="••••••••"
                    required
                    disabled={isBusy}
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? "login-password-error" : undefined}
                    className={`w-full rounded-xl border py-3 pl-10 pr-12 outline-none transition-all focus:border-transparent focus:ring-2 disabled:opacity-50 ${
                      passwordError
                        ? "border-red-500 focus:ring-red-500"
                        : "border-slate-200 focus:ring-indigo-600"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                    disabled={isBusy}
                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                  >
                    {isPasswordVisible ? (
                      <EyeOff aria-hidden="true" className="h-5 w-5" />
                    ) : (
                      <Eye aria-hidden="true" className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p id="login-password-error" role="alert" className="text-xs font-medium text-red-600">
                    {passwordError}
                  </p>
                )}

                <div className="flex items-center justify-between pt-0.5">
                  <label
                    htmlFor="login-remember-me"
                    className="inline-flex min-h-11 cursor-pointer select-none items-center gap-2 text-xs font-medium text-slate-600"
                  >
                    <input
                      id="login-remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={isBusy}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 disabled:opacity-50"
                    />
                    <span>Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={showResetMode}
                    disabled={isBusy}
                    className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    Log In
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 font-semibold text-slate-400">
                  or continue with
                </span>
              </div>
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isBusy}
              className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </button>

            <div className="text-center text-sm text-slate-600">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Sign up
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
