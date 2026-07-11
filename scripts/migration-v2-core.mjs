const ELIGIBLE_STATUSES = new Set(["submitted", "reviewed", "returned"]);
const VALID_STATUSES = new Set([
  "in_progress",
  "submitted",
  "reviewed",
  "returned",
]);
const VALID_STEPS = new Set([
  "trigger",
  "questioning",
  "hints",
  "logic_map",
  "draft",
  "review",
  "log",
  "confirmation",
]);
const VALID_PHASES = new Set([
  "problem_understanding",
  "method_selection",
  "formula_theorem_justification",
  "guided_computation_or_reasoning",
  "error_diagnosis",
  "progressive_unlock",
  "scorecard",
]);
const RUBRIC_CATEGORIES = [
  "accuracy",
  "logicalValidity",
  "methodSelection",
  "justificationQuality",
  "interpretationQuality",
];

export function normalizeProfileV2(data) {
  return {
    role: data.role === "teacher" ? "admin" : data.role,
    preferences: {
      liveAlertPopups:
        data.preferences?.liveAlertPopups ??
        data.preferences?.liveAlertsEnabled ??
        data.liveAlertsEnabled ??
        true,
    },
  };
}

export function normalizeSessionV2(id, data) {
  const review = normalizeReview(data);
  const status = normalizeStatus(data, review);
  const submittedAt = ELIGIBLE_STATUSES.has(status)
    ? data.submittedAt ?? data.completedAt ?? data.updatedAt ?? data.createdAt
    : null;
  const reviewedAt =
    status === "reviewed" || status === "returned"
      ? data.reviewedAt ?? review?.reviewedAt ?? data.updatedAt ?? submittedAt
      : null;
  const reviewedBy =
    status === "reviewed" || status === "returned"
      ? data.reviewedBy ?? review?.reviewedBy ?? data.teacherId ?? null
      : null;
  const problemContext = normalizeProblemContext(data);
  const messages = boundMessages(data.messages);
  const hints = normalizeHints(data.hints);
  const currentStep = normalizeStep(data.currentStep, status);

  return {
    id,
    data: {
      schemaVersion: 2,
      studentId: stringValue(data.studentId),
      studentName: stringValue(data.studentName, "Student").slice(0, 120),
      studentEmail: nullableString(data.studentEmail),
      subject: stringValue(data.subject),
      topic: stringValue(data.topic),
      problemMode: problemContext.mode,
      problemContext,
      difficulty:
        data.difficulty ??
        data.selectedProblem?.difficulty ??
        problemContext.promptSnapshot?.difficulty ??
        null,
      selectedProblemId:
        problemContext.mode === "curated" ? problemContext.problemId : null,
      originalQuestion: stringValue(
        data.originalQuestion,
        problemContext.mode === "curated"
          ? problemContext.promptSnapshot.problemText
          : problemContext.question
      ).slice(0, 2_000),
      status,
      currentStep,
      currentPhase: VALID_PHASES.has(data.currentPhase)
        ? data.currentPhase
        : status === "submitted"
          ? "scorecard"
          : "problem_understanding",
      completedPhases: arrayValue(data.completedPhases)
        .filter((phase) => VALID_PHASES.has(phase))
        .slice(0, 7),
      ctScore: clampNumber(data.ctScore, 0, 100),
      createdAt: data.createdAt ?? data.updatedAt ?? submittedAt,
      updatedAt: data.updatedAt ?? data.createdAt ?? submittedAt,
      submittedAt,
      reviewedAt,
      reviewedBy,
      adminReview: review,
      statsCommittedAt: ELIGIBLE_STATUSES.has(status)
        ? data.statsCommittedAt ?? submittedAt
        : null,
      messages,
      phaseResponses: arrayValue(data.phaseResponses).slice(0, 40),
      correctivePrompts: arrayValue(data.correctivePrompts).slice(0, 40),
      logicMap: arrayValue(data.logicMap).slice(0, 20),
      draft: normalizeDraft(data.draft),
      aiSummary: nullableString(data.aiSummary)?.slice(0, 4_000) ?? null,
      hints,
      hintsUsed: Math.min(
        40,
        Math.max(Number.isInteger(data.hintsUsed) ? data.hintsUsed : hints.length, 0)
      ),
      diagnosisResult: data.diagnosisResult ?? null,
      detectedMisconception: data.detectedMisconception ?? null,
      unlockLevel: Math.min(
        5,
        Math.max(Number.isInteger(data.unlockLevel) ? data.unlockLevel : 0, 0)
      ),
      mindGuideScorecard: data.mindGuideScorecard ?? data.scorecard ?? null,
      scorecard: data.scorecard ?? data.mindGuideScorecard ?? null,
      aiFallbackEvents: arrayValue(data.aiFallbackEvents).slice(0, 40),
      parentSessionId: nullableString(data.parentSessionId),
      followUpSessionId: nullableString(data.followUpSessionId),
    },
    removeFields: [
      "selectedProblem",
      "teacherId",
      "teacherFeedback",
      "completedAt",
    ],
  };
}

