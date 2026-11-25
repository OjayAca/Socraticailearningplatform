import { db } from "@/lib/firebase";
import { displayPhaseLabel, displaySessionStatus } from "@/lib/learning/display-labels";
import {
  adminOverrideSessionSupport,
  adminPublishAnnouncement,
  adminReviewSession,
} from "@/lib/secure-api";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import type { PresentableScorecardInput } from "@/lib/scorecard-presentation";
import { AdminShell } from "./admin/AdminShell";
import { PageTitle, SolutionDetails } from "./admin/admin-shared";
import { errorMessage } from "./admin/admin-utils";
import { AdminPrivacySettings } from "./AdminPrivacySettings";
import { ScorecardDetails } from "./ScorecardDetails";
import { NotificationContent } from "./student/NotificationContent";
import { ProfileContent } from "./student/ProfileContent";
import { Alert } from "./ui/alert";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { ListRowSkeleton } from "./ui/skeleton";

export { SecureAdminDashboard } from "./admin/AdminDashboard";
export { SecureAdminUsers } from "./admin/AdminUsers";
export { SecureAdminContent } from "./admin/AdminContentLibrary";
export { SecureAdminContentEditor } from "./admin/AdminContentEditor";
export { SecureAdminProgress, SecureAdminProgressDetail } from "./admin/AdminProgress";
export { SecureAdminReports, SecureAdminReportPrint } from "./admin/AdminReports";
export { SecureAdminMaintenance } from "./admin/AdminCohortAccess";
export { SecureAdminLogs } from "./admin/AdminLogs";

/**
 * Administrator notification feed and audited active-student announcement broadcaster.
 */
export function SecureAdminNotifications() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("Authorized capstone announcement");
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const publishing = useRef(false);

  async function publish() {
    if (publishing.current) return;
    publishing.current = true;
    setBusy(true);
    setSuccessNotice(null);
    setErrorNotice(null);
    try {
      const response = await adminPublishAnnouncement({ title, message, reason });
      if (response.complete === false) {
        setErrorNotice(
          `Delivery interrupted: ${response.delivered} of ${response.total} recipients confirmed. Retry without changing the message to resume. ${response.error ?? ""}`.trim(),
        );
        return;
      }
      setSuccessNotice(`Announcement delivered to ${response.delivered} active students.`);
      setTitle("");
      setMessage("");
    } catch (cause) {
      setErrorNotice(
        errorMessage(
          cause,
          "Announcement failed. Retry the same message to resume any confirmed delivery.",
        ),
      );
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  }

  return (
    <AdminShell active="notifications">
      <PageTitle
        title="Administrator Notifications"
        description="Review live system updates and publish audited announcements to all active students."
      />
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <h2 className="font-bold text-slate-950 dark:text-white">Publish announcement</h2>
        <div className="mt-4 grid gap-3">
          <input
            value={title}
            aria-label="Announcement title"
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Announcement title"
            className="min-h-11 rounded-xl border border-slate-200 bg-white p-3 text-base text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <textarea
            value={message}
            aria-label="Message for active students"
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Message for active students"
            className="rounded-xl border border-slate-200 bg-white p-3 text-base text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <div>
            <input
              value={reason}
              aria-label="Announcement audit reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required audit reason"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white p-3 text-base text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Minimum 8 characters required for audit log ({reason.trim().length}/8).
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !title.trim() || !message.trim() || reason.trim().length < 8}
            onClick={() => void publish()}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            <span>{busy ? "Publishing..." : "Publish to active students"}</span>
          </button>
        </div>
        {errorNotice && (
          <Alert tone="error" className="mt-4" onDismiss={() => setErrorNotice(null)}>
            {errorNotice}
          </Alert>
        )}
        {successNotice && (
          <Alert tone="success" className="mt-4" onDismiss={() => setSuccessNotice(null)}>
            {successNotice}
          </Alert>
        )}
      </div>
      <div className="mt-8">
        <NotificationContent />
      </div>
    </AdminShell>
  );
}

/**
 * Administrator account profile page.
 */
export function SecureAdminProfile() {
  return (
    <AdminShell active="profile">
      <ProfileContent />
    </AdminShell>
  );
}

/**
 * Administrator privacy, consent policy, and inactivity settings route.
 */
export function SecureAdminSettings() {
  return (
    <AdminShell active="settings">
      <PageTitle
        title="System and Privacy Settings"
        description="Configure consent and session inactivity. Retention and study closure are recorded policies, not scheduled cleanup or access controls."
      />
      <AdminPrivacySettings />
    </AdminShell>
  );
}

interface AdminReviewSession {
  id: string;
  studentName?: string;
  subject?: string;
  topic?: string;
  status?: string;
  originalQuestion?: string;
  scorecard?: PresentableScorecardInput;
  releasedSolution?: {
    method?: string;
    steps?: ReadonlyArray<string>;
    answer?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface AdminReviewResponse {
  id: string;
  phase?: string;
  response?: { plainText?: string };
  evaluation?: { evidenceSummary?: string };
  [key: string]: unknown;
}

/**
 * Administrator formative session review, override authorization, and return-for-follow-up screen.
 */
export function SecureAdminReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<AdminReviewSession | null>(null);
  const [responses, setResponses] = useState<AdminReviewResponse[]>([]);
  const [comment, setComment] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideNotice, setOverrideNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewBusy, setReviewBusy] = useState<"reviewed" | "returned" | null>(null);
  const [overrideBusy, setOverrideBusy] = useState<
    "worked_explanation" | "full_solution" | null
  >(null);
  const [confirmReturnOpen, setConfirmReturnOpen] = useState(false);

