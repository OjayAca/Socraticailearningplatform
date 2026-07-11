/**
 * Student-facing screens — Dashboard and Task Start.
 *
 * These components are connected to Firestore for real data and
 * use the auth store for the current user context.
 *
 * @module components/StudentScreens
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  Plus,
  History,
  Activity,
  Bell,
  Settings,
  User,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  CheckCircle2,
  FileText,
  LogOut,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { motion } from "motion/react";
import { useAuthStore } from "@/stores/auth-store";
import { useSessionStore } from "@/stores/session-store";
import {
  getAvailableDifficultiesForTopic,
  recommendNextDifficulty,
} from "@/lib/adaptive-difficulty";
import { analyzeFreeFormProblem } from "@/lib/free-form-analysis";
import { getSessionPath } from "@/lib/session-routes";
import { mindGuideProblems } from "@/data/mindguide-problems";
import { ProfileContent, SettingsContent, NotificationContent } from "./SharedScreens";
import { useNotificationStore } from "@/stores/notification-store";
import { SUBJECTS, SUBJECT_TOPICS } from "@/types";
import type {
  MindGuideDifficulty,
  ProblemMode,
  Session,
  SessionStep,
  Subject,
  Topic,
} from "@/types";

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
  const { sessionHistory, fetchStudentSessions, isLoading, error } =
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
    lastSessionDate: null,
    topicPerformance: [],
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

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={() =>
                  firebaseUser?.uid && void fetchStudentSessions(firebaseUser.uid)
                }
                className="rounded-lg bg-red-100 px-3 py-2 font-semibold hover:bg-red-200"
              >
                Retry
              </button>
            </div>
          )}

          {isLoading && sessionHistory.length === 0 ? (
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
                  <button
                    type="button"
                    key={session.id}
                    onClick={() => navigate(`/student/review/${session.id}`)}
                    className="w-full p-4 sm:p-6 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
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
                  </button>
                );
              })}
              {sessionHistory.length > 3 && (
                <button
                  type="button"
                  className="w-full p-4 text-center text-sm font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-b-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                  onClick={() => navigate("/student/history")}
                >
                  View all previous sessions
                </button>
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
  const { createSession, isLoading, error: sessionError, clearError } =
    useSessionStore();

  const [problemMode, setProblemMode] = useState<ProblemMode>("curated");
  const [subject, setSubject] = useState<Subject | "">("");
  const [topic, setTopic] = useState<Topic | "">("");
  const [difficulty, setDifficulty] = useState<MindGuideDifficulty>("Basic");
  const [question, setQuestion] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const availableTopics = subject ? SUBJECT_TOPICS[subject] : [];
  const availableDifficulties =
    subject && topic
      ? getAvailableDifficultiesForTopic(subject, topic)
      : (["Basic", "Intermediate", "Advanced"] as MindGuideDifficulty[]);
  const selectedProblem =
    problemMode === "curated" && subject && topic
      ? mindGuideProblems.find(
          (problem) =>
            problem.subject === subject &&
            problem.topic === topic &&
            problem.difficulty === difficulty
        ) ?? null
      : null;
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
    setDifficulty("Basic");
    setLocalError(null);
  }

  function handleTopicChange(value: string) {
    const nextTopic = value as Topic;
    setTopic(nextTopic);
    setLocalError(null);
    if (!subject) return;

    const topicPerformance = userProfile?.stats.topicPerformance.find(
      (performance) =>
        performance.subject === subject && performance.topic === nextTopic
    );
    const recommendation = recommendNextDifficulty(
      topicPerformance,
      getAvailableDifficultiesForTopic(subject, nextTopic)
    );
    setDifficulty(recommendation.recommendedDifficulty);
  }

  /**
   * Creates a new Firestore session and navigates to the trigger screen.
   */
  async function handleStartSession() {
    if (!subject || !topic || !firebaseUser) return;
    const trimmedQuestion =
      problemMode === "curated"
        ? selectedProblem?.problemText ?? ""
        : question.trim();
    if (!trimmedQuestion) return;

    clearError();
    setLocalError(null);
    setIsAnalyzing(problemMode === "free_form");
    try {
      const freeFormAnalysis =
        problemMode === "free_form"
          ? await analyzeFreeFormProblem({
              subject,
              topic,
              question: trimmedQuestion,
            })
          : null;
      if (
        freeFormAnalysis &&
        (!freeFormAnalysis.isSupported || !freeFormAnalysis.isSolvable)
      ) {
        throw new Error(
          freeFormAnalysis.rejectionReason ??
            "This question is not supported for the selected topic."
        );
      }

      const sessionId = await createSession(
        firebaseUser.uid,
        userProfile?.displayName || userProfile?.email || firebaseUser.email || "Student",
        subject,
        topic,
        trimmedQuestion,
        selectedProblem ?? undefined,
        userProfile?.email || firebaseUser.email || null,
        { problemMode, freeFormAnalysis }
      );
      navigate(getSessionPath(sessionId, "trigger"));
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Could not start the session."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  const isWorking = isLoading || isAnalyzing;
  const canStart = Boolean(
    subject &&
      topic &&
      (problemMode === "curated" ? selectedProblem : question.trim())
  );

  return (
    <StudentLayout activeTab="dashboard">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-3xl mx-auto"
      >
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 dark:border-slate-800 p-8 space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">
              Start MINDGUIDE Session
            </h2>
            <p className="text-slate-500">
              Choose a guided problem or bring your own question for a validated
              Socratic session.
            </p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setProblemMode("curated");
                  setLocalError(null);
                }}
                className={`rounded-2xl border-2 p-4 text-left transition ${
                  problemMode === "curated"
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40"
                    : "border-slate-200 dark:border-slate-700 hover:border-indigo-200"
                }`}
              >
                <div className="font-bold text-slate-900 dark:text-white">
                  Guided problem
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Use a vetted problem with adaptive difficulty and reliable scoring.
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProblemMode("free_form");
                  setLocalError(null);
                }}
                className={`rounded-2xl border-2 p-4 text-left transition ${
                  problemMode === "free_form"
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40"
                    : "border-slate-200 dark:border-slate-700 hover:border-indigo-200"
                }`}
              >
                <div className="font-bold text-slate-900 dark:text-white">
                  My own problem
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Gemini validates the question and builds a formative rubric first.
                </p>
              </button>
            </div>

            {(localError || sessionError) && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{localError || sessionError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Select Subject
              </label>
              <select
                value={subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                disabled={isWorking}
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
                disabled={isWorking || !subject}
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

            {problemMode === "curated" ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Difficulty
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {availableDifficulties.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficulty(level)}
                        disabled={isWorking || !topic}
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition disabled:opacity-50 ${
                          difficulty === level
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-slate-200 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    The recommended level is selected from your prior topic performance;
                    you may override it.
                  </p>
                </div>

                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500">
                    Guided problem
                  </h3>
                  <p className="mt-2 font-medium leading-relaxed text-indigo-950 dark:text-indigo-100">
                    {selectedProblem?.problemText ??
                      "Choose a subject and topic to load the guided problem."}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Your Question or Problem
                </label>
                <textarea
                  rows={5}
                  maxLength={2_000}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={isWorking || !topic}
                  placeholder={
                    topic
                      ? "Type or paste the complete question you want to reason through..."
                      : "Choose a topic first..."
                  }
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 disabled:opacity-50"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Gemini checks topic fit and solvability before saving.</span>
                  <span>{question.length}/2000</span>
                </div>
              </div>
            )}

            {problemMode === "free_form" && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
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
            )}
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <button
              onClick={() => navigate(-1)}
              disabled={isWorking}
              className="text-slate-500 hover:text-slate-700 font-semibold px-4 py-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStartSession}
              disabled={isWorking || !canStart}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWorking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {problemMode === "free_form"
                    ? "Analyze & Begin"
                    : "Begin Guided Session"}
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

export function StudentReviewScreen() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { firebaseUser } = useAuthStore();
  const {
    activeSession,
    loadSession,
    createFollowUpSession,
    isLoading,
    error,
  } = useSessionStore();
  const [hasLoaded, setHasLoaded] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStudentSession() {
      if (!sessionId) {
        setHasLoaded(true);
        return;
      }

      setHasLoaded(false);
      try {
        await loadSession(sessionId, firebaseUser?.uid);
      } finally {
        if (isMounted) {
          setHasLoaded(true);
        }
      }
    }

    void loadStudentSession().catch(() => {
      // Store error is rendered below.
    });

    return () => {
      isMounted = false;
    };
  }, [firebaseUser?.uid, loadSession, sessionId]);

  const session =
    activeSession && activeSession.id === sessionId ? activeSession : null;
  const ownsSession = Boolean(
    session && firebaseUser && session.studentId === firebaseUser.uid
  );

  useEffect(() => {
    if (!session || !ownsSession || session.status !== "in_progress") {
      return;
    }

    navigate(getResumePath(session.id, session.currentStep), { replace: true });
  }, [navigate, ownsSession, session]);

  if (
    isLoading ||
    !hasLoaded ||
    (sessionId && activeSession?.id !== sessionId && !error)
  ) {
    return (
      <StudentLayout activeTab="history">
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </StudentLayout>
    );
  }

  if (!sessionId || !session || !ownsSession) {
    return (
      <StudentLayout activeTab="history">
        <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-10 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Session unavailable
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            This session could not be found, or it is not available for your
            account.
          </p>
          <button
            onClick={() => navigate("/student/history")}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Previous Sessions
          </button>
        </div>
      </StudentLayout>
    );
  }

  if (session.status === "in_progress") {
    return (
      <StudentLayout activeTab="history">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Resuming your session
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Taking you back to the step where you left off.
            </p>
          </div>
        </div>
      </StudentLayout>
    );
  }

  const scorecard = session.mindGuideScorecard ?? session.scorecard;
  const status = getStudentReviewStatus(session);

  return (
    <StudentLayout activeTab="history">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              onClick={() => navigate("/student/history")}
              className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Previous Sessions
            </button>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
              Session Review
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Review your MINDGUIDE reasoning trail, scorecard, and system admin
              feedback.
            </p>
          </div>
          <span
            className={`inline-flex self-start sm:self-center px-4 py-2 rounded-full text-sm font-bold ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-8 text-white">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">{session.topic}</h3>
                <p className="text-indigo-100 font-medium">{session.subject}</p>
                <p className="text-indigo-50 text-sm">
                  {formatStudentSessionDate(session)}
                </p>
              </div>
              <div className="text-left lg:text-right">
                <div className="text-4xl font-bold">
                  {scorecard?.total ?? session.ctScore ?? 0}
                  <span className="text-lg text-indigo-200">/100</span>
                </div>
                <span className="text-indigo-100 text-sm font-medium">
                  Scorecard Total
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <ReviewBlock
              icon={<BookOpen className="w-4 h-4" />}
              title="Original Question"
            >
              <p className="text-slate-800 dark:text-slate-200 font-medium">
                {session.originalQuestion}
              </p>
            </ReviewBlock>

            {session.selectedProblem && (
              <ReviewBlock
                icon={<FileText className="w-4 h-4" />}
                title="Prepared Problem"
              >
                <p className="text-slate-800 dark:text-slate-200 font-medium">
                  {session.selectedProblem.problemText}
                </p>
              </ReviewBlock>
            )}

            {session.aiSummary && (
              <ReviewBlock
                icon={<BrainCircuit className="w-4 h-4" />}
                title="AI Session Summary"
              >
                <p className="text-indigo-950 dark:text-indigo-100 font-medium text-sm">
                  {session.aiSummary}
                </p>
              </ReviewBlock>
            )}

            {session.draft && (
              <ReviewBlock
                icon={<FileText className="w-4 h-4" />}
                title="Your Answer and Reflection"
              >
                <div className="space-y-3 text-sm text-slate-800 dark:text-slate-200">
                  <p>
                    <span className="font-bold">Answer:</span>{" "}
                    {session.draft.answer}
                  </p>
                  <p>
                    <span className="font-bold">Method:</span>{" "}
                    {session.draft.methodology || "No method entered."}
                  </p>
                  <p>
                    <span className="font-bold">Reflection:</span>{" "}
                    {session.draft.reflection || "No reflection entered."}
                  </p>
                </div>
              </ReviewBlock>
            )}

            {scorecard && (
              <ReviewBlock
                icon={<CheckCircle2 className="w-4 h-4" />}
                title="Critical Thinking Scorecard"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-800 dark:text-slate-200 font-medium">
                  <ScoreRow label="Accuracy" value={scorecard.accuracy} />
                  <ScoreRow
                    label="Logical Validity"
                    value={scorecard.logicalValidity}
                  />
                  <ScoreRow
                    label="Method Selection"
                    value={scorecard.methodSelection}
                  />
                  <ScoreRow
                    label="Formula/Theorem Justification"
                    value={scorecard.justificationQuality}
                  />
                  <ScoreRow
                    label="Interpretation Quality"
                    value={scorecard.interpretationQuality}
                  />
                </div>
                <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 font-medium">
                  {scorecard.feedback}
                </p>
              </ReviewBlock>
            )}

            {session.logicMap.length > 0 && (
              <ReviewBlock
                icon={<Activity className="w-4 h-4" />}
                title="Logic Map"
              >
                <div className="space-y-3">
                  {session.logicMap.map((node) => (
                    <div
                      key={`${node.step}-${node.title}`}
                      className="flex gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950"
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          node.completed
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {node.step}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">
                          {node.title}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {node.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ReviewBlock>
            )}

            {session.adminReview && (
              <ReviewBlock
                icon={<MessageSquare className="w-4 h-4" />}
                title="System Admin Feedback"
              >
                <div
                  className={`rounded-xl border p-4 ${
                    session.adminReview.outcome === "reviewed"
                      ? "bg-emerald-50 border-emerald-100 text-emerald-950"
                      : "bg-amber-50 border-amber-100 text-amber-950"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-wider mb-2">
                    {session.adminReview.outcome === "reviewed"
                      ? "Reviewed"
                      : "Flagged for Follow-up"}
                  </p>
                  <p className="text-sm font-medium">
                    {session.adminReview.comment}
                  </p>
                  {session.adminReview.outcome === "returned" && (
                    <div className="mt-4 border-t border-amber-200 pt-4">
                      {followUpError && (
                        <p className="mb-3 text-sm font-semibold text-red-700">
                          {followUpError}
                        </p>
                      )}
                      {session.followUpSessionId ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/student/review/${session.followUpSessionId}`)
                          }
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                        >
                          Open linked follow-up
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={async () => {
                            setFollowUpError(null);
                            try {
                              const childId = await createFollowUpSession(session.id);
                              navigate(getSessionPath(childId, "trigger"));
                            } catch (followUpFailure) {
                              setFollowUpError(
                                followUpFailure instanceof Error
                                  ? followUpFailure.message
                                  : "Could not start the follow-up attempt."
                              );
                            }
                          }}
                          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {isLoading ? "Starting…" : "Start linked follow-up"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </ReviewBlock>
            )}

            <ReviewBlock
              icon={<MessageSquare className="w-4 h-4" />}
              title={`Conversation History (${session.messages.length} messages)`}
            >
              {session.messages.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No conversation messages were recorded for this session.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {session.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "student"
                          ? "justify-start"
                          : "justify-end"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-medium ${
                          message.role === "student"
                            ? "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                            : "bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-indigo-950 dark:text-indigo-100"
                        }`}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1">
                          {message.role === "student" ? "You" : "MINDGUIDE"}
                        </p>
                        {message.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ReviewBlock>
          </div>
        </div>
      </motion.div>
    </StudentLayout>
  );
}

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
  const {
    sessionHistory,
    fetchStudentSessions,
    isLoading,
    error,
    studentSessionsHasMore,
  } = useSessionStore();
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

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() =>
                firebaseUser?.uid && void fetchStudentSessions(firebaseUser.uid)
              }
              className="rounded-lg bg-red-100 px-3 py-2 font-semibold hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && sessionHistory.length === 0 ? (
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
                <button
                  type="button"
                  key={session.id}
                  onClick={() => navigate(`/student/review/${session.id}`)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
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
                        {session.subject} •{" "}
                        {session.submittedAt?.toMillis() || session.createdAt?.toMillis()
                          ? new Date(
                              session.submittedAt?.toMillis() ??
                                session.createdAt.toMillis()
                            ).toLocaleDateString()
                          : "Date unavailable"}
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
                </button>
              );
            })}
            {studentSessionsHasMore && firebaseUser?.uid && (
              <button
                type="button"
                onClick={() =>
                  void fetchStudentSessions(firebaseUser.uid, { append: true })
                }
                disabled={isLoading}
                className="w-full p-4 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                {isLoading ? "Loading more…" : "Load more sessions"}
              </button>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

function getResumePath(sessionId: string, step: SessionStep): string {
  return getSessionPath(sessionId, step);
}

function getStudentReviewStatus(session: Session): {
  label: string;
  className: string;
} {
  const statusMap: Record<string, { label: string; className: string }> = {
    submitted: {
      label: "Submitted",
      className: "bg-amber-50 text-amber-700",
    },
    reviewed: {
      label: "Reviewed",
      className: "bg-emerald-50 text-emerald-700",
    },
    returned: {
      label: "Flagged for Follow-up",
      className: "bg-amber-50 text-amber-700",
    },
  };

  return (
    statusMap[session.status] ?? {
      label: session.status.replace("_", " "),
      className: "bg-slate-100 text-slate-700",
    }
  );
}

function formatStudentSessionDate(session: Session): string {
  const timestamp = session.updatedAt ?? session.submittedAt ?? session.createdAt;
  const date =
    timestamp && typeof timestamp.toMillis === "function"
      ? new Date(timestamp.toMillis())
      : new Date();

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3">
      <span>{label}</span>
      <span className="font-bold text-indigo-600 dark:text-indigo-400">
        {value}/20
      </span>
    </div>
  );
}

function ReviewBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-5">
      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
