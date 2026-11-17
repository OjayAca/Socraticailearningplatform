/** Student account creation screen. */

import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { getDashboardPath, useAuthStore } from "@/stores/auth-store";
import { MindGuideLogo } from "../MindGuideLogo";
import { Alert } from "../ui/alert";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function validateName(value: string): string | null {
  return value.trim() ? null : "Please enter your full name.";
}

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Please enter your email address.";
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Please enter a valid email address with an @ symbol.";
  }
  return null;
}

function validatePassword(value: string): string | null {
  if (!value) return "Please create a password.";
  if (value.length < 6) {
    return "Password must be at least 6 characters.";
  }
  return null;
}

function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return "Please re-enter your password to confirm.";
  if (password !== confirm) {
    return "Passwords do not match. Please try again.";
  }
  return null;
}

/** Screen 3: Account creation form. */
export function SignUp() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle, error, isLoading, clearError } =
    useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name: string | null;
    email: string | null;
    password: string | null;
    confirmPassword: string | null;
  }>({
    name: null,
    email: null,
    password: null,
    confirmPassword: null,
  });
  const submitPendingRef = useRef(false);

  /**
   * Handles new account creation.
   * Allows submission to display field-level errors clearly; disables only while in flight.
   */
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading || submitPendingRef.current) return;
    clearError();
    setLocalError(null);

    const nextErrors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    };
    setFieldErrors(nextErrors);

    if (
      nextErrors.name ||
      nextErrors.email ||
      nextErrors.password ||
      nextErrors.confirmPassword
    ) {
      setLocalError("Please review and fix the highlighted fields below.");
      return;
    }

    submitPendingRef.current = true;
    try {
      const profile = await signUp(name.trim(), email.trim(), password);
      navigate(
        profile.emailVerified === false
          ? "/verify-email"
          : getDashboardPath(profile.role)
      );
    } catch {
      // Error is already set in the store
    } finally {
      submitPendingRef.current = false;
    }
  }

  /** Handles Google OAuth sign-up. */
  async function handleGoogleSignUp() {
    if (isLoading || submitPendingRef.current) return;
    clearError();
    setLocalError(null);
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

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const displayedError = localError || error;

  return (
    <div className="auth-page flex min-h-full flex-1 flex-col items-center bg-slate-50 p-4 sm:p-6">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
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

        <div className="text-center">
          <MindGuideLogo className="mx-auto mb-4 h-24 w-28 rounded-2xl bg-white" />
          <h2 className="text-2xl font-bold text-slate-900">
            Create an Account
          </h2>
        </div>

        {/* Error Alert */}
        {displayedError && (
          <Alert tone="error">
            <span>{displayedError}</span>
          </Alert>
        )}

        <form noValidate onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="signup-name" className="block text-sm font-medium text-slate-700">
              Full Name
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <User aria-hidden="true" className="h-5 w-5" />
              </div>
              <input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: validateName(next) }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({ ...prev, name: validateName(name) }))
                }
                placeholder="Alex Student"
                required
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "signup-name-error" : undefined}
                className={`w-full rounded-xl border py-3 pl-10 pr-4 outline-none transition-all focus:border-transparent focus:ring-2 disabled:opacity-50 ${
                  fieldErrors.name
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-200 focus:ring-indigo-600"
                }`}
              />
            </div>
            {fieldErrors.name && (
              <p id="signup-name-error" role="alert" className="text-xs font-medium text-red-600">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="signup-email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail aria-hidden="true" className="h-5 w-5" />
              </div>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => {
                  const next = e.target.value;
                  setEmail(next);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: validateEmail(next) }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({ ...prev, email: validateEmail(email) }))
                }
                placeholder="you@example.com"
                required
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
                className={`w-full rounded-xl border py-3 pl-10 pr-4 outline-none transition-all focus:border-transparent focus:ring-2 disabled:opacity-50 ${
                  fieldErrors.email
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-200 focus:ring-indigo-600"
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p id="signup-email-error" role="alert" className="text-xs font-medium text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="signup-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock aria-hidden="true" className="h-5 w-5" />
              </div>
              <input
                id="signup-password"
                type={isPasswordVisible ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  const next = e.target.value;
                  setPassword(next);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: validatePassword(next),
                      confirmPassword: confirmPassword
                        ? validateConfirmPassword(next, confirmPassword)
                        : prev.confirmPassword,
                    }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    password: validatePassword(password),
                  }))
                }
                placeholder="Create a password (min. 6 characters)"
                required
                minLength={6}
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "signup-password-error" : "signup-password-hint"}
                className={`w-full rounded-xl border py-3 pl-10 pr-12 outline-none transition-all focus:border-transparent focus:ring-2 disabled:opacity-50 ${
                  fieldErrors.password
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-200 focus:ring-indigo-600"
                }`}
              />
              <button
                type="button"
                onClick={() => setIsPasswordVisible((prev) => !prev)}
                disabled={isLoading}
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
            {fieldErrors.password ? (
              <p id="signup-password-error" role="alert" className="text-xs font-medium text-red-600">
                {fieldErrors.password}
              </p>
            ) : (
              <p id="signup-password-hint" className="text-xs text-slate-500">
                Use at least 6 characters.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-slate-700">
              Confirm Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock aria-hidden="true" className="h-5 w-5" />
              </div>
              <input
                id="signup-confirm-password"
                type={isConfirmPasswordVisible ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  const next = e.target.value;
                  setConfirmPassword(next);
                  setLocalError(null);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: validateConfirmPassword(password, next),
                    }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    confirmPassword: validateConfirmPassword(password, confirmPassword),
                  }))
                }
                placeholder="Type your password again"
                required
                minLength={6}
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={
                  fieldErrors.confirmPassword ? "signup-confirm-password-error" : undefined
                }
                className={`w-full rounded-xl border py-3 pl-10 pr-12 outline-none transition-all focus:border-transparent focus:ring-2 disabled:opacity-50 ${
                  fieldErrors.confirmPassword
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-200 focus:ring-indigo-600"
                }`}
              />
              <button
                type="button"
                onClick={() => setIsConfirmPasswordVisible((prev) => !prev)}
                disabled={isLoading}
                aria-label={
                  isConfirmPasswordVisible
                    ? "Hide confirm password"
                    : "Show confirm password"
                }
                className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
              >
                {isConfirmPasswordVisible ? (
                  <EyeOff aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <Eye aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p
                id="signup-confirm-password-error"
                role="alert"
                className="text-xs font-medium text-red-600"
              >
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                <span>Creating account…</span>
              </>
            ) : (
              <>
                Sign Up
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

        {/* Google Sign Up */}
        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={isLoading}
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
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Log in
          </button>
        </div>
      </motion.div>
    </div>
  );
}