  useEffect(() => {
    if (!db || !sessionId) return;
    Promise.all([
      getDoc(doc(db, "sessions", sessionId)),
      getDocs(
        query(collection(db, "sessions", sessionId, "responses"), orderBy("createdAt", "asc")),
      ),
    ])
      .then(([snapshot, responseSnapshot]) => {
        setSession(
          snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as AdminReviewSession) : null,
        );
        setResponses(
          responseSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as AdminReviewResponse),
        );
      })
      .catch((cause) => setError(errorMessage(cause, "Session review could not be loaded.")))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function review(outcome: "reviewed" | "returned") {
    if (!sessionId || reviewBusy) return;
    setReviewBusy(outcome);
    setError(null);
    try {
      await adminReviewSession({ sessionId, outcome, comment });
      setConfirmReturnOpen(false);
      navigate("/admin/dashboard");
    } catch (cause) {
      setConfirmReturnOpen(false);
      setError(errorMessage(cause, "Review failed."));
    } finally {
      setReviewBusy(null);
    }
  }

  async function overrideSupport(level: "worked_explanation" | "full_solution") {
    if (!sessionId || overrideBusy) return;
    setOverrideBusy(level);
    setError(null);
    setOverrideNotice(null);
    try {
      await adminOverrideSessionSupport({ sessionId, level, reason: overrideReason });
      setOverrideNotice(
        `Audited ${level.replace(/_/g, " ")} exception authorized. The learner must reload the session.`,
      );
    } catch (cause) {
      setError(errorMessage(cause, "Support override failed."));
    } finally {
      setOverrideBusy(null);
    }
  }

  if (!sessionId) return <Navigate to="/admin/dashboard" />;
  if (loading) {
    return (
      <AdminShell active="dashboard">
        <ListRowSkeleton rows={4} label="Loading administrator data" />
      </AdminShell>
    );
  }
  if (!session) {
    return (
      <AdminShell active="dashboard">
        <Alert tone="error">{error ?? "The learner session was not found."}</Alert>
        <Link
          to="/admin/dashboard"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to dashboard
        </Link>
      </AdminShell>
    );
  }

  const canOverride = Boolean(session.scorecard && session.releasedSolution);

  return (
    <AdminShell active="dashboard">
      <div className="space-y-6">
        <Link
          to="/admin/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to dashboard
        </Link>

        {error && (
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        {overrideNotice && (
          <Alert tone="success" onDismiss={() => setOverrideNotice(null)}>
            {overrideNotice}
          </Alert>
        )}

        <PageTitle
          title={`Review: ${session.studentName ?? "Learner"}`}
          description={`${session.subject} · ${session.topic} · ${displaySessionStatus(session.status)}`}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <h2 className="font-bold text-slate-950 dark:text-white">Problem</h2>
          <p className="mt-2 text-slate-700 dark:text-slate-300">{session.originalQuestion}</p>
          {session.scorecard && <ScorecardDetails scorecard={session.scorecard} />}
        </div>

        <div className="space-y-3">
          {responses.map((response) => (
            <div
              key={response.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {response.phase
                  ? displayPhaseLabel(String(response.phase))
                  : "Reasoning checkpoint"}
              </p>
              <p className="mt-2 text-slate-800 dark:text-slate-200">
                {response.response?.plainText}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {response.evaluation?.evidenceSummary}
              </p>
            </div>
          ))}
        </div>

        {session.releasedSolution && <SolutionDetails solution={session.releasedSolution} />}

        {canOverride && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
            <h2 className="font-bold text-amber-950 dark:text-amber-200">
              Audited post-score solution authorization
            </h2>
            <textarea
              value={overrideReason}
              aria-label="Required exception reason"
              onChange={(event) => setOverrideReason(event.target.value)}
              rows={3}
              placeholder="Required exception reason"
              className="mt-3 w-full rounded-xl border border-amber-300 bg-white p-3 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
              Minimum 8 characters required for audit log ({overrideReason.trim().length}/8).
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={overrideBusy !== null || overrideReason.trim().length < 8}
                onClick={() => void overrideSupport("worked_explanation")}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-500 bg-white px-4 py-2 font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 dark:bg-slate-900 dark:text-amber-300"
              >
                {overrideBusy === "worked_explanation" && (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                )}
                <span>Authorize worked explanation</span>
              </button>
              <button
                type="button"
                disabled={overrideBusy !== null || overrideReason.trim().length < 8}
                onClick={() => void overrideSupport("full_solution")}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 font-bold text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
              >
                {overrideBusy === "full_solution" && (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                )}
                <span>Authorize full solution</span>
              </button>
            </div>
          </div>
        )}

        {session.status === "submitted" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <label className="block text-sm font-bold text-slate-950 dark:text-white">
              Administrator formative comment
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={5}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={reviewBusy !== null || !comment.trim()}
                onClick={() => setConfirmReturnOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-400 bg-white px-4 py-2.5 font-bold text-amber-800 shadow-sm transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
              >
                Return for follow-up
              </button>
              <button
                type="button"
                disabled={reviewBusy !== null || !comment.trim()}
                onClick={() => void review("reviewed")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
              >
                {reviewBusy === "reviewed" && (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                )}
                <span>{reviewBusy === "reviewed" ? "Saving review..." : "Mark reviewed"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReturnOpen}
        onOpenChange={setConfirmReturnOpen}
        title="Return session for follow-up?"
        description="Returning this session sends your comment back to the learner and permits them to start one linked follow-up session."
        confirmLabel="Confirm return"
        cancelLabel="Cancel"
        isLoading={reviewBusy === "returned"}
        onConfirm={() => void review("returned")}
      />
    </AdminShell>
  );
}
