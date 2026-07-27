import type {
  AdaptiveRecommendation,
  Difficulty,
  GetCurrentConsentNoticeResponse,
} from "@mindguide/contracts";
import { callableError } from "./errors.js";
import { database, FieldValue, Timestamp } from "./runtime.js";
import { millis } from "./session-state.js";
import { recommendDifficulty } from "./workflow.js";

const CURRENT_CONSENT_VERSION = "privacy-2026-07-18";

export async function requireCurrentConsent(uid: string): Promise<void> {
  const notice = await readCurrentConsentNotice();
  const consent = await database.doc(`users/${uid}/consents/${notice.version}`).get();
  if (!consent.exists) throw callableError("failed-precondition", "consent_required", "Review and acknowledge the current privacy and responsible-AI notice before starting a session.");
}

export async function readCurrentConsentNotice(): Promise<GetCurrentConsentNoticeResponse> {
  const privacy = await database.doc("system_settings/privacy").get();
  const version = String(privacy.get("currentConsentVersion") ?? CURRENT_CONSENT_VERSION);
  const policy = await database.doc(`policy_documents/${version}`).get();
  if (!policy.exists || policy.get("status") !== "active") {
    throw callableError(
      "failed-precondition",
      "consent_policy_unavailable",
      "The current privacy notice is not configured correctly. Contact a system administrator."
    );
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    version,
    title: String(policy.get("title") ?? "MINDGUIDE Privacy and Responsible AI Notice"),
    summary: String(policy.get("summary") ?? ""),
    collectedData: strings(policy.get("collectedData")),
    purpose: String(policy.get("purpose") ?? ""),
    retention: String(policy.get("retention") ?? ""),
  };
}

export async function writeAIFailure(value: Record<string, unknown>): Promise<void> {
  await database.collection("ai_failure_logs").add({ ...value, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000) });
}

export async function selectAdaptiveProblem(options: {
  uid: string;
  requestedProblemId?: string;
  requestedSubject?: string;
  requestedTopic?: string;
}): Promise<{
  problem: FirebaseFirestore.QueryDocumentSnapshot;
  recommendation: AdaptiveRecommendation;
}> {
  const requested = options.requestedProblemId
    ? await database.doc(`problems/${options.requestedProblemId}`).get()
    : null;
  const subject = options.requestedSubject ?? requested?.get("subject");
  const topic = options.requestedTopic ?? requested?.get("topic");
  if (!subject || !topic) {
    throw callableError("invalid-argument", "problem_context_required", "Choose a prepared problem topic before starting.");
  }

  const recentSnapshot = await database
    .collection("sessions")
    .where("studentId", "==", options.uid)
    .orderBy("updatedAt", "desc")
    .limit(30)
    .get();
  const recentTopicSessions = recentSnapshot.docs
    .filter((document) => document.get("topic") === topic && document.get("scorecard"))
    .slice(0, 2);
  const currentDifficulty = (recentTopicSessions[0]?.get("difficulty") ?? "Basic") as Difficulty;
  const recommendation = recentTopicSessions.length === 0
    ? {
        recommendedDifficulty: "Basic" as const,
        reason: "No completed session exists for this topic, so adaptive practice begins at Basic.",
        confidence: "low" as const,
      }
    : recommendDifficulty({
        currentDifficulty,
        recentSessions: recentTopicSessions.map((document) => ({
          score: Number(document.get("scorecard")?.total ?? 0),
          supportUsage: Number(document.get("supportUsage") ?? document.get("hintsUsed") ?? 0),
          diagnoses: Array.isArray(document.get("diagnosisSummary")) ? document.get("diagnosisSummary") : [],
        })),
      });

  const exact = await database.collection("problems")
    .where("status", "==", "approved")
    .where("subject", "==", subject)
    .where("topic", "==", topic)
    .where("difficulty", "==", recommendation.recommendedDifficulty)
    .get();
  let candidates = exact.docs;
  if (candidates.length === 0) {
    const allTopicProblems = await database.collection("problems")
      .where("status", "==", "approved")
      .where("subject", "==", subject)
      .where("topic", "==", topic)
      .get();
    const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
    const target = levels.indexOf(recommendation.recommendedDifficulty);
    candidates = allTopicProblems.docs
      .sort((first, second) => {
        const firstDistance = Math.abs(levels.indexOf(first.get("difficulty")) - target);
        const secondDistance = Math.abs(levels.indexOf(second.get("difficulty")) - target);
        return firstDistance - secondDistance || first.id.localeCompare(second.id);
      });
  }
  if (candidates.length === 0) {
    throw callableError("not-found", "problem_unavailable", "No approved prepared problem is available for this topic.");
  }

  const lastUsed = new Map<string, number>();
  recentSnapshot.docs.forEach((document) => {
    const problemId = document.get("problemId");
    if (typeof problemId !== "string" || lastUsed.has(problemId)) return;
    lastUsed.set(problemId, millis(document.get("updatedAt")));
  });
  candidates.sort((first, second) =>
    (lastUsed.get(first.id) ?? 0) - (lastUsed.get(second.id) ?? 0) || first.id.localeCompare(second.id)
  );
  const problem = candidates[0];
  const selectedDifficulty = problem.get("difficulty") as Difficulty;
  return {
    problem,
    recommendation: selectedDifficulty === recommendation.recommendedDifficulty
      ? recommendation
      : {
          ...recommendation,
          recommendedDifficulty: selectedDifficulty,
          reason: `${recommendation.reason} The nearest available approved tier is ${selectedDifficulty}.`,
        },
  };
}

