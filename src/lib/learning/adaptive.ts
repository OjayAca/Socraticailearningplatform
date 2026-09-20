import type { AdaptiveRecommendation, Difficulty } from "@mindguide/contracts";

export interface AccuracyEvidence { sessionId: string; correct: boolean; completedAt: number }
const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];

export function adaptiveDifficulty(current: Difficulty, evidence: AccuracyEvidence[]): AdaptiveRecommendation {
  const recent = [...evidence].sort((a, b) => b.completedAt - a.completedAt).slice(0, 5);
  if (!recent.length) return { recommendedDifficulty: "Basic", confidence: "low", reason: "No assessable completed questions yet. Practice begins at Basic." };
  const accuracy = recent.filter(item => item.correct).length / recent.length;
  const offset = accuracy >= .8 ? 1 : accuracy < .5 ? -1 : 0;
  return {
    recommendedDifficulty: levels[Math.min(2, Math.max(0, levels.indexOf(current) + offset))],
    confidence: recent.length === 5 ? "high" : "low",
    reason: `${Math.round(accuracy * 100)}% first-answer accuracy across ${recent.length} completed question${recent.length === 1 ? "" : "s"}.`,
  };
}

export function selectUnanswered<T extends { id: string }>(candidates: T[], excluded: Set<string>, random = Math.random): T | null {
  const available = candidates.filter(item => !excluded.has(item.id));
  return available.length ? available[Math.min(available.length - 1, Math.floor(random() * available.length))] : null;
}
