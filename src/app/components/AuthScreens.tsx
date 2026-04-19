/**
 * Authentication screens — Splash, Login, SignUp, and RoleSelection.
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
  GraduationCap,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useAuthStore } from "@/stores/auth-store";

// ─── Splash Screen ──────────────────────────────────────────

/** Screen 1: Welcome / landing page with Log In and Sign Up CTAs. */
export function Splash() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuthStore();

  // If already authenticated, redirect to the appropriate dashboard
  if (firebaseUser && userProfile?.role) {
    const destination =
      userProfile.role === "teacher"
        ? "/teacher/dashboard"
        : "/student/dashboard";
    return <Navigate to={destination} replace />;
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
            SocratAI
          </h1>
          <p className="text-lg text-indigo-600 font-medium">
            Think First, Don't Copy First
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
  const { signIn, signInWithGoogle, error, isLoading, clearError } =
    useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /**
   * Handles email/password login submission.
   * On success, the auth listener in App.tsx will redirect.
   */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearError();

    if (!email.trim() || !password.trim()) return;

    try {
      await signIn(email.trim(), password);
      navigate("/role");
    } catch {
      // Error is already set in the store
    }
  }

  /** Handles Google OAuth sign-in. */
  async function handleGoogleSignIn() {
    clearError();
    try {
      await signInWithGoogle();
      navigate("/role");
    } catch {
      // Error is already set in the store
    }
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
            Log in to continue your learning journey.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

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
   * On success, the user is auto-signed-in and redirected to role selection.
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
      await signUp(name.trim(), email.trim(), password);
      navigate("/role");
    } catch {
      // Error is already set in the store
    }
  }

  /** Handles Google OAuth sign-up. */
  async function handleGoogleSignUp() {
    clearError();
    setLocalError(null);
    try {
      await signInWithGoogle();
      navigate("/role");
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
            Join SocratAI to start your learning journey.
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

// ─── Role Selection ─────────────────────────────────────────

/** Screen 4: Post-login role selection (Student vs Teacher). */
export function RoleSelection() {
  const navigate = useNavigate();
  const { userProfile, setRole, isLoading } = useAuthStore();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // If user already has a role, redirect
  if (userProfile?.role) {
    const destination =
      userProfile.role === "teacher"
        ? "/teacher/dashboard"
        : "/student/dashboard";
    return <Navigate to={destination} replace />;
  }

  const displayName = userProfile?.displayName || "there";

  /**
   * Handles role selection — saves to Firestore and navigates to dashboard.
   *
   * @param role - The selected role.
   */
  async function handleRoleSelect(role: "student" | "teacher") {
    setSelectedRole(role);
    try {
      await setRole(role);
      navigate(
        role === "teacher" ? "/teacher/dashboard" : "/student/dashboard"
      );
    } catch {
      setSelectedRole(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg space-y-8"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-slate-900">
            Welcome, {displayName}!
          </h2>
          <p className="text-slate-500">
            How are you using SocratAI today?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleRoleSelect("student")}
            disabled={isLoading}
            className={`group p-8 bg-white border-2 rounded-3xl transition-all shadow-sm hover:shadow-xl hover:shadow-indigo-100 flex flex-col items-center gap-4 text-center disabled:opacity-50 ${
              selectedRole === "student"
                ? "border-indigo-600"
                : "border-slate-100 hover:border-indigo-600"
            }`}
          >
            {selectedRole === "student" && isLoading ? (
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            ) : (
              <div className="w-20 h-20 bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center transition-colors">
                <User className="w-10 h-10" />
              </div>
            )}
            <div>
              <h3 className="text-xl font-bold text-slate-900">Student</h3>
              <p className="text-slate-500 text-sm mt-2">
                I want to learn and solve problems step-by-step.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleRoleSelect("teacher")}
            disabled={isLoading}
            className={`group p-8 bg-white border-2 rounded-3xl transition-all shadow-sm hover:shadow-xl hover:shadow-emerald-100 flex flex-col items-center gap-4 text-center disabled:opacity-50 ${
              selectedRole === "teacher"
                ? "border-emerald-600"
                : "border-slate-100 hover:border-emerald-600"
            }`}
          >
            {selectedRole === "teacher" && isLoading ? (
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
            ) : (
              <div className="w-20 h-20 bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center transition-colors">
                <GraduationCap className="w-10 h-10" />
              </div>
            )}
            <div>
              <h3 className="text-xl font-bold text-slate-900">Teacher</h3>
              <p className="text-slate-500 text-sm mt-2">
                I want to review logs and support my students.
              </p>
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
