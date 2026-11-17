/** Profile details and learner statistics. */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Mail,
  Shield,
  Sun,
  User,
} from "lucide-react";
import { motion } from "motion/react";
import { useLocation } from "react-router";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserStats } from "@/types";
import type { AchievementAward, AchievementId, AdaptiveRecommendation } from "@mindguide/contracts";
import { AchievementGrid } from "../AchievementGrid";
import { Alert } from "../ui/alert";

export function ProfileContent() {
  const { hash } = useLocation();
  const { userProfile, firebaseUser, sendVerification, refreshVerification, updateDisplayName, isNameSaving, error, clearError } = useAuthStore();
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(userProfile?.displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [learningStats, setLearningStats] = useState<UserStats | null>(null);
  const [achievements, setAchievements] = useState<Partial<Record<AchievementId, AchievementAward>>>({});
  const [topicRecommendations, setTopicRecommendations] = useState<Record<string, AdaptiveRecommendation>>({});

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
        setAchievements(progress.achievements ?? {});
        setTopicRecommendations((progress.topicRecommendations ?? {}) as Record<string, AdaptiveRecommendation>);
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

  useEffect(() => {
    if (hash !== "#achievements") return;
    document.getElementById("achievements")?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
  }, [hash]);

  const stats = learningStats ?? userProfile?.stats;

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setSaveError(null);
    if (!newName.trim() || newName.trim() === userProfile?.displayName) {
      setIsEditing(false);
      return;
    }

    if (isSaving || isNameSaving) return;
    setIsSaving(true);
    setIsEditing(false);
    try {
      await updateDisplayName(newName.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setIsEditing(false);
    } catch (caughtError) {
      setIsEditing(true);
      setSaveError(
        caughtError instanceof Error
          ? caughtError.message
          : "Your display name could not be updated. Try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function verifyEmail(refresh: boolean) {
    setVerificationBusy(true);
    setVerificationMessage("");
    try {
      if (refresh) {
        const verified = await refreshVerification();
        setVerificationMessage(verified ? "Email verified. You can return to task selection." : "Your email is still unverified. Open the verification link, then check again.");
      } else {
        await sendVerification();
        setVerificationMessage("Verification email sent. Open its link, then select Check verification.");
      }
    } catch (caught) {
      setVerificationMessage(caught instanceof Error ? caught.message : "Verification could not be completed. Try again.");
    } finally {
      setVerificationBusy(false);
    }
  }

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
      {/* Hero Profile Card */}
      <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-10 dark:opacity-20"></div>
        <div className="relative z-10 w-32 h-32 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-4xl font-bold text-indigo-600 dark:text-indigo-400 border-4 border-white dark:border-slate-900 shadow-xl flex-shrink-0">
          {initials}
        </div>
        <div className="relative z-10 min-w-0 w-full flex-1 text-center md:text-left">
          {isEditing ? (
            <form onSubmit={handleSaveName} className="flex flex-col md:flex-row items-center gap-3">
              <input
                type="text"
                aria-label="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
                className="min-h-11 w-full min-w-0 max-w-xs flex-1 rounded-xl border-2 border-indigo-200 bg-transparent px-4 py-2 text-base font-bold focus:border-indigo-600 focus:outline-none sm:text-xl dark:border-indigo-800 dark:text-white dark:focus:border-indigo-400"
                autoFocus
              />
              <div className="flex shrink-0 gap-2">
                <button
                  type="submit"
                  disabled={isSaving || !newName.trim()}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-6 py-2 font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-slate-100 px-6 py-2 font-medium text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{displayName}</h2>
              <button
                type="button"
                disabled={isSaving || isNameSaving}
                onClick={() => {
                  setNewName(displayName);
                  setSaveError(null);
                  setIsEditing(true);
                }}
                className="inline-flex min-h-11 items-center self-center rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 md:self-auto dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                {isSaving || isNameSaving ? "Saving name…" : "Edit Name"}
              </button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
            <div className="flex min-w-0 max-w-full items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
              <Mail aria-hidden="true" className="w-4 h-4 shrink-0 text-slate-400" />
              {userProfile?.email}
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400">
              <Shield aria-hidden="true" className="w-4 h-4 text-emerald-500" />
              <span className="capitalize">{userProfile?.role || "Pending Role"}</span>
            </div>
          </div>
        </div>

        {saveSuccess && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            role="status"
            className="absolute top-4 right-4 bg-emerald-50 dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm"
          >
            <CheckCircle2 aria-hidden="true" className="w-4 h-4" /> Profile Updated
          </motion.div>
        )}
      </div>

      {firebaseUser && !firebaseUser.emailVerified && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <h3 className="font-bold">Verify your email</h3>
          <p className="mt-2 text-sm">Pilot admission requires a verified email and an administrator invitation.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={verificationBusy}
              onClick={() => void verifyEmail(false)}
              className="min-h-11 rounded-xl border border-amber-300 bg-white/80 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
            >
              Send verification email
            </button>
            <button
              type="button"
              disabled={verificationBusy}
              onClick={() => void verifyEmail(true)}
              className="min-h-11 rounded-xl border border-amber-300 bg-white/80 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
            >
              Check verification
            </button>
          </div>
        </section>
      )}
      {verificationMessage && <p role="status" className="text-sm text-slate-700 dark:text-slate-300">{verificationMessage}</p>}

      {(saveError || error) && (
        <Alert tone="error">{saveError || error}</Alert>
      )}

      {isAdministrator ? (
        <div className="rounded-3xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 sm:p-8">
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
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{stats?.sessionsCompleted || 0}</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Sessions Completed</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{stats?.averageCTScore || 0}%</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Avg Scorecard Total</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center mb-4">
                <Sun className="w-6 h-6" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{stats?.currentStreak || 0}</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Day Streak</div>
            </div>
          </div>
          {Object.keys(topicRecommendations).length > 0 && (
            <section className="mt-10" aria-label="Topic Mastery">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Topic Mastery</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(topicRecommendations).map(([key, rec]) => {
                  const status = rec.masteryStatus ?? "Developing";
                  const badgeTone = status === "Mastered"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : status === "Needs remediation"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300";
                  const topicTitle = key.split("_").map(w => w ? w[0].toUpperCase() + w.slice(1) : "").join(" ");
                  return (
                    <div key={key} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{topicTitle}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Recommended level: {rec.recommendedDifficulty}
                          {rec.decisionLabel ? ` · ${rec.decisionLabel}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badgeTone}`}>
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <div className="mt-10"><AchievementGrid achievements={achievements} /></div>
        </>
      )}
    </div>
  );
}
