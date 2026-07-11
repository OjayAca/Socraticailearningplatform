/**
 * Authentication screens — Splash, Login, and SignUp.
 *
 * These components are wired to Firebase Auth via the Zustand auth store.
 * All forms include validation, loading states, and error display.
 *
 * @module components/AuthScreens
 */

import { useState } from "react";
import { useNavigate, Navigate } from "react-router";
import {
  BrainCircuit,
  Mail,
  Lock,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { motion } from "motion/react";
import { getDashboardPath, useAuthStore } from "@/stores/auth-store";

// ─── Splash Screen ──────────────────────────────────────────

/** Screen 1: Welcome / landing page with Log In and Sign Up CTAs. */
export function Splash() {
  const navigate = useNavigate();
  const {
    firebaseUser,
    userProfile,
    isLoading,
    error,
    reloadProfile,
    signOut,
  } = useAuthStore();

  // If already authenticated, redirect to the appropriate dashboard
  if (firebaseUser && userProfile?.role) {
    return <Navigate to={getDashboardPath(userProfile.role)} replace />;
  }

  if (firebaseUser && isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-slate-600">
          Loading your MINDGUIDE profile…
        </p>
      </div>
    );
  }

  if (firebaseUser && !userProfile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 h-full p-6">
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900">
            Your profile is unavailable
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {error ||
              "Your sign-in succeeded, but MINDGUIDE could not read your Firestore profile."}
          </p>
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => void reloadProfile().catch(() => undefined)}
              className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700"
            >
              Retry profile
            </button>
            <button
              type="button"
              onClick={() => void signOut().catch(() => undefined)}
              className="w-full rounded-xl border border-slate-200 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 h-full p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 max-w-sm w-full"
      >
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-200">
          <BrainCircuit className="w-12 h-12" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
            MINDGUIDE
          </h1>
          <p className="text-lg text-indigo-600 font-medium">
            Reason Before Reveal
          </p>
        </div>

        <div className="w-full space-y-3 mt-12">
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-md shadow-indigo-100 flex justify-center items-center gap-2"
          >
            Log In
          </button>
          <button
            onClick={() => navigate("/signup")}
            className="w-full bg-white hover:bg-slate-50 text-indigo-600 font-semibold py-4 rounded-xl transition-all border border-indigo-100 shadow-sm"
          >
            Sign Up
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Login Screen ───────────────────────────────────────────

/** Screen 2: Email/password login form with Google OAuth option. */
export function Login() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, resetPassword, error, isLoading, clearError } =
    useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetSending, setIsResetSending] = useState(false);

  const resetSuccessMessage =
    "If an account exists for this email, a password reset link has been sent.";

  /**
   * Handles email/password login submission.
   * On success, the auth listener in App.tsx will redirect.
   */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setResetSuccess(false);

    if (!email.trim() || !password.trim()) return;

    try {
      const profile = await signIn(email.trim(), password);
      navigate(getDashboardPath(profile.role));
    } catch {
      // Error is already set in the store
    }
  }

  /** Handles Google OAuth sign-in. */
  async function handleGoogleSignIn() {
    clearError();
    setResetSuccess(false);
    try {
      const profile = await signInWithGoogle();
      navigate(getDashboardPath(profile.role));
    } catch {
      // Error is already set in the store
    }
  }

  /** Sends a password reset email for the entered address. */
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setResetSuccess(false);

    if (!email.trim()) return;

    setIsResetSending(true);
    try {
      await resetPassword(email.trim());
      setResetSuccess(true);
    } catch {
      // Error is already set in the store
    } finally {
      setIsResetSending(false);
    }
  }

  function showResetMode() {
    clearError();
    setResetSuccess(false);
    setIsResetMode(true);
  }

  function showLoginMode() {
    clearError();
    setResetSuccess(false);
    setIsResetMode(false);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 space-y-8"
      >
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome Back</h2>
          <p className="text-slate-500 text-sm">
            {isResetMode
              ? "Enter your email and we'll send a secure reset link."
              : "Log in to continue your learning journey."}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resetSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{resetSuccessMessage}</span>
          </div>
        )}

        {isResetMode ? (
          <>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 block">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={isLoading || isResetSending}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || isResetSending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading || isResetSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={showLoginMode}
              disabled={isLoading || isResetSending}
              className="w-full text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50"
            >
              Back to log in
            </button>
          </>
        ) : (
          <>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">
              Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-5 w-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 block">
                Password
              </label>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={showResetMode}
                disabled={isLoading}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Log In
                <ArrowRight className="w-4 h-4" />
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
            <span className="bg-white px-3 text-slate-400 font-semibold">
              or continue with
            </span>
          </div>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3.5 rounded-xl transition-all border border-slate-200 shadow-sm flex justify-center items-center gap-3 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            onClick={() => navigate("/signup")}
            className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
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

// ─── Sign Up Screen ─────────────────────────────────────────

/** Screen 3: Account creation form. */
export function SignUp() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle, error, isLoading, clearError } =
    useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Handles new account creation.
   * On success, the user is auto-signed-in and redirected to the student dashboard.
   */
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!name.trim() || !email.trim() || !password.trim()) return;

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match. Please try again.");
      return;
    }

    try {
      const profile = await signUp(name.trim(), email.trim(), password);
      navigate(getDashboardPath(profile.role));
    } catch {
      // Error is already set in the store
    }
  }

  /** Handles Google OAuth sign-up. */
  async function handleGoogleSignUp() {
    clearError();
    setLocalError(null);
    try {
      const profile = await signInWithGoogle();
      navigate(getDashboardPath(profile.role));
    } catch {
      // Error is already set in the store
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 space-y-8"
      >
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            Create an Account
          </h2>
          <p className="text-slate-500 text-sm">
            Join MINDGUIDE to start your learning journey.
          </p>
        </div>

        {/* Error Alert */}
        {(error || localError) && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{localError || error}</span>
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="h-5 w-5" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Student"
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">
              Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-5 w-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password (min. 6 characters)"
                required
                minLength={6}
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">
              Confirm Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type your password again"
                required
                minLength={6}
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Sign Up
                <ArrowRight className="w-4 h-4" />
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
            <span className="bg-white px-3 text-slate-400 font-semibold">
              or continue with
            </span>
          </div>
        </div>

        {/* Google Sign Up */}
        <button
          onClick={handleGoogleSignUp}
          disabled={isLoading}
          className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3.5 rounded-xl transition-all border border-slate-200 shadow-sm flex justify-center items-center gap-3 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            onClick={() => navigate("/login")}
            className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors inline-flex"
          >
            Log in
          </button>
        </div>
      </motion.div>
    </div>
  );
}

