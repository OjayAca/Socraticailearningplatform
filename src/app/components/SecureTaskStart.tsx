import { loadView, peekView } from "@/lib/view-cache";
import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type {
  AdaptiveRecommendation,
  GetCurrentConsentNoticeResponse,
  LearningCatalog,
  SubjectProgress,
} from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import {
  bootstrapProfile,
  getCurrentConsentNotice,
  getLearningCatalog,
  getPreparedTopicIds,
  startLearningSession,
  previewVerifiedProblem,
} from "@/lib/secure-api";
import { secureErrorMessage } from "@/lib/secure-error";
import { useAuthStore } from "@/stores/auth-store";
import { MathInput } from "./MathInput";
import { ProblemMediaCapture } from "./ProblemMediaCapture";
import { customGuidance } from "@/lib/learning/custom-problem-config";
import { StudentShell } from "./StudentShell";
import { Alert } from "./ui/alert";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Skeleton } from "./ui/skeleton";

async function loadTaskSetup(userId: string) {
  const [catalog, notice, progress] = await Promise.all([
    getLearningCatalog(),
    getCurrentConsentNotice(),
    getDoc(doc(db!, "learning_progress", userId)),
  ]);
  const consent = await getDoc(doc(db!, "users", userId, "consents", notice.version));
  const progressData = progress.exists() ? progress.data() : {};
  return {
    catalog,
    notice,
    consented: consent.exists(),
    topicRecommendations: (progressData.topicRecommendations ?? {}) as Record<
      string,
      AdaptiveRecommendation
    >,
    subjectProgress: (progressData.subjectProgress ?? {}) as Record<
      string,
      SubjectProgress
    >,
  };
}

