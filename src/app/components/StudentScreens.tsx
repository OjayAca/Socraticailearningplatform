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
import { ProfileContent, SettingsContent, NotificationContent } from "./SharedScreens";
import { useNotificationStore } from "@/stores/notification-store";
import { SUBJECTS, SUBJECT_TOPICS } from "@/types";
import type { Subject, Topic } from "@/types";

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
  const { unreadCount } = useNotificationStore();

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
    <div className="flex flex-col md:flex-row h-full w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
            MINDGUIDE
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => navigate("/student/dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "dashboard"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Activity className="w-5 h-5" /> Dashboard
          </button>
          <button
            onClick={() => navigate("/student/history")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "history"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <History className="w-5 h-5" /> Previous Sessions
          </button>
          <button
            onClick={() => navigate("/student/notifications")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "notifications"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <div className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
              )}
            </div>
            Notifications
            {unreadCount > 0 && (
              <span className="ml-auto bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            onClick={() => navigate("/student/profile")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors font-medium text-sm rounded-xl ${
              activeTab === "profile"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <User className="w-5 h-5" /> Profile
          </button>
          <button
            onClick={() => navigate("/student/settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors font-medium text-sm rounded-xl ${
              activeTab === "settings"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Settings className="w-5 h-5" /> Settings
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors font-medium text-sm"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <header className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-10 px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Welcome, {displayName.split(" ")[0]}! 👋
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {displayName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userProfile?.email || ""}
              </p>
            </div>
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold border-2 border-white dark:border-indigo-900 shadow-sm">
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
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center mb-2">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Scorecard Total
            </span>
            <span className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats.averageCTScore}
              <span className="text-lg text-slate-400 dark:text-slate-500">/100</span>
            </span>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center mb-2">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Tasks Completed
            </span>
            <span className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats.sessionsCompleted}
            </span>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg flex items-center justify-center mb-2">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Current Streak
            </span>
            <span className="text-3xl font-bold text-slate-900 dark:text-white">
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
            Start MINDGUIDE Session
          </button>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Sessions</h3>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : sessionHistory.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">
                No sessions yet. Start your first one!
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
              {sessionHistory.slice(0, 3).map((session) => {
                const statusColors: Record<string, string> = {
                  in_progress: "bg-blue-50 text-blue-700",
                  completed: "bg-emerald-50 text-emerald-700",
                  submitted: "bg-amber-50 text-amber-700",
                  reviewed: "bg-emerald-50 text-emerald-700",
                  returned: "bg-red-50 text-red-700",
                };
                const statusLabels: Record<string, string> = {
                  in_progress: "In Progress",
                  completed: "Completed",
                  submitted: "Submitted",
                  reviewed: "Reviewed",
                  returned: "Returned",
                };

                return (
                  <div
                    key={session.id}
                    onClick={() => navigate(`/student/review/${session.id}`)}
                    className="p-4 sm:p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white">
                          {session.topic || session.originalQuestion?.slice(0, 40)}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
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
                      <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                    </div>
                  </div>
                );
              })}
              {sessionHistory.length > 3 && (
                <div 
                  className="p-4 text-center text-sm font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-b-2xl"
                  onClick={() => navigate("/student/history")}
                >
                  View all previous sessions
                </div>
              )}
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

  const [subject, setSubject] = useState<Subject | "">("");
  const [topic, setTopic] = useState<Topic | "">("");
  const [question, setQuestion] = useState("");

  const availableTopics = subject ? SUBJECT_TOPICS[subject] : [];
  const syntaxGuide = [
    "Use x^2 for exponents",
    "Use a/b for fractions",
    "Use sqrt(x) for square roots",
    "Use >= or <= for inequalities",
    "Use p -> q, AND, OR, NOT for logic expressions",
  ];

  function handleSubjectChange(value: string) {
    setSubject(value as Subject);
    setTopic("");
  }

  function handleTopicChange(value: string) {
    setTopic(value as Topic);
  }

  /**
   * Creates a new Firestore session and navigates to the trigger screen.
   */
  async function handleStartSession() {
    const trimmedQuestion = question.trim();
    if (!subject || !topic || !trimmedQuestion || !firebaseUser) return;

    try {
      await createSession(
        firebaseUser.uid,
        userProfile?.displayName || userProfile?.email || firebaseUser.email || "Student",
        subject,
        topic,
        trimmedQuestion,
        undefined,
        userProfile?.email || firebaseUser.email || null
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
              Start MINDGUIDE Session
            </h2>
            <p className="text-slate-500">
              Choose a subject and topic, then ask the question you want to explore.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Select Subject
              </label>
              <select
                value={subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none appearance-none bg-white text-slate-800 font-medium disabled:opacity-50"
              >
                <option value="" disabled>
                  Choose a subject...
                </option>
                {SUBJECTS.map((subjectOption) => (
                  <option key={subjectOption} value={subjectOption}>
                    {subjectOption}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Select Topic
              </label>
              <select
                value={topic}
                onChange={(e) => handleTopicChange(e.target.value)}
                disabled={isLoading || !subject}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none appearance-none bg-white text-slate-800 font-medium disabled:opacity-50"
              >
                <option value="" disabled>
                  {subject ? "Choose a topic..." : "Choose a subject first..."}
                </option>
                {availableTopics.map((topicOption) => (
                  <option key={topicOption} value={topicOption}>
                    {topicOption}
                  </option>
                ))}
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
                disabled={isLoading || !topic}
                placeholder={
                  topic
                    ? "Type or paste the question you want help reasoning through..."
                    : "Choose a topic first..."
                }
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none bg-white text-slate-800 disabled:opacity-50"
              />
              <p className="text-sm text-slate-500">
                Your question does not need to match a prepared example. MINDGUIDE
                will use the selected topic as context and ask for clarification when needed.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                Plain-text Syntax Guide
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                {syntaxGuide.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-indigo-600 font-bold">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
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
              disabled={isLoading || !subject || !topic || !question.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Begin Socratic Solver
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

// ─── Profile, Settings & Others ─────────────────────────────

export function StudentProfileScreen() {
  return (
    <StudentLayout activeTab="profile">
      <ProfileContent />
    </StudentLayout>
  );
}

export function StudentSettingsScreen() {
  return (
    <StudentLayout activeTab="settings">
      <SettingsContent />
    </StudentLayout>
  );
}

export function StudentNotificationsScreen() {
  return (
    <StudentLayout activeTab="notifications">
      <NotificationContent />
    </StudentLayout>
  );
}

export function StudentHistoryScreen() {
  const navigate = useNavigate();
  const { sessionHistory, fetchStudentSessions, isLoading } = useSessionStore();
  const { firebaseUser } = useAuthStore();

  useEffect(() => {
    if (firebaseUser?.uid) fetchStudentSessions(firebaseUser.uid);
  }, [firebaseUser?.uid, fetchStudentSessions]);

  return (
    <StudentLayout activeTab="history">
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Previous Sessions</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Review your past learning activities and AI feedback.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
        ) : sessionHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              No sessions found.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
            {sessionHistory.map((session) => {
              const statusColors: Record<string, string> = {
                in_progress: "bg-blue-50 text-blue-700",
                completed: "bg-emerald-50 text-emerald-700",
                submitted: "bg-amber-50 text-amber-700",
                reviewed: "bg-emerald-50 text-emerald-700",
                returned: "bg-red-50 text-red-700",
              };
              const statusLabels: Record<string, string> = {
                in_progress: "In Progress",
                completed: "Completed",
                submitted: "Submitted",
                reviewed: "Reviewed",
                returned: "Returned",
              };

              return (
                <div
                  key={session.id}
                  onClick={() => navigate(`/student/review/${session.id}`)}
                  className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400">
                      <History className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white">
                        {session.topic || session.originalQuestion?.slice(0, 40) || "Unknown Topic"}
                      </h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {session.subject} • {new Date(session.completedAt?.toMillis() || session.createdAt?.toMillis() || Date.now()).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        statusColors[session.status] || "bg-slate-50 text-slate-700"
                      }`}
                    >
                      {statusLabels[session.status] || session.status}
                    </span>
                    <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

