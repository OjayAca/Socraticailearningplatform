/** Profile details and learner statistics. */

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Shield,
  Sun,
  User,
} from "lucide-react";
import { motion } from "motion/react";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserStats } from "@/types";

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
                  className="px-6 py-2 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
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
