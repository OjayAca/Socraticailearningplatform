import { useEffect, useState } from "react";
import { User, Mail, Shield, CheckCircle2, Loader2, Sun, Moon, Bell, AlertCircle, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";
import { useTheme } from "next-themes";
import {
  getNotificationActionUrl,
  getNotificationText,
  useNotificationStore,
} from "@/stores/notification-store";
import { useNavigate } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserStats } from "@/types";

// ─── Profile Content ────────────────────────────────────────────────

export function ProfileContent() {
  const { userProfile, updateDisplayName, error, clearError } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(userProfile?.displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [learningStats, setLearningStats] = useState<UserStats | null>(null);

  const displayName = userProfile?.displayName || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isAdministrator = isAdminRole(userProfile?.role);
  useEffect(() => {
    if (!db || !userProfile?.uid || isAdministrator) return;
    let active = true;
    getDoc(doc(db, "learning_progress", userProfile.uid))
      .then((snapshot) => {
        if (!active || !snapshot.exists()) return;
        const progress = snapshot.data();
        const completed = Number(progress.sessionsCompleted ?? 0);
        setLearningStats({
          sessionsCompleted: completed,
          averageCTScore: Number(progress.averageCTScore ?? (completed ? Math.round(Number(progress.scoreTotal ?? 0) / completed) : 0)),
          currentStreak: Number(progress.currentStreak ?? 0),
          lastSessionDate: progress.lastSessionAt ?? null,
          topicPerformance: [],
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [isAdministrator, userProfile?.uid]);
  const stats = learningStats ?? userProfile?.stats;

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setSaveError(null);
    if (!newName.trim() || newName.trim() === userProfile?.displayName) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateDisplayName(newName.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setIsEditing(false);
    } catch (caughtError) {
      setSaveError(
        caughtError instanceof Error
          ? caughtError.message
          : "Your display name could not be updated. Try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero Profile Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-10 dark:opacity-20"></div>
        
        <div className="relative z-10 w-32 h-32 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-4xl font-bold text-indigo-600 dark:text-indigo-400 border-4 border-white dark:border-slate-900 shadow-xl flex-shrink-0">
          {initials}
        </div>
        
        <div className="relative z-10 flex-1 text-center md:text-left">
          {isEditing ? (
            <form onSubmit={handleSaveName} className="flex flex-col md:flex-row items-center gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
                className="px-4 py-2 text-xl font-bold border-2 border-indigo-200 dark:border-indigo-800 bg-transparent dark:text-white rounded-xl focus:border-indigo-600 dark:focus:border-indigo-400 focus:outline-none w-full max-w-xs"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving || !newName.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition flex items-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{displayName}</h2>
              <button
                onClick={() => {
                  setNewName(displayName);
                  setSaveError(null);
                  setIsEditing(true);
                }}
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1 rounded-full self-center md:self-auto"
              >
                Edit Name
              </button>
            </div>
          )}
          
          <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
              <Mail className="w-4 h-4 text-slate-400" />
              {userProfile?.email}
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="capitalize">{userProfile?.role || "Pending Role"}</span>
            </div>
          </div>
        </div>

        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 right-4 bg-emerald-50 dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" /> Profile Updated
          </motion.div>
        )}
      </div>

      {(saveError || error) && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{saveError || error}</span>
        </div>
      )}

      {isAdministrator ? (
        <div className="rounded-3xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                System administrator account
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                This account can review all submitted learning sessions and return
                guidance to students. Student learning statistics do not apply to
                administrator profiles.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-12 mb-6">Your Learning Stats</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-4">
                <User className="w-6 h-6" />
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.sessionsCompleted || 0}</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Sessions Completed</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.averageCTScore || 0}%</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Avg Scorecard Total</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center mb-4">
                <Sun className="w-6 h-6" />
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.currentStreak || 0}</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Day Streak</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Settings Content ───────────────────────────────────────────────

export function SettingsContent() {
  const { firebaseUser, userProfile, resetPassword, clearError } = useAuthStore();
  const { theme, setTheme } = useTheme();
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
                  theme === "light" ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/50 dark:text-indigo-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <Sun className="w-6 h-6" />
                <span className="font-semibold text-sm">Light Mode</span>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex-1 py-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                  theme === "dark" ? "border-slate-800 bg-slate-900 text-white dark:border-slate-500 dark:bg-slate-800" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
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

// ─── Notification Content ──────────────────────────────────────────

export function NotificationContent() {
  const { userProfile } = useAuthStore();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    retryNotifications,
  } = useNotificationStore();
  const navigate = useNavigate();
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  async function handleNotificationClick(
    notificationId: string,
    isRead: boolean,
    actionUrl?: string
  ) {
    try {
      if (!isRead) {
        await markAsRead(notificationId);
      }
    } catch {
      return;
    }
    if (actionUrl) {
      navigate(actionUrl);
    }
  }

  async function handleMarkAllAsRead() {
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
    } catch {
      // The notification store exposes the error directly below the heading.
    } finally {
      setIsMarkingAll(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Notifications</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            You have <strong className="text-indigo-600 dark:text-indigo-400">{unreadCount}</strong> unread updates.
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllAsRead()}
              disabled={isMarkingAll}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {isMarkingAll ? "Marking…" : "Mark all as read"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={retryNotifications}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 dark:border-red-800 px-4 py-2 font-semibold hover:bg-red-100 dark:hover:bg-red-950/50"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              Loading notifications…
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">All caught up!</h3>
            <p className="text-slate-500 dark:text-slate-400">You don't have any notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((notification) => {
              const { title, message } = getNotificationText(notification);
              const actionUrl = getNotificationActionUrl(
                notification,
                userProfile?.role
              );
              return (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() =>
                    void handleNotificationClick(
                      notification.id,
                      notification.read,
                      actionUrl
                    )
                  }
                  className={`w-full p-6 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors cursor-pointer text-left ${
                    notification.read
                      ? "bg-transparent text-slate-500 dark:text-slate-400"
                      : "bg-indigo-50/50 dark:bg-indigo-900/10 text-slate-900 dark:text-white"
                  }`}
                  aria-label={`${notification.read ? "Read" : "Unread"}: ${title}`}
                >
                  <span
                    className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center ${
                      notification.read ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500" : "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
                    }`}
                  >
                    <Bell className="w-6 h-6" />
                  </span>
                  <span className="flex-1">
                    <span className={`block font-semibold ${notification.read ? "text-slate-700 dark:text-slate-300" : "text-indigo-950 dark:text-indigo-50"}`}>
                      {title}
                    </span>
                    <span className="block text-sm mt-1 opacity-90">{message}</span>
                  </span>
                  {!notification.read && (
                    <span className="w-3 h-3 flex-shrink-0 bg-indigo-600 rounded-full self-start sm:self-center" aria-hidden="true"></span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
