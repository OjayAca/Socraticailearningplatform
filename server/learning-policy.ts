import type { Difficulty } from "../packages/contracts/src/index";

/** Versioned formative policy. Threshold changes require an explicit policy revision. */
export const ADAPTIVE_POLICY = Object.freeze({
  version: "topic-mastery-v1", window: 5, minimumSessions: 3,
  advanceAccuracy: 80, advanceReasoning: 80, advanceMethod: 80, advanceJustification: 80,
  reduceBelow: 50, repeatedDifficultyCount: 2, maxHintsPerIndependentSession: 1,
  independentFraction: 0.8, maxCorrectionCyclesForAdvance: 1,
});
const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
const criteria = ["accuracy", "logicalValidity", "methodSelection", "explanationQuality"] as const;
export const completionTime = (s: any): number => new Date(s.submittedAt).getTime();

export function recommendDifficulty(current: Difficulty, sessions: any[], workflowVersion: number, topicId?: string) {
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
  const corrections = (s: any) => Math.max(0, ...Object.values(s.gateEvaluations ?? {}).map((g: any) => Number(g.correctiveCycleCount ?? 0)));
  const independent = (s: any) => Array.isArray(s.supportHistory) && s.supportHistory.length <= policy.maxHintsPerIndependentSession
    && !s.supportHistory.some((h: any) => ["stronger_hint","partial_step","worked_explanation","full_solution"].includes(h.level));
  const mean = (fn: (s: any) => number) => recent.length ? recent.reduce((sum,s) => sum + fn(s),0) / recent.length : null;
  const evidence = {
    topicId: topicId ?? recent[0]?.topicId ?? null, currentDifficulty: current,
    sessionIds: recent.map(s => s.id), completedSessions: recent.length,
    accuracy: mean(s => percent(s,"accuracy")), reasoning: mean(reasoning),
    methodSelection: mean(s => percent(s,"methodSelection")), justification: mean(s => percent(s,"explanationQuality")),
    independentSessions: recent.filter(independent).length,
    repeatedDifficulties: recent.filter(s => percent(s,"accuracy") < policy.reduceBelow || reasoning(s) < policy.reduceBelow).length,
    maxCorrectionCycles: recent.length ? Math.max(...recent.map(corrections)) : 0,
    misconceptions: [...new Set(recent.flatMap(s => s.diagnosisSummary ?? []))],
  };
  let change = 0;
  let decision = "maintain_insufficient_evidence";
  if (recent.length >= policy.minimumSessions) {
    if ((evidence.accuracy! < policy.reduceBelow || evidence.reasoning! < policy.reduceBelow) && evidence.repeatedDifficulties >= policy.repeatedDifficultyCount) {
      change = -1; decision = "remediation";
    } else if (evidence.accuracy! >= policy.advanceAccuracy && evidence.reasoning! >= policy.advanceReasoning
      && evidence.methodSelection! >= policy.advanceMethod && evidence.justification! >= policy.advanceJustification
      && evidence.independentSessions / recent.length >= policy.independentFraction
      && evidence.maxCorrectionCycles <= policy.maxCorrectionCyclesForAdvance) {
      change = 1; decision = "advance";
    } else decision = "maintain_mixed_evidence";
  }
  const recommendedDifficulty = levels[Math.max(0,Math.min(2,levels.indexOf(current)+change))];
  return { recommendedDifficulty, confidence: recent.length < policy.minimumSessions ? "low" : "medium",
    reason: `${decision}: ${recent.length}/${policy.minimumSessions} required distinct completed ${current} sessions in this topic; ${Math.round(evidence.accuracy ?? 0)}% accuracy, ${Math.round(evidence.reasoning ?? 0)}% reasoning, ${evidence.independentSessions} with limited assistance. ${change < 0 ? "Review the difficult reasoning steps before retrying." : "Question availability never changes this recommendation."}`,
    decision, policyVersion: policy.version, thresholds: policy, evidence };
}
