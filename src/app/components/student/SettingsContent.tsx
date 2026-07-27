/** Account, theme, and notification settings. */

import { useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Loader2,
  Moon,
  Shield,
  Sun,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useTheme } from "next-themes";
import { useNotificationStore } from "@/stores/notification-store";

export function SettingsContent() {
  const { firebaseUser, userProfile, resetPassword, clearError } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();
  const {
    liveAlertPopups,
    isPreferenceLoading,
    isPreferenceSaving,
    preferenceError,
    setLiveAlertPopups,
  } = useNotificationStore();
  const [resetSent, setResetSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleResetPassword() {
    clearError();
    setResetError(null);
    if (!userProfile?.email) {
      setResetError("Your profile does not contain an email address.");
      return;
    }
    setIsSending(true);
    try {
      await resetPassword(userProfile.email);
      setResetSent(true);
    } catch (caughtError) {
      setResetError(
        caughtError instanceof Error
          ? caughtError.message
          : "The password reset email could not be sent. Try again."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleLiveAlertsChange(enabled: boolean) {
    if (!firebaseUser?.uid) return;
    try {
      await setLiveAlertPopups(firebaseUser.uid, enabled);
    } catch {
      // The store retains a visible, actionable preference error.
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Settings</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Manage your account preferences and configurations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Appearance Settings */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
              <Sun className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Appearance</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">Select your preferred platform theme.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setTheme("light")}
                className={`flex-1 py-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                  resolvedTheme === "light" ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/50 dark:text-indigo-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <Sun className="w-6 h-6" />
                <span className="font-semibold text-sm">Light Mode</span>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex-1 py-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                  resolvedTheme === "dark" ? "border-slate-800 bg-slate-900 text-white dark:border-slate-500 dark:bg-slate-800" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <Moon className="w-6 h-6" />
                <span className="font-semibold text-sm">Dark Mode</span>
              </button>
            </div>
          </div>
        </div>

        {/* Account Security */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Account Security</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Account Email</label>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{userProfile?.email}</p>
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 block mb-2">Password Reset</label>
              <button
                onClick={handleResetPassword}
                disabled={isSending || resetSent}
                className="w-full py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl transition flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : resetSent ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Reset Link Sent
                  </>
                ) : (
                  "Send Reset Email"
                )}
              </button>
              <p className="text-xs text-slate-400 mt-2 text-center">
                We'll send a secure link to your email to reset your password.
              </p>
              {resetError && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notification popup preference */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 space-y-6 lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notifications</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-6 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">Live alert popups</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Show a toast when a new submission or review arrives. Every update
                  remains available in the notification center even when popups are off.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={liveAlertPopups}
                  disabled={
                    !firebaseUser?.uid ||
                    isPreferenceLoading ||
                    isPreferenceSaving
                  }
                  onChange={(event) =>
                    void handleLiveAlertsChange(event.target.checked)
                  }
                  aria-label="Enable live alert popups"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            {(isPreferenceLoading || isPreferenceSaving) && (
              <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isPreferenceLoading ? "Loading saved preference…" : "Saving preference…"}
              </p>
            )}
            {preferenceError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{preferenceError}</span>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
