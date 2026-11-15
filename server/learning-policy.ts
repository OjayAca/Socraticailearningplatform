import type {
  AdaptiveDecisionLabel,
  DiagnosisCategory,
  Difficulty,
  PersistentMisconceptionRecord,
  Subject,
  TopicMasteryStatus,
} from "../packages/contracts/src/index";

/** Versioned formative policy. Threshold changes require an explicit policy revision. */
export const ADAPTIVE_POLICY = Object.freeze({
  version: "topic-mastery-v1", window: 5, minimumSessions: 3,
  advanceAccuracy: 80, advanceReasoning: 80, advanceMethod: 80, advanceJustification: 80, advanceLogicalValidity: 80,
  reduceBelow: 50, repeatedDifficultyCount: 2, maxHintsPerIndependentSession: 1,
  independentFraction: 0.8, maxCorrectionCyclesForAdvance: 1,
});
const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
const criteria = ["accuracy", "logicalValidity", "methodSelection", "explanationQuality"] as const;
const conceptualCategories = new Set([
  "conceptual_error",
  "wrong_formula",
  "theorem_condition_violation",
  "invalid_logic",
  "misinterpreted_variable",
  "procedural_error",
  "incorrect_interpretation",
]);

const completionTime = (s: any): number => new Date(s.submittedAt).getTime();

/**
 * Evaluates whether a completed session qualifies as independent under the adaptive policy.
 * Neutral `socratic_prompt` entries and single self-corrected mistakes do not disqualify independence.
 *
 * @param session - Completed session record.
 * @param maxSubstantiveHints - Maximum allowed Level 1 (`targeted_hint`) support events.
 * @returns True if the session was completed independently.
 */
export function isIndependentSession(session: any, maxSubstantiveHints = ADAPTIVE_POLICY.maxHintsPerIndependentSession): boolean {
  const history = Array.isArray(session.supportHistory) ? session.supportHistory : [];
  const substantiveHints = history.filter((h: any) => h.level && h.level !== "socratic_prompt");
  const hasHeavyHint = substantiveHints.some((h: any) =>
    ["stronger_hint", "partial_step", "worked_explanation", "full_solution"].includes(h.level),
  );
  if (hasHeavyHint || substantiveHints.length > maxSubstantiveHints) return false;
  return true;
}

/**
 * Computes the effective correction cycles for a session, accounting for independent self-correction.
 * When a gate was self-corrected without substantive hints after a single mistake, its effective penalty is reduced by 1.
 *
 * @param session - Completed session record.
 * @returns Maximum effective correction cycle count across all gates in the session.
 */
export function effectiveSessionCorrections(session: any): number {
  const gates = Object.values(session.gateEvaluations ?? {}) as any[];
  if (!gates.length) return 0;
  return Math.max(
    0,
    ...gates.map((g: any) => {
      const raw = Number(g?.correctiveCycleCount ?? 0);
      if (g?.selfCorrected && raw <= 2) return Math.max(0, raw - 1);
      return raw;
    }),
  );
}

/**
 * Updates the learner's persistent cross-session misconception profile for a submitted session.
 * Distinguishes tentative (`medium` confidence single occurrence) from confirmed (`high` confidence or recurring)
 * and resolves misconceptions when the learner completes a session in the same topic cleanly or via self-correction.
 *
 * @param existing - Current misconception profile map from `learning_progress`.
 * @param session - Newly submitted session record.
 * @param now - Current timestamp in milliseconds.
 * @returns Updated misconception profile map.
 */
