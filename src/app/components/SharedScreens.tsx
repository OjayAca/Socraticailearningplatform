import { useState, useEffect } from "react";
import { User, Settings, Mail, Shield, CheckCircle2, Loader2, ArrowRight, Sun, Moon, Bell } from "lucide-react";
import { motion } from "motion/react";
import { useAuthStore } from "@/stores/auth-store";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, firebaseSetupMessage } from "@/lib/firebase";
import { useTheme } from "next-themes";
import { useNotificationStore } from "@/stores/notification-store";

// ─── Profile Content ────────────────────────────────────────────────

export function ProfileContent() {
  const { userProfile, updateDisplayName, isLoading } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(userProfile?.displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const displayName = userProfile?.displayName || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
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
    } catch (err) {
      console.error("Failed to update name", err);
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
                className="px-4 py-2 text-xl font-bold border-2 border-indigo-200 dark:border-indigo-800 bg-transparent dark:text-white rounded-xl focus:border-indigo-600 dark:focus:border-indigo-400 focus:outline-none w-full max-w-xs"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
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
                onClick={() => setIsEditing(true)}
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

      {/* Stats Grid */}
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-12 mb-6">Your Learning Stats</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-4">
            <User className="w-6 h-6" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{userProfile?.stats?.sessionsCompleted || 0}</div>
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Sessions Completed</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{userProfile?.stats?.averageCTScore || 0}%</div>
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Avg Scorecard Total</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center mb-4">
            <Sun className="w-6 h-6" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{userProfile?.stats?.currentStreak || 0}</div>
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Day Streak</div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Content ───────────────────────────────────────────────

export function SettingsContent() {
  const { userProfile } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [resetSent, setResetSent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  async function handleResetPassword() {
    if (!userProfile?.email || !auth) {
      console.error(firebaseSetupMessage);
      return;
    }
    setIsSending(true);
    try {
      await sendPasswordResetEmail(auth, userProfile.email);
      setResetSent(true);
    } catch (err) {
      console.error("Error sending reset email", err);
    } finally {
      setIsSending(false);
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
            </div>
          </div>
        </div>

        {/* Notifications (Mock UI Settings) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 space-y-6 lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notifications</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start justify-between border-b border-slate-50 dark:border-slate-800 pb-4">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">Email Updates</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Receive an email when a session is reviewed or returned.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex items-start justify-between border-b border-slate-50 dark:border-slate-800 pb-4">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">In-App Alerts</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Show toast notifications when you receive a new message or hint.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

// ─── Notification Content ──────────────────────────────────────────

export function NotificationContent() {
  const { firebaseUser, userProfile } = useAuthStore();
  const { notifications, unreadCount, markAsRead, generateMockNotification, markAllAsRead, listenToNotifications } = useNotificationStore();

  useEffect(() => {
    if (firebaseUser?.uid) listenToNotifications(firebaseUser.uid);
  }, [firebaseUser?.uid, listenToNotifications]);

  const isTeacher = userProfile?.role === "teacher";

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
              onClick={() => markAllAsRead()}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              Mark all as read
            </button>
          )}
          <button
            onClick={() => {
              if (firebaseUser?.uid) generateMockNotification(firebaseUser.uid, isTeacher);
            }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition"
          >
            Generate Test Alert
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-16 text-center">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">All caught up!</h3>
            <p className="text-slate-500 dark:text-slate-400">You don't have any notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => !notif.read && markAsRead(notif.id)}
                className={`p-6 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors cursor-pointer ${
                  notif.read
                    ? "bg-transparent text-slate-500 dark:text-slate-400"
                    : "bg-indigo-50/50 dark:bg-indigo-900/10 text-slate-900 dark:text-white"
                }`}
              >
                <div
                  className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center ${
                    notif.read ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500" : "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
                  }`}
                >
                  <Bell className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h4 className={`font-semibold ${notif.read ? "text-slate-700 dark:text-slate-300" : "text-indigo-950 dark:text-indigo-50"}`}>
                    {notif.title}
                  </h4>
                  <p className="text-sm mt-1 opacity-90">{notif.message}</p>
                </div>
                {!notif.read && (
                  <div className="w-3 h-3 flex-shrink-0 bg-indigo-600 rounded-full self-start sm:self-center"></div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