export function recalculateStats(sessions) {
  const eligible = sessions
    .filter((session) => ELIGIBLE_STATUSES.has(session.status))
    .sort((left, right) => timestampMillis(left.submittedAt) - timestampMillis(right.submittedAt));
  if (!eligible.length) {
    return {
      sessionsCompleted: 0,
      averageCTScore: 0,
      currentStreak: 0,
      lastSessionDate: null,
      topicPerformance: [],
    };
  }

  const scoreTotal = eligible.reduce((total, session) => total + sessionScore(session), 0);
  const topicMap = new Map();
  for (const session of eligible) {
    const key = `${session.subject}::${session.topic}`;
    const current = topicMap.get(key) ?? {
      subject: session.subject,
      topic: session.topic,
      attemptsCount: 0,
      averageScorecardTotal: 0,
      lastDifficulty: "Basic",
      lastErrorTypes: [],
      consecutiveStrongSessions: 0,
      consecutiveWeakSessions: 0,
      _scoreTotal: 0,
    };
    const score = sessionScore(session);
    const errors = sessionErrorTypes(session);
    current.attemptsCount += 1;
    current._scoreTotal += score;
    current.averageScorecardTotal = Math.round(
      current._scoreTotal / current.attemptsCount
    );
    current.lastDifficulty = session.difficulty ?? current.lastDifficulty;
    current.lastErrorTypes = errors;
    current.consecutiveStrongSessions =
      score >= 75 && errors.length === 0
        ? current.consecutiveStrongSessions + 1
        : 0;
    current.consecutiveWeakSessions =
      score < 40 || errors.length >= 2
        ? current.consecutiveWeakSessions + 1
        : 0;
    topicMap.set(key, current);
  }

  const topicPerformance = [...topicMap.values()]
    .map((entry) => {
      const publicEntry = { ...entry };
      delete publicEntry._scoreTotal;
      return publicEntry;
    })
    .sort((left, right) =>
      `${left.subject}:${left.topic}`.localeCompare(`${right.subject}:${right.topic}`)
    );

  return {
    sessionsCompleted: eligible.length,
    averageCTScore: Math.round(scoreTotal / eligible.length),
    currentStreak: calculateStreak(eligible.map((session) => session.submittedAt)),
    lastSessionDate: eligible.at(-1)?.submittedAt ?? null,
    topicPerformance,
  };
}

function normalizeStatus(data, review) {
  if (review?.outcome === "reviewed" || review?.outcome === "returned") {
    return review.outcome;
  }
  if (VALID_STATUSES.has(data.status)) return data.status;
  if (data.status === "completed") {
    return data.currentStep === "confirmation" ? "submitted" : "in_progress";
  }
  return "in_progress";
}

function normalizeReview(data) {
  const source = data.adminReview ?? data.teacherFeedback;
  if (!source || typeof source !== "object") return null;
  const outcome =
    source.outcome === "reviewed" || source.action === "approved"
      ? "reviewed"
      : source.outcome === "returned" || source.action === "returned"
        ? "returned"
        : null;
  if (!outcome) return null;
  return {
    comment: stringValue(source.comment, "Legacy review").slice(0, 2_000),
    outcome,
    reviewedBy: stringValue(
      source.reviewedBy ?? data.reviewedBy ?? data.teacherId,
      "legacy-admin"
    ),
    reviewedAt:
      source.reviewedAt ?? source.timestamp ?? data.reviewedAt ?? data.updatedAt,
  };
}

function normalizeProblemContext(data) {
  const existing = data.problemContext;
  if (existing?.mode === "curated" && existing.problemId) {
    return {
      mode: "curated",
      problemId: stringValue(existing.problemId).slice(0, 120),
      promptSnapshot: {
        subject: data.subject ?? existing.promptSnapshot?.subject,
        topic: data.topic ?? existing.promptSnapshot?.topic,
        difficulty: data.difficulty ?? existing.promptSnapshot?.difficulty ?? null,
        problemText: stringValue(
          data.originalQuestion,
          existing.promptSnapshot?.problemText
        ).slice(0, 2_000),
      },
    };
  }

  const selectedProblemId = data.selectedProblemId ?? data.selectedProblem?.id;
  if (selectedProblemId) {
    return {
      mode: "curated",
      problemId: stringValue(selectedProblemId).slice(0, 120),
      promptSnapshot: {
        subject: data.subject ?? data.selectedProblem?.subject,
        topic: data.topic ?? data.selectedProblem?.topic,
        difficulty: data.difficulty ?? data.selectedProblem?.difficulty ?? null,
        problemText: stringValue(
          data.originalQuestion,
          data.selectedProblem?.problemText
        ).slice(0, 2_000),
      },
    };
  }

  const question = stringValue(
    data.originalQuestion,
    existing?.question ?? "Legacy free-form question"
  ).slice(0, 2_000);
  return {
    mode: "free_form",
    question,
    analysis: normalizeLegacyAnalysis(existing?.analysis, data, question),
  };
}

