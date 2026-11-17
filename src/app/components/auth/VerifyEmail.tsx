/**
 * Email verification gate screen for unverified email/password accounts.
 *
 * Requires users who registered with email and password to confirm ownership
 * of their inbox via Firebase's verification link before accessing protected
 * learning routes.
 *
 * @module components/auth/VerifyEmail
 */

import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  Mail,
  Loader2,
  RefreshCw,
  LogOut,
  Send,
} from "lucide-react";
import { motion } from "motion/react";
import {
  getDashboardPath,
  isAdminRole,
  useAuthStore,
} from "@/stores/auth-store";
import { MindGuideLogo } from "../MindGuideLogo";
import { Alert } from "../ui/alert";

/**
 * Renders the email verification screen with actions to check verification
 * status, resend the verification email, or sign out.
 *
 * @returns The email verification gate view or a redirect when inapplicable.
 */
export function VerifyEmail() {
  const navigate = useNavigate();
  const {
    firebaseUser,
    userProfile,
    isLoading,
    error,
    sendVerification,
    refreshVerification,
    signOut,
    clearError,
  } = useAuthStore();

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [verificationStatusMessage, setVerificationStatusMessage] = useState<
    string | null
  >(null);
  const [verificationErrorMessage, setVerificationErrorMessage] = useState<
    string | null
  >(null);
  const actionPendingRef = useRef(false);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading verification status"
        className="flex h-full flex-1 items-center justify-center bg-slate-50"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  const isEmailAlreadyVerified =
    firebaseUser.emailVerified === true || isAdminRole(userProfile?.role);

  if (isEmailAlreadyVerified) {
    return (
      <Navigate
        to={getDashboardPath(userProfile?.role ?? "student")}
        replace
      />
    );
  }

  const targetEmailAddress =
    firebaseUser.email || userProfile?.email || "your email address";
  const isActionBusy = isCheckingStatus || isResendingEmail;

  /**
   * Reloads the Firebase Auth user and token claims to confirm whether the
   * verification link has been clicked.
   */
  async function handleCheckVerification() {
    if (isActionBusy || actionPendingRef.current) return;
    actionPendingRef.current = true;
    clearError();
    setVerificationStatusMessage(null);
    setVerificationErrorMessage(null);
    setIsCheckingStatus(true);

    try {
      const isNowVerified = await refreshVerification();
      if (isNowVerified) {
        navigate(getDashboardPath(userProfile?.role ?? "student"), {
          replace: true,
        });
      } else {
        setVerificationErrorMessage(
          "Your email is still unverified. Open the verification link sent to your inbox (or spam folder), then try again."
        );
      }
    } catch (caughtError) {
      setVerificationErrorMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Verification status could not be checked. Please try again."
      );
    } finally {
      setIsCheckingStatus(false);
      actionPendingRef.current = false;
    }
  }

  /**
   * Sends a fresh verification link to the signed-in user's email address.
   */
  async function handleResendVerification() {
    if (isActionBusy || actionPendingRef.current) return;
    actionPendingRef.current = true;
    clearError();
    setVerificationStatusMessage(null);
    setVerificationErrorMessage(null);
    setIsResendingEmail(true);

    try {
      await sendVerification();
      setVerificationStatusMessage(
        "Verification email sent. Open the link in your inbox (or spam folder), then select \"I've Verified My Email\"."
      );
    } catch (caughtError) {
      setVerificationErrorMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Verification email could not be sent. Please try again."
      );
    } finally {
      setIsResendingEmail(false);
      actionPendingRef.current = false;
    }
  }

  /**
   * Signs out the current unverified account and returns to the login screen.
   */
  async function handleSignOut() {
    if (isActionBusy || actionPendingRef.current) return;
    actionPendingRef.current = true;
    clearError();
    setVerificationStatusMessage(null);
    setVerificationErrorMessage(null);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      // Error is handled by the store
    } finally {
      actionPendingRef.current = false;
    }
  }

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const displayedError = verificationErrorMessage || error;

  return (
    <div className="auth-page flex min-h-full flex-1 flex-col items-center bg-slate-50 p-4 sm:p-6">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        className="my-auto w-full max-w-md shrink-0 space-y-6 rounded-3xl bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8"
      >
        <div className="space-y-2 text-center">
          <MindGuideLogo className="mx-auto mb-4 h-24 w-28 rounded-2xl bg-white" />
          <h2 className="text-2xl font-bold text-slate-900">
            Verify Your Email
          </h2>
          <p className="text-sm text-slate-500">
            We sent a verification link to{" "}
            <span className="break-all font-semibold text-slate-800">
              {targetEmailAddress}
            </span>
            . Click the link in your inbox to activate your account.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs leading-5 text-indigo-950">
          <Mail aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <div>
            <p className="font-semibold">Why is this required?</p>
            <p className="mt-1 text-indigo-900/80">
              MINDGUIDE requires a real, verified email address before you can
              access learning sessions. Check your spam or promotions folder if
              the email does not appear within a minute.
            </p>
          </div>
        </div>

        {displayedError && (
          <Alert tone="error">
            <span>{displayedError}</span>
          </Alert>
        )}

        {verificationStatusMessage && (
          <Alert tone="success">
            <span>{verificationStatusMessage}</span>
          </Alert>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handleCheckVerification()}
            disabled={isActionBusy}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCheckingStatus ? (
              <>
                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                <span>Checking verification…</span>
              </>
            ) : (
              <>
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                I&apos;ve Verified My Email
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleResendVerification()}
            disabled={isActionBusy}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isResendingEmail ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                <span>Sending verification email…</span>
              </>
            ) : (
              <>
                <Send aria-hidden="true" className="h-4 w-4" />
                Resend Verification Email
              </>
            )}
          </button>
        </div>

        <div className="border-t border-slate-100 pt-2 text-center">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isActionBusy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Sign out or use a different email
          </button>
        </div>
      </motion.div>
    </div>
  );
}
