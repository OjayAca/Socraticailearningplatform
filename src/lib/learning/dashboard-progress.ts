import { effectiveCurrentStreak } from "./session-state";

type RecordData = Record<string, any>;

export function sessionTime(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  return 0;
}

const dateKey = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
const validScore = (score: unknown): score is number => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100;

/** Derive the overview from all actual completions, including preserved legacy records. */
export function dashboardProgress(sessions: RecordData[], now = new Date()) {
  const completed = sessions.filter(s => ["completed", "submitted", "reviewed", "returned"].includes(s.status));
  const completionTime = (s: RecordData) => sessionTime(s.submittedAt ?? s.completedAt ?? s.learningCompletedAt ?? s.updatedAt);
  const scores = completed.map(s => validScore(s.scorecard?.total) ? s.scorecard.total : s.ctScore).filter(validScore);
  const days = [...new Set(completed.map(completionTime).filter(t => t > 0).map(dateKey))].sort().reverse();
  let streak = days.length ? 1 : 0;
  for (let i = 1; i < days.length; i++) {
    if (Date.parse(days[i - 1]) - Date.parse(days[i]) !== 86400000) break;
    streak++;
  }
  const latest = completed.filter(s => validScore(s.scorecard?.total)).sort((a, b) => completionTime(b) - completionTime(a) || String(b.id).localeCompare(String(a.id)))[0];
  return {
    sessionsCompleted: completed.length,
    averageCTScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    currentStreak: effectiveCurrentStreak(streak, days[0] ?? null, now),
    latestScorecard: latest ? { sessionId: latest.id as string, total: latest.scorecard.total as number, subject: latest.subject as string, topic: latest.topic as string, summary: latest.scorecard.feedback as string | undefined } : null,
  };
}
