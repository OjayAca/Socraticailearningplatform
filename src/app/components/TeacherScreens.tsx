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
  Users,
  Activity,
  BrainCircuit,
  Settings,
  LogOut,
  User,
  Search,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
  Eye,
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

  const displayName = userProfile?.displayName || "Teacher";
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
            SocratAI
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => navigate("/teacher/dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "dashboard"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Activity className="w-5 h-5" /> Dashboard
          </button>
          <button
            onClick={() => navigate("/teacher/submissions")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
              activeTab === "submissions"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <FileText className="w-5 h-5" /> Submissions
          </button>
          <button
            onClick={() => navigate("/teacher/notifications")}
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
            onClick={() => navigate("/teacher/profile")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors font-medium text-sm rounded-xl ${
              activeTab === "profile"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <User className="w-5 h-5" /> Profile
          </button>
          <button
            onClick={() => navigate("/teacher/settings")}
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
            Teacher Dashboard
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

// ─── Teacher Dashboard ──────────────────────────────────────

/** Teacher dashboard with student submissions from Firestore. */
export function TeacherDashboard() {
  const navigate = useNavigate();
  const { sessionHistory, fetchTeacherSessions, isLoading } =
    useSessionStore();
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
      session.topic.toLowerCase().includes(searchTerm.toLowerCase());

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
              Reviewed
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
              Returned
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
              placeholder="Search by student, subject, or topic..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-sm font-medium"
          >
            <option value="all">All Status</option>
            <option value="submitted">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="returned">Returned</option>
          </select>
        </div>

        {/* Submissions Table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">
              {sessionHistory.length === 0
                ? "No submissions yet. Students' thinking logs will appear here."
                : "No matching submissions found."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Student</span>
              <span>Task</span>
              <span className="text-center">Score</span>
              <span className="text-center">Status</span>
              <span className="text-center">Action</span>
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
                  submitted: "Pending",
                  reviewed: "Reviewed",
                  returned: "Returned",
                };

                return (
                  <div
                    key={session.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() =>
                      navigate(`/teacher/review/${session.id}`)
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
                        {session.topic || session.originalQuestion?.slice(0, 40)}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {session.subject}
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
                    <div className="text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/teacher/review/${session.id}`);
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 p-2 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
  const { activeSession, loadSession, submitFeedback, isLoading } =
    useSessionStore();
  const [feedbackComment, setFeedbackComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  if (isLoading || !activeSession) {
    return (
      <TeacherLayout activeTab="dashboard">
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
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
      navigate("/teacher/dashboard");
    } catch {
      setError("Failed to submit feedback. Please try again.");
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
                {activeSession.ctScore}
                <span className="text-lg text-emerald-200">/100</span>
              </div>
              <span className="text-emerald-100 text-sm font-medium">
                CT Score
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

            {/* Student Draft */}
            {activeSession.draft && (
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 space-y-2">
                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">
                  Student's Answer & Reflection
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
                      {msg.role === "student" ? initials : "SA"}
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
              Teacher Feedback
            </h3>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <textarea
              rows={4}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Provide constructive feedback on the student's reasoning process..."
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
                    <RotateCcw className="w-4 h-4" /> Return for Revision
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
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Show existing feedback if already reviewed */}
        {activeSession.teacherFeedback && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Your Feedback
            </h3>
            <div
              className={`p-4 rounded-xl border ${
                activeSession.teacherFeedback.action === "approved"
                  ? "bg-emerald-50 border-emerald-100"
                  : "bg-amber-50 border-amber-100"
              }`}
            >
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  activeSession.teacherFeedback.action === "approved"
                    ? "text-emerald-600"
                    : "text-amber-600"
                }`}
              >
                {activeSession.teacherFeedback.action === "approved"
                  ? "✅ Approved"
                  : "🔄 Returned for Revision"}
              </span>
              <p className="text-sm text-slate-700 mt-2 font-medium">
                {activeSession.teacherFeedback.comment}
              </p>
            </div>
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={() => navigate("/teacher/dashboard")}
          className="text-sm text-slate-500 hover:text-slate-700 font-semibold transition-colors"
        >
          ← Back to Dashboard
        </button>
      </motion.div>
    </TeacherLayout>
  );
}

// ─── Submissions Wrapper Screen ──────────────────────────────────
export function TeacherSubmissionsScreen() {
  const navigate = useNavigate();
  const { sessionHistory, fetchTeacherSessions, isLoading } = useSessionStore();
  const { firebaseUser } = useAuthStore();

  useEffect(() => {
    if (firebaseUser?.uid) fetchTeacherSessions();
  }, [firebaseUser?.uid, fetchTeacherSessions]);

  return (
    <TeacherLayout activeTab="submissions">
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Student Submissions</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Review submitted work from students.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : sessionHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              No submissions to review yet.
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
                <div
                  key={session.id}
                  onClick={() => navigate(`/teacher/review/${session.id}`)}
                  className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
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
                        {session.studentName || "Anonymous Student"} • {session.subject}
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
                </div>
              );
            })}
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

