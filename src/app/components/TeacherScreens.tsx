/**
 * Teacher-facing screens — Dashboard and Review.
 *
 * Connected to Firestore for real student submissions.
 * Uses the auth store for teacher identity and session store for data.
 *
 * @module components/TeacherScreens
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  FileText,
  Activity,
  BrainCircuit,
  Settings,
  LogOut,
  User,
  Search,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
  Clock,
  Loader2,
  BookOpen,
  MessageSquare,
  AlertCircle,
  Bell,
} from "lucide-react";
import { motion } from "motion/react";
import { useAuthStore } from "@/stores/auth-store";
import { useSessionStore } from "@/stores/session-store";
import { ProfileContent, SettingsContent, NotificationContent } from "./SharedScreens";
import { useNotificationStore } from "@/stores/notification-store";
import { Session } from "@/types";

// ─── Teacher Layout ─────────────────────────────────────────

/**
 * Layout wrapper for teacher screens.
 * Provides a sidebar, header, and scrollable content area.
 */
function TeacherLayout({
  children,
  activeTab,
}: {
  children: React.ReactNode;
  activeTab: string;
}) {
  const navigate = useNavigate();
  const { userProfile, signOut } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  const displayName = userProfile?.displayName || "System Administrator";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
            MINDGUIDE
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => navigate("/admin/dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "dashboard"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Activity className="w-5 h-5" /> Dashboard
          </button>
          <button
            onClick={() => navigate("/admin/submissions")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "submissions"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <FileText className="w-5 h-5" /> Learner Records
          </button>
          <button
            onClick={() => navigate("/admin/notifications")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "notifications"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
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
              <span className="ml-auto bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            onClick={() => navigate("/admin/profile")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors font-medium text-sm rounded-xl ${
              activeTab === "profile"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <User className="w-5 h-5" /> Profile
          </button>
          <button
            onClick={() => navigate("/admin/settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors font-medium text-sm rounded-xl ${
              activeTab === "settings"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Settings className="w-5 h-5" /> Settings
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors font-medium text-sm"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <header className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-10 px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            System Administrator Workspace
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {displayName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{userProfile?.email}</p>
            </div>
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold border-2 border-white dark:border-emerald-900 shadow-sm">
              {initials}
            </div>
          </div>
        </header>
        <main className="p-8 pb-24">{children}</main>
      </div>
    </div>
  );
}

// ─── Teacher Workspace ──────────────────────────────────────

/** Teacher workspace with student submissions from Firestore. */
export function TeacherDashboard() {
  const navigate = useNavigate();
  const {
    sessionHistory,
    fetchTeacherSessions,
    isLoading,
    error,
    teacherSessionsHasMore,
  } = useSessionStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchTeacherSessions();
  }, [fetchTeacherSessions]);

  const filteredSessions = sessionHistory.filter((session) => {
    const matchesSearch =
      !searchTerm ||
      session.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (session.detectedMisconception ?? "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || session.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const pendingCount = sessionHistory.filter(
    (s) => s.status === "submitted"
  ).length;
  const reviewedCount = sessionHistory.filter(
    (s) => s.status === "reviewed"
  ).length;
  const returnedCount = sessionHistory.filter(
    (s) => s.status === "returned"
  ).length;

  return (
    <TeacherLayout activeTab="dashboard">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto space-y-8"
      >
        <div>
          <h2 className="text-3xl font-bold text-slate-900">
            System Administrator Dashboard
          </h2>
          <p className="text-slate-500 mt-2">
            Monitor learner sessions, selected topics, misconceptions,
            scorecard results, and completion status.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center mb-2">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">
              Pending Review
            </span>
            <span className="text-3xl font-bold text-slate-900">
              {pendingCount}
            </span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">
              Reviewed Records
            </span>
            <span className="text-3xl font-bold text-slate-900">
              {reviewedCount}
            </span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center mb-2">
              <RotateCcw className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">
              Follow-up Needed
            </span>
            <span className="text-3xl font-bold text-slate-900">
              {returnedCount}
            </span>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by learner, subject, topic, or misconception..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-sm font-medium"
          >
            <option value="all">All Status</option>
            <option value="submitted">Submitted</option>
            <option value="reviewed">Reviewed</option>
            <option value="returned">Follow-up Needed</option>
          </select>
        </div>

        {/* Learner Records Table */}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void fetchTeacherSessions()}
              className="rounded-lg bg-red-100 px-3 py-2 font-semibold hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && sessionHistory.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">
              {sessionHistory.length === 0
                ? "No learner records yet. Completed MINDGUIDE sessions will appear here."
                : "No matching learner records found."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-[1.1fr_1.4fr_1fr_auto_auto_auto] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Learner</span>
              <span>Subject / Topic</span>
              <span>Misconception</span>
              <span className="text-center">Scorecard</span>
              <span className="text-center">Status</span>
              <span className="text-center">Date / Time</span>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-100">
              {filteredSessions.map((session) => {
                const statusColors: Record<string, string> = {
                  submitted: "bg-amber-50 text-amber-700 border-amber-200",
                  reviewed:
                    "bg-emerald-50 text-emerald-700 border-emerald-200",
                  returned: "bg-red-50 text-red-700 border-red-200",
                };
                const statusLabels: Record<string, string> = {
                  submitted: "Submitted",
                  reviewed: "Reviewed",
                  returned: "Follow-up",
                };

                return (
                  <button
                    type="button"
                    key={session.id}
                    className="w-full grid grid-cols-1 sm:grid-cols-[1.1fr_1.4fr_1fr_auto_auto_auto] gap-4 px-6 py-4 items-center text-left hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                    onClick={() =>
                      navigate(`/admin/review/${session.id}`)
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center text-slate-700 font-bold text-xs">
                        {session.studentName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <span className="font-semibold text-slate-800 text-sm">
                        {session.studentName}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-slate-700 font-medium block">
                        {session.subject}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {session.topic}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-slate-700 font-medium">
                        {getMisconceptionLabel(session.detectedMisconception)}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="font-bold text-indigo-600 text-sm">
                        {session.ctScore || "—"}
                      </span>
                    </div>
                    <div className="text-center">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${
                          statusColors[session.status] ||
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {statusLabels[session.status] || session.status}
                      </span>
                    </div>
                    <div className="text-center text-xs font-medium text-slate-500">
                      {formatSessionDate(session)}
                    </div>
                  </button>
                );
              })}
            </div>
            {teacherSessionsHasMore && (
              <button
                type="button"
                onClick={() => void fetchTeacherSessions({ append: true })}
                disabled={isLoading}
                className="w-full border-t border-slate-100 p-4 text-center text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {isLoading ? "Loading more…" : "Load more learner records"}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </TeacherLayout>
  );
}

// ─── Teacher Review ─────────────────────────────────────────

/** Detailed review view for a single student submission. */
export function TeacherReview() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const {
    activeSession,
    loadSession,
    submitFeedback,
    isLoading,
    error: storeError,
  } = useSessionStore();
  const [feedbackComment, setFeedbackComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    void loadSession(sessionId)
      .catch(() => {
        // Store error is rendered below.
      })
      .finally(() => setLoadedSessionId(sessionId));
  }, [sessionId, loadSession]);

  if (isLoading || (sessionId !== undefined && loadedSessionId !== sessionId)) {
    return (
      <TeacherLayout activeTab="dashboard">
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      </TeacherLayout>
    );
  }

  if (!sessionId || !activeSession || activeSession.id !== sessionId) {
    return (
      <TeacherLayout activeTab="submissions">
        <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-white p-10 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
          <h2 className="mt-4 text-2xl font-bold text-slate-900">
            Submission unavailable
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {storeError || "This submission could not be found."}
          </p>
          <button
            type="button"
            onClick={() => navigate("/admin/submissions")}
            className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
          >
            Back to learner sessions
          </button>
        </div>
      </TeacherLayout>
    );
  }

  /**
   * Submits teacher feedback (approve or return).
   *
   * @param action - "approved" or "returned".
   */
  async function handleFeedback(action: "approved" | "returned") {
    if (!feedbackComment.trim()) {
      setError("Please provide a comment before submitting feedback.");
      return;
    }
    setError(null);
    try {
      await submitFeedback(activeSession!.id, feedbackComment.trim(), action);
      navigate("/admin/dashboard");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Failed to submit feedback. Please try again."
      );
    }
  }

  const initials = activeSession.studentName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <TeacherLayout activeTab="dashboard">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-8"
      >
        <div>
          <h2 className="text-3xl font-bold text-slate-900">
            Learner Records Review
          </h2>
          <p className="text-slate-500 mt-2">
            Review the learner's MINDGUIDE session, misconception signals, and
            scorecard result.
          </p>
        </div>

        {/* Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-8 text-white flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center font-bold text-xl backdrop-blur-sm">
                {initials}
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {activeSession.studentName}
                </h2>
                <p className="text-emerald-100 font-medium">
                  {activeSession.subject} • {activeSession.topic}
                </p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-3xl font-bold">
                {activeSession.mindGuideScorecard?.total ?? activeSession.ctScore}
                <span className="text-lg text-emerald-200">/100</span>
              </div>
              <span className="text-emerald-100 text-sm font-medium">
                Scorecard Total
              </span>
            </div>
          </div>

          <div className="p-8 space-y-6">
            {/* Original Question */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Original Question
              </h3>
              <p className="text-slate-800 font-medium">
                {activeSession.originalQuestion}
              </p>
            </div>

            {/* AI Summary */}
            {activeSession.aiSummary && (
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">
                  AI Session Summary
                </h3>
                <p className="text-indigo-900 font-medium text-sm">
                  {activeSession.aiSummary}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Session Status
                </h3>
                <p className="text-slate-800 font-medium">
                  {activeSession.status.replace("_", " ").toUpperCase()}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Date / Time
                </h3>
                <p className="text-slate-800 font-medium">
                  {formatSessionDate(activeSession)}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Detected Misconception
                </h3>
                <p className="text-slate-800 font-medium">
                  {getMisconceptionLabel(activeSession.detectedMisconception)}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Selected Subject / Topic
                </h3>
                <p className="text-slate-800 font-medium">
                  {activeSession.subject} / {activeSession.topic}
                </p>
              </div>
            </div>

            {/* Learner Draft */}
            {activeSession.draft && (
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 space-y-2">
                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">
                  Learner's Answer & Reflection
                </h3>
                <p className="text-sm text-emerald-900">
                  <span className="font-bold">Answer:</span>{" "}
                  {activeSession.draft.answer}
                </p>
                {activeSession.draft.methodology && (
                  <p className="text-sm text-emerald-900">
                    <span className="font-bold">Method:</span>{" "}
                    {activeSession.draft.methodology}
                  </p>
                )}
                {activeSession.draft.reflection && (
                  <p className="text-sm text-emerald-900 italic">
                    <span className="font-bold not-italic">Reflection:</span>{" "}
                    "{activeSession.draft.reflection}"
                  </p>
                )}
              </div>
            )}

            {activeSession.mindGuideScorecard && (
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                    Critical Thinking Scorecard
                  </h3>
                  <span className="text-lg font-bold text-indigo-700">
                    {activeSession.mindGuideScorecard.total}/100
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-indigo-950 font-medium">
                  <span>
                    Accuracy: {activeSession.mindGuideScorecard.accuracy}/20
                  </span>
                  <span>
                    Logical Validity:{" "}
                    {activeSession.mindGuideScorecard.logicalValidity}/20
                  </span>
                  <span>
                    Method Selection:{" "}
                    {activeSession.mindGuideScorecard.methodSelection}/20
                  </span>
                  <span>
                    Formula/Theorem Justification:{" "}
                    {activeSession.mindGuideScorecard.justificationQuality}/20
                  </span>
                  <span>
                    Interpretation Quality:{" "}
                    {activeSession.mindGuideScorecard.interpretationQuality}/20
                  </span>
                </div>
                <p className="text-sm text-indigo-950 font-medium">
                  Feedback: {activeSession.mindGuideScorecard.feedback}
                </p>
              </div>
            )}

            {/* Chat History */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Conversation History ({activeSession.messages.length} messages)
              </h3>
              <div className="max-h-80 overflow-y-auto space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {activeSession.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 items-start ${
                      msg.role === "student" ? "" : "ml-8"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-bold text-xs ${
                        msg.role === "student"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {msg.role === "student" ? initials : "MG"}
                    </div>
                    <div
                      className={`${
                        msg.role === "student"
                          ? "bg-white border-slate-100"
                          : "bg-emerald-50 border-emerald-100"
                      } p-3 rounded-xl border text-sm text-slate-700 font-medium`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feedback Section */}
        {activeSession.status === "submitted" && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Administrator Notes
            </h3>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <textarea
              rows={4}
              maxLength={2_000}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Add monitoring notes about this learner session..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 resize-none text-sm text-slate-800"
            />

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => handleFeedback("returned")}
                disabled={isLoading}
                className="flex-1 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 text-amber-700 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" /> Flag for Follow-up
                  </>
                )}
              </button>
              <button
                onClick={() => handleFeedback("approved")}
                disabled={isLoading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md shadow-emerald-200 flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Mark Reviewed
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Show existing administrator notes if already reviewed */}
        {activeSession.adminReview && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Administrator Notes
            </h3>
            <div
              className={`p-4 rounded-xl border ${
                activeSession.adminReview.outcome === "reviewed"
                  ? "bg-emerald-50 border-emerald-100"
                  : "bg-amber-50 border-amber-100"
              }`}
            >
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  activeSession.adminReview.outcome === "reviewed"
                    ? "text-emerald-600"
                    : "text-amber-600"
                }`}
              >
                {activeSession.adminReview.outcome === "reviewed"
                  ? "Reviewed"
                  : "Flagged for Follow-up"}
              </span>
              <p className="text-sm text-slate-700 mt-2 font-medium">
                {activeSession.adminReview.comment}
              </p>
            </div>
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={() => navigate("/admin/dashboard")}
          className="text-sm text-slate-500 hover:text-slate-700 font-semibold transition-colors"
        >
          Back to System Administrator Dashboard
        </button>
      </motion.div>
    </TeacherLayout>
  );
}

// ─── Submissions Wrapper Screen ──────────────────────────────────
export function TeacherSubmissionsScreen() {
  const navigate = useNavigate();
  const {
    sessionHistory,
    fetchTeacherSessions,
    isLoading,
    error,
    teacherSessionsHasMore,
  } = useSessionStore();
  const { firebaseUser } = useAuthStore();

  useEffect(() => {
    if (firebaseUser?.uid) fetchTeacherSessions();
  }, [firebaseUser?.uid, fetchTeacherSessions]);

  return (
    <TeacherLayout activeTab="submissions">
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
            Learner Sessions
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Monitor submitted and reviewed MINDGUIDE learner records.
          </p>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void fetchTeacherSessions()}
              className="rounded-lg bg-red-100 px-3 py-2 font-semibold hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && sessionHistory.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : sessionHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              No learner records to review yet.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
            {sessionHistory.map((session: Session) => {
              const statusColors: Record<string, string> = {
                submitted: "bg-amber-50 text-amber-700",
                reviewed: "bg-emerald-50 text-emerald-700",
                returned: "bg-red-50 text-red-700",
                in_progress: "bg-blue-50 text-blue-700",
              };

              return (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => navigate(`/admin/review/${session.id}`)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white">
                        {session.topic || session.originalQuestion?.slice(0, 40) || "Unknown Topic"}
                      </h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {session.studentName || "Anonymous Learner"} • {session.subject}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        statusColors[session.status] || "bg-slate-50 text-slate-700"
                      }`}
                    >
                      {session.status.toUpperCase()}
                    </span>
                    <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                  </div>
                </button>
              );
            })}
            {teacherSessionsHasMore && (
              <button
                type="button"
                onClick={() => void fetchTeacherSessions({ append: true })}
                disabled={isLoading}
                className="w-full p-4 text-center text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {isLoading ? "Loading more…" : "Load more learner records"}
              </button>
            )}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}

// ─── Profile & Settings Screens ─────────────────────────────

export function TeacherProfileScreen() {
  return (
    <TeacherLayout activeTab="profile">
      <ProfileContent />
    </TeacherLayout>
  );
}

export function TeacherSettingsScreen() {
  return (
    <TeacherLayout activeTab="settings">
      <SettingsContent />
    </TeacherLayout>
  );
}

export function TeacherNotificationsScreen() {
  return (
    <TeacherLayout activeTab="notifications">
      <NotificationContent />
    </TeacherLayout>
  );
}

function getMisconceptionLabel(errorType?: string | null): string {
  if (!errorType || errorType === "none") {
    return "None detected";
  }

  return errorType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatSessionDate(session: Session): string {
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