export function updateMisconceptionProfile(
  existing: Record<string, PersistentMisconceptionRecord> | undefined,
  session: any,
  now = Date.now(),
): Record<string, PersistentMisconceptionRecord> {
  const profile: Record<string, PersistentMisconceptionRecord> = { ...(existing ?? {}) };
  const topicId = String(session.topicId ?? "general");
  const subject = (session.subject ?? "Quantitative Methods") as Subject;
  const sessionId = String(session.id ?? "");

  const rawSummary: string[] = Array.isArray(session.diagnosisSummary) ? session.diagnosisSummary : [];
  const tentativeList: string[] = Array.isArray(session.tentativeDiagnoses) ? session.tentativeDiagnoses : [];
  const selfCorrectedCategories = new Set<string>(
    Array.isArray(session.selfCorrectedCategories) ? session.selfCorrectedCategories : [],
  );

  const activeInSession = new Set<string>(
    rawSummary.filter((c): c is string => typeof c === "string" && c !== "none" && c !== "unrecognized_alternative"),
  );
  const tentativeInSession = new Set<string>(
    tentativeList.filter((c): c is string => typeof c === "string" && c !== "none" && c !== "unrecognized_alternative"),
  );

  // 1. Mark existing misconceptions in this topic that did NOT occur (or were self-corrected without recurring) as progressing toward resolution
  for (const [key, record] of Object.entries(profile)) {
    if (record.topicId !== topicId) continue;
    if (!activeInSession.has(record.category) && !tentativeInSession.has(record.category)) {
      const consecutive = (record.consecutiveResolvedSessions ?? 0) + 1;
      profile[key] = {
        ...record,
        consecutiveResolvedSessions: consecutive,
        status: "resolved",
        lastResolvedAt: now,
      };
    }
  }

  // 2. Record tentative diagnoses (medium confidence)
  for (const category of tentativeInSession) {
    if (activeInSession.has(category)) continue;
    const key = `${topicId}__${category}`;
    const prev = profile[key];
    const distinctIds = prev ? [...new Set([...prev.distinctSessionIds, ...(sessionId ? [sessionId] : [])])] : sessionId ? [sessionId] : [];
    const occurrences = distinctIds.length || (prev?.occurrences ?? 0) + 1;
    const corroborated = occurrences >= ADAPTIVE_POLICY.repeatedDifficultyCount || prev?.status === "confirmed";
    profile[key] = {
      category: category as DiagnosisCategory,
      topicId,
      subject,
      status: corroborated ? "confirmed" : "tentative",
      confidence: corroborated ? "high" : "medium",
      occurrences,
      distinctSessionIds: distinctIds,
      lastSeenAt: now,
      lastResolvedAt: prev?.lastResolvedAt ?? null,
      consecutiveResolvedSessions: 0,
    };
  }

  // 3. Record high-confidence diagnoses
  for (const category of activeInSession) {
    const key = `${topicId}__${category}`;
    const prev = profile[key];
    const distinctIds = prev ? [...new Set([...prev.distinctSessionIds, ...(sessionId ? [sessionId] : [])])] : sessionId ? [sessionId] : [];
    const occurrences = distinctIds.length || (prev?.occurrences ?? 0) + 1;
    const wasSelfCorrected = selfCorrectedCategories.has(category) && occurrences < ADAPTIVE_POLICY.repeatedDifficultyCount;
    profile[key] = {
      category: category as DiagnosisCategory,
      topicId,
      subject,
      status: wasSelfCorrected && prev?.status !== "confirmed" ? "resolved" : "confirmed",
      confidence: "high",
      occurrences,
      distinctSessionIds: distinctIds,
      lastSeenAt: now,
      lastResolvedAt: wasSelfCorrected ? now : (prev?.lastResolvedAt ?? null),
      consecutiveResolvedSessions: wasSelfCorrected ? 1 : 0,
    };
  }

  return profile;
}

