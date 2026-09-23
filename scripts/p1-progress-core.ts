import type { AchievementAward, AchievementId, Difficulty, Subject } from "@mindguide/contracts";

const DEFINITIONS: Record<AchievementId, { title: string; description: string }> = {
  first_step: { title: "First Step", description: "Complete your first learning session." },
  dedicated_learner: { title: "Dedicated Learner", description: "Complete five learning sessions." },
  three_day_streak: { title: "Three-Day Streak", description: "Learn on three consecutive days." },
  strong_reasoner: { title: "Strong Reasoner", description: "Earn a scorecard total of 80 or higher." },
};

export interface P1SessionRecord {
  id: string;
  subject: Subject;
  topic: string;
  score: number;
  summary: string;
  generatedAt: number;
  submittedAt: number;
  recommendedDifficulty?: Difficulty;
  recommendationReason?: string;
}

export function rebuildP1Progress(uid: string, sessions: P1SessionRecord[], now = Date.now()) {
  const ordered = [...sessions].sort((left, right) => left.submittedAt - right.submittedAt || left.id.localeCompare(right.id));
  const achievements: Partial<Record<AchievementId, AchievementAward>> = {};
  const subjectProgress: Record<string, Record<string, unknown>> = {};
  let scoreTotal = 0;
  let streak = 0;
  let lastDate: string | null = null;
  for (let index = 0; index < ordered.length; index += 1) {
    const session = ordered[index];
    scoreTotal += session.score;
    const date = manilaDateKey(new Date(session.submittedAt));
    streak = lastDate === date ? Math.max(streak, 1) : lastDate === previousDateKey(date) ? streak + 1 : 1;
    lastDate = date;
    const current = subjectProgress[session.subject] ?? { sessionsCompleted: 0, scoreTotal: 0 };
    const subjectSessions = Number(current.sessionsCompleted) + 1;
    const subjectScore = Number(current.scoreTotal) + session.score;
    subjectProgress[session.subject] = {
      sessionsCompleted: subjectSessions,
      scoreTotal: subjectScore,
      averageCTScore: Math.round(subjectScore / subjectSessions),
      lastActivityAt: session.submittedAt,
      recommendedDifficulty: session.recommendedDifficulty ?? "Basic",
      recommendationReason: session.recommendationReason ?? "No later adaptive recommendation is available, so practice begins at Basic.",
    };
    const eligible: AchievementId[] = [];
    if (index + 1 >= 1) eligible.push("first_step");
    if (index + 1 >= 5) eligible.push("dedicated_learner");
    if (streak >= 3) eligible.push("three_day_streak");
    if (session.score >= 80) eligible.push("strong_reasoner");
    eligible.forEach((id) => {
      if (!achievements[id]) achievements[id] = { id, ...DEFINITIONS[id], sourceSessionId: session.id, awardedAt: session.submittedAt };
    });
  }
  const latest = ordered.at(-1);
  const today = manilaDateKey(new Date(now));
  const currentStreak = lastDate === today || lastDate === previousDateKey(today) ? streak : 0;
  return {
    userId: uid,
    sessionsCompleted: ordered.length,
    scoreTotal,
    averageCTScore: ordered.length ? Math.round(scoreTotal / ordered.length) : 0,
    currentStreak,
    lastSessionAt: latest?.submittedAt ?? null,
    lastSessionDate: lastDate,
    lastActivityAt: latest?.submittedAt ?? null,
    achievements,
    latestScorecard: latest ? {
      sessionId: latest.id,
      total: latest.score,
      subject: latest.subject,
      topic: latest.topic,
      summary: latest.summary,
      generatedAt: latest.generatedAt,
    } : null,
    subjectProgress,
  };
}

function manilaDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