function normalizeLegacyAnalysis(source, data, question) {
  if (source?.analysisVersion === 1) {
    return {
      ...source,
      validationStatus:
        source.validationStatus === "validated" ? "validated" : "legacy_unverified",
      normalizedQuestion: stringValue(source.normalizedQuestion, question).slice(0, 2_000),
      subject: data.subject ?? source.subject,
      topic: data.topic ?? source.topic,
      expectedConcepts: arrayValue(source.expectedConcepts).slice(0, 8),
      solutionOutline: arrayValue(source.solutionOutline).slice(0, 10),
      referenceAnswer: stringValue(source.referenceAnswer).slice(0, 4_000),
      interpretation: stringValue(source.interpretation).slice(0, 2_000),
      rubric: normalizeRubric(source.rubric),
    };
  }
  return {
    analysisVersion: 1,
    validationStatus: "legacy_unverified",
    isSupported: false,
    isSolvable: false,
    rejectionReason:
      "This pre-v2 question must be re-entered and validated before starting a new guided attempt.",
    normalizedQuestion: question,
    subject: data.subject,
    topic: data.topic,
    expectedConcepts: [],
    requiredFormula: null,
    requiredTheorem: null,
    solutionOutline: [],
    referenceAnswer: "",
    interpretation: "",
    rubric: normalizeRubric([]),
  };
}

function normalizeRubric(rubric) {
  return RUBRIC_CATEGORIES.map((category) => {
    const source = arrayValue(rubric).find((entry) => entry?.category === category);
    return {
      category,
      criterion: stringValue(
        source?.criterion,
        `Assess ${category} against the validated problem reference.`
      ).slice(0, 600),
      maxScore: 20,
    };
  });
}

function normalizeStep(step, status) {
  if (step === "productive") return "questioning";
  if (VALID_STEPS.has(step)) return step;
  if (status === "submitted") return "confirmation";
  if (status === "reviewed" || status === "returned") return "log";
  return "trigger";
}

function normalizeHints(hints) {
  return arrayValue(hints)
    .slice(0, 20)
    .map((hint, index) =>
      typeof hint === "string"
        ? {
            id: `legacy-hint-${index + 1}`,
            level: Math.min(index + 1, 5),
            content: hint.slice(0, 4_000),
            phase: "progressive_unlock",
            source: "ai",
            createdAt: 0,
          }
        : {
            id: stringValue(hint?.id, `legacy-hint-${index + 1}`),
            level: Math.min(Math.max(Number(hint?.level) || index + 1, 1), 5),
            content: stringValue(hint?.content).slice(0, 4_000),
            phase: VALID_PHASES.has(hint?.phase)
              ? hint.phase
              : "progressive_unlock",
            source: hint?.source === "progressive_unlock" ? hint.source : "ai",
            createdAt: Number(hint?.createdAt) || 0,
          }
    );
}

function boundMessages(messages) {
  const selected = [];
  let studentCount = 0;
  for (const message of arrayValue(messages).slice().reverse()) {
    if (!message || (message.role !== "student" && message.role !== "ai")) continue;
    if (message.role === "student" && studentCount >= 40) continue;
    if (message.role === "student") studentCount += 1;
    selected.push({
      ...message,
      content: stringValue(message.content).slice(
        0,
        message.role === "student" ? 2_000 : 4_000
      ),
    });
    if (selected.length >= 81) break;
  }
  return selected.reverse();
}

function normalizeDraft(draft) {
  if (!draft || typeof draft !== "object") return null;
  return {
    answer: stringValue(draft.answer).slice(0, 4_000),
    methodology: stringValue(draft.methodology).slice(0, 4_000),
    reflection: stringValue(draft.reflection).slice(0, 2_000),
  };
}

function sessionScore(session) {
  return clampNumber(
    session.mindGuideScorecard?.total ??
      session.scorecard?.total ??
      session.ctScore ??
      0,
    0,
    100
  );
}

function sessionErrorTypes(session) {
  const values = [
    ...arrayValue(session.phaseResponses).map(
      (response) => response?.diagnosisResult?.errorType
    ),
    session.diagnosisResult?.errorType,
    session.detectedMisconception,
  ].filter((value) => typeof value === "string" && value !== "none");
  return [...new Set(values)];
}

function calculateStreak(timestamps) {
  const days = [...new Set(timestamps.map(timestampDay).filter(Boolean))].sort();
  if (!days.length) return 0;
  let streak = 1;
  for (let index = days.length - 1; index > 0; index -= 1) {
    const current = new Date(`${days[index]}T00:00:00Z`);
    const previous = new Date(`${days[index - 1]}T00:00:00Z`);
    if (current.getTime() - previous.getTime() !== 86_400_000) break;
    streak += 1;
  }
  return streak;
}

function timestampDay(value) {
  const millis = timestampMillis(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString().slice(0, 10) : null;
}

function timestampMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (value?._seconds != null) return value._seconds * 1_000;
  if (value?.seconds != null) return value.seconds * 1_000;
  return Number.NaN;
}

function clampNumber(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(Math.max(Math.round(number), minimum), maximum);
}

function stringValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}