export function recommendDifficulty(
  current: Difficulty,
  sessions: any[],
  workflowVersion: number,
  topicId?: string,
  misconceptionProfile?: Record<string, PersistentMisconceptionRecord>,
) {
  const policy = ADAPTIVE_POLICY;
  const seen = new Set<string>();
  const recent = sessions.filter(s => s.workflowVersion === workflowVersion && s.status === "submitted"
    && s.statsCommittedAt && (s.instructionalLevel ?? s.difficulty) === current && (!topicId || s.topicId === topicId)
    && Number.isFinite(completionTime(s))
    && criteria.every(k => Number.isInteger(s.scorecard?.criteria?.[k]?.score) && s.scorecard.criteria[k].score >= 0 && s.scorecard.criteria[k].score <= 25))
    .sort((a,b) => completionTime(b) - completionTime(a))
    .filter(s => {
      // Retakes never multiply mastery evidence; keep the most recent completed attempt.
      const key = s.problemId || s.id;
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, policy.window);
  const percent = (s: any, key: typeof criteria[number]) => s.scorecard.criteria[key].score * 4;
  const reasoning = (s: any) => (percent(s,"logicalValidity") + percent(s,"methodSelection") + percent(s,"explanationQuality")) / 3;
  const corrections = (s: any) => effectiveSessionCorrections(s);
  const independent = (s: any) => isIndependentSession(s, policy.maxHintsPerIndependentSession);
  const mean = (fn: (s: any) => number) => recent.length ? recent.reduce((sum,s) => sum + fn(s),0) / recent.length : null;

  const misconceptionCounts = new Map<string, number>();
  const activeUnresolvedCounts = new Map<string, number>();
  let conceptualMisconceptionSessions = 0;

  // Recent is sorted newest first (index 0 is most recent).
  // A misconception is considered resolved if the most recent session(s) in the window completed cleanly without it
  // after only a single earlier occurrence, or if it was explicitly marked resolved.
  const latestClean = recent.length > 0 && (!Array.isArray(recent[0].diagnosisSummary) || recent[0].diagnosisSummary.filter((c: unknown) => typeof c === "string" && c !== "none" && c !== "unrecognized_alternative").length === 0);

  for (let idx = 0; idx < recent.length; idx++) {
    const session = recent[idx];
    const resolvedSet = new Set<string>(Array.isArray(session.resolvedMisconceptions) ? session.resolvedMisconceptions : []);
    const categories = new Set<string>(
      (Array.isArray(session.diagnosisSummary) ? session.diagnosisSummary : []).filter(
        (category: unknown): category is string =>
          typeof category === "string" && category !== "none" && category !== "unrecognized_alternative",
      ),
    );
    const unresolvedCategories = [...categories].filter(cat => !resolvedSet.has(cat));
    if (unresolvedCategories.some(category => conceptualCategories.has(category))) {
      conceptualMisconceptionSessions += 1;
    }
    for (const category of categories) {
      misconceptionCounts.set(category, (misconceptionCounts.get(category) ?? 0) + 1);
    }
    for (const category of unresolvedCategories) {
      // Only count toward active unresolved recurring misconceptions if not superseded by 2+ clean latest sessions
      const supersededByRecentClean = idx >= 2 && latestClean
        && (!Array.isArray(recent[1]?.diagnosisSummary) || !recent[1].diagnosisSummary.includes(category));
      if (!supersededByRecentClean) {
        activeUnresolvedCounts.set(category, (activeUnresolvedCounts.get(category) ?? 0) + 1);
      }
    }
  }

  const profileConfirmed = Object.values(misconceptionProfile ?? {})
    .filter(record => record && record.status === "confirmed" && (!topicId || !record.topicId || record.topicId === topicId))
    .map(record => record.category);

  const recurringMisconceptions = [
    ...new Set([
      ...[...activeUnresolvedCounts.entries()]
        .filter(([, count]) => count >= policy.repeatedDifficultyCount)
        .map(([category]) => category),
      ...profileConfirmed,
    ]),
  ];

  const accuracyMean = mean(s => percent(s, "accuracy"));
  const logicalValidityMean = mean(s => percent(s, "logicalValidity"));
  const methodSelectionMean = mean(s => percent(s, "methodSelection"));
  const justificationMean = mean(s => percent(s, "explanationQuality"));
  const reasoningMean = mean(reasoning);
  const repeatedDifficulties = recent.filter(s => percent(s,"accuracy") < policy.reduceBelow || reasoning(s) < policy.reduceBelow).length;

  const evidence = {
    topicId: topicId ?? recent[0]?.topicId ?? null, currentDifficulty: current,
    sessionIds: recent.map(s => s.id), completedSessions: recent.length,
    accuracy: accuracyMean, reasoning: reasoningMean,
    logicalValidity: logicalValidityMean,
    methodSelection: methodSelectionMean, justification: justificationMean,
    independentSessions: recent.filter(independent).length,
    repeatedDifficulties,
    maxCorrectionCycles: recent.length ? Math.max(...recent.map(corrections)) : 0,
    misconceptions: [...new Set(recent.flatMap(s => s.diagnosisSummary ?? []))],
    recurringMisconceptions,
  };

  let change = 0;
  let decision = "maintain_insufficient_evidence";

  // Asymmetric stability control:
  // Immediate remediation is allowed when >= repeatedDifficultyCount (2) sessions at Intermediate/Advanced show severe difficulty,
  // even before reaching the 3-session advancement window.
  const needsImmediateRemediation = recent.length >= policy.repeatedDifficultyCount && (
    ((evidence.accuracy! < policy.reduceBelow || evidence.reasoning! < policy.reduceBelow)
      && evidence.repeatedDifficulties >= policy.repeatedDifficultyCount)
    || (recurringMisconceptions.length > 0 && (evidence.reasoning! < policy.advanceReasoning || evidence.methodSelection! < policy.advanceMethod))
  );

  if (needsImmediateRemediation && (recent.length >= policy.minimumSessions || current !== "Basic")) {
    change = -1;
    decision = "remediation";
  } else if (recent.length >= policy.minimumSessions) {
    if (evidence.accuracy! >= policy.advanceAccuracy
      && evidence.reasoning! >= policy.advanceReasoning
      && evidence.logicalValidity! >= policy.advanceLogicalValidity
      && evidence.methodSelection! >= policy.advanceMethod
      && evidence.justification! >= policy.advanceJustification
      && evidence.independentSessions / recent.length >= policy.independentFraction
      && evidence.maxCorrectionCycles <= policy.maxCorrectionCyclesForAdvance
      && recurringMisconceptions.length === 0
      && conceptualMisconceptionSessions < policy.repeatedDifficultyCount) {
      change = 1;
      decision = "advance";
    } else {
      decision = "maintain_mixed_evidence";
    }
  }

  const decisionLabel: AdaptiveDecisionLabel =
    decision === "advance" ? "Advance" : decision === "remediation" ? "Remediate" : "Maintain";

  const masteryStatus: TopicMasteryStatus =
    decision === "remediation"
      ? "Needs remediation"
      : decision === "advance" || (current === "Advanced" && recent.length >= policy.minimumSessions && evidence.accuracy! >= policy.advanceAccuracy && evidence.reasoning! >= policy.advanceReasoning && recurringMisconceptions.length === 0)
        ? "Mastered"
        : "Developing";

  const cooldownSessionsRemaining = decision === "advance" || decision === "remediation"
    ? 0
    : Math.max(0, policy.minimumSessions - recent.length);

  const recommendedDifficulty = levels[Math.max(0,Math.min(2,levels.indexOf(current)+change))];
  const focusNote = evidence.misconceptions.length ? ` Recorded focus areas: ${evidence.misconceptions.join(", ")}.` : "";
  return {
    recommendedDifficulty,
    confidence: recent.length < policy.minimumSessions ? ("low" as const) : ("medium" as const),
    reason: `${decision}: ${recent.length}/${policy.minimumSessions} required distinct completed ${current} sessions in this topic; ${Math.round(evidence.accuracy ?? 0)}% accuracy, ${Math.round(evidence.reasoning ?? 0)}% reasoning, ${evidence.independentSessions} with limited assistance. ${change < 0 ? "Review the difficult reasoning steps before retrying." : "Question availability never changes this recommendation."}${focusNote}`,
    decision,
    decisionLabel,
    masteryStatus,
    cooldownSessionsRemaining,
    policyVersion: policy.version,
    thresholds: policy,
    evidence,
  };
}