export function SecureTaskStart() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuthStore();
  const cached = peekView<Awaited<ReturnType<typeof loadTaskSetup>>>(
    `task-setup:${firebaseUser?.uid}`,
  );
  const [mode, setMode] = useState<"curated" | "free_form" | null>(null);
  const [catalog, setCatalog] = useState<LearningCatalog | null>(
    cached?.catalog ?? null,
  );
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [availableIds, setAvailableIds] = useState<string[] | null>(null);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [question, setQuestion] = useState("");
  const [questionLatex, setQuestionLatex] = useState("");
  const [mathSyntaxError, setMathSyntaxError] = useState<string | null>(null);
  const submitting = useRef(false);
  const [consented, setConsented] = useState<boolean | null>(
    cached?.consented ?? null,
  );
  const [notice, setNotice] = useState<GetCurrentConsentNoticeResponse | null>(
    cached?.notice ?? null,
  );
  const [topicRecommendations, setTopicRecommendations] = useState<
    Record<string, AdaptiveRecommendation>
  >(cached?.topicRecommendations ?? {});
  const [subjectProgress, setSubjectProgress] = useState<
    Record<string, SubjectProgress>
  >(cached?.subjectProgress ?? {});
  const [acknowledge, setAcknowledge] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pendingResetAction, setPendingResetAction] = useState<
    | { type: "mode"; next: "curated" | "free_form" | null }
    | { type: "subject"; nextSubjectId: string }
    | null
  >(null);
  const userId = firebaseUser?.uid;

  useEffect(() => {
    if (!db || !userId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const key = `task-setup:${userId}`;
      if (!peekView(key)) setLoading(true);
      setError(null);
      loadView(key, () => loadTaskSetup(userId))
        .then(
          ({
            catalog: nextCatalog,
            notice: currentNotice,
            consented: nextConsented,
            topicRecommendations: recommendations,
            subjectProgress: progress,
          }) => {
            if (!active) return;
            setCatalog(nextCatalog);
            setConsented(nextConsented);
            setNotice(currentNotice);
            setTopicRecommendations(recommendations);
            setSubjectProgress(progress);
          },
        )
        .catch(
          (cause) =>
            active &&
            setError(
              secureErrorMessage(cause, "Unable to load learning materials."),
            ),
        )
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [userId, loadAttempt]);

  useEffect(() => {
    if (mode !== "curated") return;
    let active = true;
    getPreparedTopicIds(subjectId)
      .then((ids) => {
        if (active) setAvailableIds(ids);
      })
      .catch((cause) => {
        if (active)
          setError(
            secureErrorMessage(cause, "Unable to load available topics."),
          );
      });
    return () => {
      active = false;
    };
  }, [mode, subjectId, availabilityAttempt]);

  const subjectTopics =
    catalog?.topics.filter((topic) => topic.subjectId === subjectId) ?? [];
  const topics = subjectTopics.filter(
    (topic) => topic.ready && availableIds?.includes(topic.id),
  );
  const selectedTopic = topics.find((topic) => topic.id === topicId);
  const recommendation =
    topicRecommendations[topicKey(selectedTopic?.name ?? "")];
  const difficulty = recommendation?.recommendedDifficulty ?? "Basic";
  const examples = subjectTopics
    .map((topic) => customGuidance(topic.id))
    .filter((item) => !!item);
  const trimmedQuestionLength = question.trim().length;
  const hasInvalidMath = Boolean(questionLatex.trim() && mathSyntaxError);
  const canStart =
    mode === "curated"
      ? !!selectedTopic
      : mode === "free_form" &&
        trimmedQuestionLength >= 8 &&
        questionLatex.length <= 2000 &&
        !hasInvalidMath;
  const hasUnsavedOwnProblem =
    mode === "free_form" &&
    (trimmedQuestionLength > 0 || questionLatex.trim().length > 0);

  function applyModeChange(next: typeof mode) {
    setMode(next);
    setTopicId("");
    setQuestion("");
    setQuestionLatex("");
    setMathSyntaxError(null);
    setAvailableIds(null);
    setError(null);
  }

  function requestModeChange(next: typeof mode) {
    if (hasUnsavedOwnProblem && next !== mode) {
      setPendingResetAction({ type: "mode", next });
      return;
    }
    applyModeChange(next);
  }

  function requestSubjectChange(nextSubjectId: string) {
    if (nextSubjectId === subjectId) return;
    if (hasUnsavedOwnProblem) {
      setPendingResetAction({ type: "subject", nextSubjectId });
      return;
    }
    applyModeChange(null);
    setSubjectId(nextSubjectId);
  }

  function confirmPendingReset() {
    if (!pendingResetAction) return;
    if (pendingResetAction.type === "mode") {
      applyModeChange(pendingResetAction.next);
    } else {
      applyModeChange(null);
      setSubjectId(pendingResetAction.nextSubjectId);
    }
    setPendingResetAction(null);
  }

  async function acceptNotice() {
    if (!acknowledge || !userProfile || !notice) return;
    setLoading(true);
    setError(null);
    try {
      await bootstrapProfile({
        displayName: userProfile.displayName,
        consentVersion: notice.version,
      });
      setConsented(true);
    } catch (cause) {
      setError(secureErrorMessage(cause, "Consent could not be recorded."));
    } finally {
      setLoading(false);
    }
  }

  async function begin() {
    if (submitting.current || loading || !subjectId || !mode || !canStart)
      return;
    submitting.current = true;
    setError(null);
    setLoading(true);
    try {
      const ownInput = {
        subjectId,
        question: question.trim(),
        ...(questionLatex ? { questionLatex } : {}),
      };
      const result =
        mode === "curated"
          ? await startLearningSession({
              mode,
              subjectId,
              topicId,
            })
          : await startLearningSession({
              mode,
              ...ownInput,
              confirmationHash: (await previewVerifiedProblem(ownInput))
                .confirmationHash,
            });
      navigate(`/session/${result.session.id}/learn`);
    } catch (cause) {
      setError(
        secureErrorMessage(cause, "The secure session could not be started."),
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  if (loading && consented === null) {
    return (
      <StudentShell active="task">
        <TaskStartSkeleton />
      </StudentShell>
    );
  }

  if (consented === null) {
    return (
      <StudentShell active="task">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
            Learning setup could not be loaded
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            We could not check the learning catalog and privacy notice. Try
            loading them again.
          </p>
          {error && <Alert tone="error">{error}</Alert>}
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="min-h-11 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Try again
          </button>
        </div>
      </StudentShell>
    );
  }

  if (consented === false) {
    return (
      <StudentShell active="task">
        <div className="mx-auto max-w-2xl rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900/80">
          <ShieldCheck
            aria-hidden="true"
            className="h-12 w-12 text-indigo-600 dark:text-indigo-400"
          />
          <h1 className="mt-4 text-2xl font-bold text-slate-950 dark:text-white">
            Privacy and Responsible AI Notice
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">
            {notice?.summary}
          </p>
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Practice feedback is calculated in your browser. Learning records
            follow the retention policy described in the notice.
          </div>
          <label className="mt-6 flex items-start gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={acknowledge}
              onChange={(event) => setAcknowledge(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
            />
            I have read the notice, understand that automated practice feedback
            can be inaccurate, and consent to the described capstone data use.
          </label>
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
          <button
            type="button"
            disabled={!acknowledge || loading}
            onClick={() => void acceptNotice()}
            className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            {loading && (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            )}
            {loading ? "Saving acknowledgement..." : "Acknowledge and continue"}
          </button>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell active="task">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Start a secure MINDGUIDE session
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Select a subject, pick a problem format, and enter your guided
            reasoning workspace.
          </p>
        </div>

        {catalog && catalog.subjects.length > 0 && (
          <section aria-labelledby="step-subject-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  Step 1 of 3
                </p>
                <h2
                  id="step-subject-heading"
                  className="text-lg font-bold text-slate-950 dark:text-white"
                >
                  Choose a subject
                </h2>
              </div>
              {subjectId && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => requestSubjectChange("")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                  Change subject
                </button>
              )}
            </div>

            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {catalog.subjects.map((subject) => {
                const progress = subjectProgress[subject.name];
                const selected = subject.id === subjectId;
                return (
                  <button
                    key={subject.id}
                    type="button"
                    disabled={loading}
                    aria-pressed={selected}
                    onClick={() => requestSubjectChange(subject.id)}
                    className={`min-w-0 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:p-5 ${
                      selected
                        ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600/20 dark:border-indigo-400 dark:bg-indigo-950/30"
                        : "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 font-bold text-slate-950 dark:text-white">
                        {subject.name}
                      </h3>
                      {selected && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                          <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="mt-2 break-words text-sm text-slate-600 dark:text-slate-300">
                      {subject.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="whitespace-nowrap">
                        <strong className="block text-slate-950 dark:text-white">
                          {progress?.sessionsCompleted ?? 0}
                        </strong>
                        Completed
                      </span>
                      <span className="whitespace-nowrap">
                        <strong className="block text-slate-950 dark:text-white">
                          {progress?.averageCTScore ?? 0}/100
                        </strong>
                        Average
                      </span>
                      <span className="whitespace-nowrap">
                        <strong className="block text-indigo-700 dark:text-indigo-300">
                          {progress?.recommendedDifficulty ?? "Basic"}
                        </strong>
                        Recommended
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!catalog?.subjects.length && <p>No approved topics are available yet.</p>}

        {subjectId && (
          <section aria-labelledby="step-mode-heading">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
              Step 2 of 3
            </p>
            <h2
              id="step-mode-heading"
              className="text-lg font-bold text-slate-950 dark:text-white"
            >
              Choose a problem type
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModeButton
                active={mode === "curated"}
                disabled={loading}
                onClick={() => requestModeChange("curated")}
                icon={<BookOpen aria-hidden="true" className="mx-auto mb-2 h-5 w-5" />}
                label="Prepared Problem"
              />
              <ModeButton
                active={mode === "free_form"}
                disabled={loading}
                onClick={() => requestModeChange("free_form")}
                icon={
                  <CheckCircle2 aria-hidden="true" className="mx-auto mb-2 h-5 w-5" />
                }
                label="Own Problem"
              />
            </div>
          </section>
        )}

        {mode && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900/80">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                Step 3 of 3
              </p>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                {mode === "curated"
                  ? "Select topic and enter session"
                  : "Enter your problem and validate"}
              </h2>
            </div>

            {mode === "curated" ? (
              <>
                {availableIds === null ? (
                  error ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-indigo-400"
                      onClick={() => {
                        setError(null);
                        setAvailabilityAttempt((n) => n + 1);
                      }}
                    >
                      Retry loading topics
                    </button>
                  ) : (
                    <p
                      role="status"
                      className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                    >
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      Loading available topics…
                    </p>
                  )
                ) : topics.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No approved prepared topics are available for this subject.
                  </p>
                ) : (
                  <>
                    <label className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      Topic
                      <select
                        disabled={loading}
                        value={topicId}
                        onChange={(event) => {
                          setTopicId(event.target.value);
                          setError(null);
                        }}
                        className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 p-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700"
                      >
                        <option value="">Select a topic</option>
                        {topics.map((topic) => (
                          <option key={topic.id} value={topic.id}>
                            {topic.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedTopic?.subtopics && (
                      <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
                        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                          Subtopics
                        </summary>
                        <ul className="mt-2 ml-5 list-disc space-y-1 text-slate-600 dark:text-slate-400">
                          {selectedTopic.subtopics.map((item) => (
                            <li key={item.id}>
                              {item.name}
                              {item.children && (
                                <ul className="ml-5 list-disc">
                                  {item.children.map((child) => (
                                    <li key={child.id}>{child.name}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {selectedTopic && (
                      <section
                        aria-label="Adaptive difficulty assignment"
                        className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/30"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            Assigned Difficulty: {difficulty}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-indigo-700 dark:bg-slate-900 dark:text-indigo-300">
                              Mastery: {recommendation?.masteryStatus ?? "Developing"}
                            </span>
                            {recommendation?.decisionLabel && (
                              <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 font-semibold text-slate-700 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-300">
                                {recommendation.decisionLabel}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {recommendation?.reason ??
                            "Adaptive assignment starts at Basic. Complete 3 distinct sessions in this topic to evaluate advancement."}
                        </p>
                      </section>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <MathInput
                  label="Mathematical problem"
                  maxLength={2000}
                  disabled={loading}
                  value={{ plainText: question, latex: questionLatex }}
                  onChange={(value) => {
                    setQuestion(value.plainText);
                    setQuestionLatex(value.latex ?? "");
                    setError(null);
                  }}
                  onSyntaxError={setMathSyntaxError}
                  explanationPlaceholder={examples[0]?.example}
                  notationHint="For optional notation, place [math] once in your problem where the expression belongs."
                  notationHeaderActions={
                    <ProblemMediaCapture
                      key={subjectId}
                      subjectId={subjectId}
                      disabled={loading}
                      onExtracted={({ plainText, latex }) => {
                        setQuestion(plainText);
                        setQuestionLatex(latex);
                        setMathSyntaxError(null);
                        setError(null);
                      }}
                    />
                  }
                />
                {trimmedQuestionLength > 0 && trimmedQuestionLength < 8 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter at least {8 - trimmedQuestionLength} more character
                    {8 - trimmedQuestionLength === 1 ? "" : "s"} (
                    {trimmedQuestionLength}/8 minimum).
                  </p>
                )}
                {examples.length > 0 && (
                  <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
                    <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                      Supported formats and examples
                    </summary>
                    <ul className="mt-2 ml-5 list-disc space-y-2 text-slate-600 dark:text-slate-400">
                      {examples.map((item) => (
                        <li key={item.example}>
                          <strong className="text-slate-900 dark:text-slate-200">
                            {item.types}
                          </strong>
                          <br />
                          {item.example}
                          <br />
                          {item.limitation}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {questionLatex.length > 2000 && (
                  <Alert tone="error">
                    Notation must be at most 2000 characters.
                  </Alert>
                )}
              </>
            )}

            {error && <Alert tone="error">{error}</Alert>}

            <button
              type="button"
              disabled={loading || !canStart}
              onClick={() => void begin()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              )}
              <span>
                {loading
                  ? "Starting secure session..."
                  : mode === "curated"
                    ? "Start Session"
                    : "Validate and start"}
              </span>
              {!loading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingResetAction)}
        onOpenChange={(open) => {
          if (!open) setPendingResetAction(null);
        }}
        title="Clear your typed problem?"
        description="Changing your subject or problem type will clear the custom problem you entered."
        confirmLabel="Clear and switch"
        cancelLabel="Keep editing"
        onConfirm={confirmPendingReset}
      />
    </StudentShell>
  );
}

function TaskStartSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading learning setup"
      className="mx-auto max-w-3xl space-y-6"
    >
      <span className="sr-only">Loading learning setup</span>
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={() => {
        if (!active) onClick();
      }}
      className={`min-h-11 rounded-xl border p-4 font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
        active
          ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function topicKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
