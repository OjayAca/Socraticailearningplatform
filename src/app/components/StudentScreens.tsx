/**
 * Student-facing screens — Dashboard and Task Start.
 *
 * These components are connected to Firestore for real data and
 * use the auth store for the current user context.
 *
 * @module components/StudentScreens
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Plus,
  History,
  Activity,
  Bell,
  Settings,
  User,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  LogOut,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { useAuthStore } from "@/stores/auth-store";
import { useSessionStore } from "@/stores/session-store";

// ─── Sidebar Layout ─────────────────────────────────────────

/**
 * Layout wrapper for all student screens.
 * Provides sidebar navigation, header with user info, and a main content area.
 *
 * @param children - The page content.
 * @param activeTab - The currently active sidebar tab identifier.
 */
function StudentLayout({
  children,
  activeTab,
}: {
  children: React.ReactNode;
  activeTab: string;
}) {
  const navigate = useNavigate();
  const { userProfile, signOut } = useAuthStore();

  const displayName = userProfile?.displayName || "Student";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  /** Handles user sign-out and redirects to the splash page. */
  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">
            SocratAI
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => navigate("/student/dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "dashboard"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Activity className="w-5 h-5" /> Dashboard
          </button>
          <button
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "history"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <History className="w-5 h-5" /> Previous Sessions
          </button>
          <button
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "notifications"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Bell className="w-5 h-5" /> Notifications
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors font-medium text-sm">
            <User className="w-5 h-5" /> Profile
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors font-medium text-sm">
            <Settings className="w-5 h-5" /> Settings
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-red-500 hover:text-red-700 transition-colors font-medium text-sm"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 z-10 px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">
            Welcome, {displayName.split(" ")[0]}! 👋
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">
                {displayName}
              </p>
              <p className="text-xs text-slate-500">
                {userProfile?.email || ""}
              </p>
            </div>
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
              {initials}
            </div>
          </div>
        </header>
        <main className="p-8 pb-24">{children}</main>
      </div>
    </div>
  );
}

// ─── Student Dashboard ──────────────────────────────────────

/** Screen 5: Student dashboard with stats, CTA, and recent sessions. */
export function StudentDashboard() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuthStore();
  const { sessionHistory, fetchStudentSessions, isLoading } =
    useSessionStore();

  useEffect(() => {
    if (firebaseUser?.uid) {
      fetchStudentSessions(firebaseUser.uid);
    }
  }, [firebaseUser?.uid, fetchStudentSessions]);

  const stats = userProfile?.stats || {
    sessionsCompleted: 0,
    averageCTScore: 0,
    currentStreak: 0,
  };

  return (
    <StudentLayout activeTab="dashboard">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-8"
      >
        {/* Progress Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-2">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">
              Critical Thinking Score
            </span>
            <span className="text-3xl font-bold text-slate-900">
              {stats.averageCTScore}
              <span className="text-lg text-slate-400">/100</span>
            </span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-2">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">
              Tasks Completed
            </span>
            <span className="text-3xl font-bold text-slate-900">
              {stats.sessionsCompleted}
            </span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center mb-2">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">
              Current Streak
            </span>
            <span className="text-3xl font-bold text-slate-900">
              {stats.currentStreak} Days
            </span>
          </div>
        </div>

        {/* Start New Session CTA */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-3xl p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-200/50">
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="text-2xl font-bold">
              Ready to tackle a new problem?
            </h2>
            <p className="text-indigo-100 max-w-md">
              Start a new guided session. Remember, we focus on the process, not
              just the answer.
            </p>
          </div>
          <button
            onClick={() => navigate("/student/task")}
            className="flex-shrink-0 bg-white text-indigo-600 px-6 py-4 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Start New Session
          </button>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Recent Sessions</h3>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : sessionHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">
                No sessions yet. Start your first one!
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
              {sessionHistory.map((session) => {
                const statusColors: Record<string, string> = {
                  in_progress: "bg-blue-50 text-blue-700",
                  submitted: "bg-amber-50 text-amber-700",
                  reviewed: "bg-emerald-50 text-emerald-700",
                  returned: "bg-red-50 text-red-700",
                };
                const statusLabels: Record<string, string> = {
                  in_progress: "In Progress",
                  submitted: "Submitted",
                  reviewed: "Reviewed",
                  returned: "Returned",
                };

                return (
                  <div
                    key={session.id}
                    className="p-4 sm:p-6 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {session.topic || session.originalQuestion?.slice(0, 40)}
                        </h4>
                        <p className="text-sm text-slate-500">
                          {session.subject}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          statusColors[session.status] || ""
                        }`}
                      >
                        {statusLabels[session.status] || session.status}
                      </span>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </StudentLayout>
  );
}

// ─── Task Start ─────────────────────────────────────────────

/** Screen 6: New session creation form. */
export function TaskStart() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuthStore();
  const { createSession, isLoading } = useSessionStore();

  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");

  /**
   * Creates a new Firestore session and navigates to the trigger screen.
   */
  async function handleStartSession() {
    if (!subject || !question.trim() || !firebaseUser) return;

    try {
      await createSession(
        firebaseUser.uid,
        userProfile?.displayName || "Student",
        subject,
        question.trim()
      );
      navigate("/session/trigger");
    } catch {
      // Error is handled in the store
    }
  }

  return (
    <StudentLayout activeTab="dashboard">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-3xl mx-auto"
      >
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 p-8 space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">
              Start a New Task
            </h2>
            <p className="text-slate-500">
              What do you need help with today?
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Select Subject
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none appearance-none bg-white text-slate-800 font-medium disabled:opacity-50"
              >
                <option value="" disabled>
                  Choose a subject...
                </option>
                <option value="Mathematics">Mathematics</option>
                <option value="Science">Science</option>
                <option value="History">History</option>
                <option value="English / Literature">
                  English / Literature
                </option>
                <option value="Computer Science">Computer Science</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Your Question or Problem
              </label>
              <textarea
                rows={5}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type or paste the problem you're trying to solve..."
                disabled={isLoading}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none text-slate-800 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <button
              onClick={() => navigate(-1)}
              disabled={isLoading}
              className="text-slate-500 hover:text-slate-700 font-semibold px-4 py-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStartSession}
              disabled={isLoading || !subject || !question.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Start Guidance
                  <BrainCircuit className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </StudentLayout>
  );
}
