import type {
  ChatMessage,
  MindGuidePhase,
  MindGuideProblem,
  Session,
  UnlockLevel,
  UnlockedSupport,
  UnlockedSupportItem,
} from "@/types";

const REQUIRED_REASONING_PHASES: MindGuidePhase[] = [
  "problem_understanding",
  "method_selection",
  "formula_theorem_justification",
  "guided_computation_or_reasoning",
];

const UNLOCK_LEVEL_TITLES: Record<Exclude<UnlockLevel, 0>, string> = {
  1: "General Hint",
  2: "Formula/Theorem Reminder",
  3: "First Solution Step",
  4: "Guided Computation/Reasoning Step",
  5: "Full Solution and Interpretation",
};

const GENERAL_HINTS_BY_TOPIC: Partial<Record<MindGuideProblem["topic"], string>> = {
  "Measures of Central Tendency":
    "Focus on what representative value the problem is asking you to find.",
  "Variance and Standard Deviation":
    "Start by identifying the center of the data, then compare each value to it.",
  "Data Interpretation":
    "Look for the quantity the question asks you to interpret, not just the largest number.",
  Probability:
    "Separate all possible outcomes from the outcomes that satisfy the condition.",
  "Correlation and Basic Regression":
    "Identify the relationship being measured before choosing a calculation.",
  "Logic and Propositions":
    "Evaluate each smaller logical statement before combining the whole expression.",
  "Truth Tables":
    "Work one column at a time and keep each truth value aligned with the row.",
  "Counting Principles":
    "Ask whether choices happen in sequence and whether order creates a different outcome.",
  "Permutations and Combinations":
    "Decide first whether order matters, then choose the matching counting method.",
  "Pigeonhole Principle":
    "Compare how many objects must be placed with how many categories are available.",
  "Basic Proof Reasoning":
    "Find the statement that must be justified, then connect it to a known rule or definition.",
};

export function getUnlockedSupport(
  problem: MindGuideProblem,
  unlockLevel: UnlockLevel
): UnlockedSupport {
  const clampedLevel = clampUnlockLevel(unlockLevel);
  const items: UnlockedSupportItem[] = [];

  for (let level = 1; level <= clampedLevel; level += 1) {
    items.push(getSupportItem(problem, level as Exclude<UnlockLevel, 0>));
  }

  return {
    unlockLevel: clampedLevel,
    items,
  };
}

export function canUnlockNextSupport(session: Session): {
  canUnlock: boolean;
  nextLevel: UnlockLevel;
  reason: string;
} {
  if (!session.selectedProblem) {
    return {
      canUnlock: false,
      nextLevel: session.unlockLevel,
      reason: "Choose a prepared MINDGUIDE problem before unlocking support.",
    };
  }

  if (session.unlockLevel >= 5) {
    return {
      canUnlock: false,
      nextLevel: 5,
      reason: "All support levels are already unlocked.",
    };
  }

  const nextLevel = (session.unlockLevel + 1) as UnlockLevel;
  const attemptedPhases = getAttemptedReasoningPhases(session.messages);
  const latestAttemptedPhase = getLatestAttemptedPhase(session.messages);
  const phaseGate = getRequiredPhaseForUnlockLevel(nextLevel);

  if (phaseGate && !attemptedPhases.includes(phaseGate)) {
    return {
      canUnlock: false,
      nextLevel,
      reason: "Submit a response for the current reasoning phase before unlocking more support.",
    };
  }

  if (
    nextLevel === 5 &&
    !REQUIRED_REASONING_PHASES.every((phase) => attemptedPhases.includes(phase))
  ) {
    return {
      canUnlock: false,
      nextLevel,
      reason:
        "The full solution unlocks after problem understanding, method selection, justification, and guided reasoning are attempted.",
    };
  }

  if (
    nextLevel > 2 &&
    session.diagnosisResult?.phase === "formula_theorem_justification" &&
    session.diagnosisResult.errorType === "weak_justification"
  ) {
    return {
      canUnlock: false,
      nextLevel,
      reason: "Strengthen the formula/theorem justification before unlocking beyond Level 2.",
    };
  }

  if (!latestAttemptedPhase) {
    return {
      canUnlock: false,
      nextLevel,
      reason: "Submit a response before unlocking support.",
    };
  }

  return {
    canUnlock: true,
    nextLevel,
    reason: "",
  };
}

export function getAttemptedReasoningPhases(
  messages: ChatMessage[]
): MindGuidePhase[] {
  const attempted = messages
    .filter((message) => message.role === "student")
    .map((message) => message.metadata)
    .filter((metadata) => metadata?.messageType === "phase_response")
    .map((metadata) => metadata?.phase)
    .filter(isMindGuidePhase);

  return Array.from(new Set(attempted));
}

function getSupportItem(
  problem: MindGuideProblem,
  level: Exclude<UnlockLevel, 0>
): UnlockedSupportItem {
  if (level === 1) {
    return {
      level,
      title: UNLOCK_LEVEL_TITLES[level],
      content: [
        GENERAL_HINTS_BY_TOPIC[problem.topic] ??
          "Identify what the problem is asking and which information is given.",
      ],
    };
  }

  if (level === 2) {
    return {
      level,
      title: UNLOCK_LEVEL_TITLES[level],
      content: [
        problem.requiredFormula ??
          problem.requiredTheorem ??
          `Expected concepts: ${problem.expectedConcepts.join(", ")}`,
      ],
    };
  }

  if (level === 3) {
    return {
      level,
      title: UNLOCK_LEVEL_TITLES[level],
      content: [problem.solutionSteps[0] ?? problem.socraticPrompts.method_selection],
    };
  }

  if (level === 4) {
    return {
      level,
      title: UNLOCK_LEVEL_TITLES[level],
      content: [
        problem.solutionSteps[1] ??
          problem.socraticPrompts.guided_computation_or_reasoning,
      ],
    };
  }

  return {
    level,
    title: UNLOCK_LEVEL_TITLES[level],
    content: [
      ...problem.solutionSteps,
      `Final answer: ${problem.finalAnswer}`,
      `Interpretation: ${problem.interpretation}`,
    ],
  };
}

function getRequiredPhaseForUnlockLevel(
  unlockLevel: UnlockLevel
): MindGuidePhase | null {
  const gates: Partial<Record<UnlockLevel, MindGuidePhase>> = {
    1: "problem_understanding",
    2: "method_selection",
    3: "formula_theorem_justification",
    4: "guided_computation_or_reasoning",
    5: "guided_computation_or_reasoning",
  };

  return gates[unlockLevel] ?? null;
}

function getLatestAttemptedPhase(messages: ChatMessage[]): MindGuidePhase | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = messages[index].metadata;
    if (
      messages[index].role === "student" &&
      metadata?.messageType === "phase_response" &&
      isMindGuidePhase(metadata.phase)
    ) {
      return metadata.phase;
    }
  }

  return null;
}

function isMindGuidePhase(value: unknown): value is MindGuidePhase {
  return (
    value === "problem_understanding" ||
    value === "method_selection" ||
    value === "formula_theorem_justification" ||
    value === "guided_computation_or_reasoning" ||
    value === "error_diagnosis" ||
    value === "progressive_unlock" ||
    value === "scorecard"
  );
}

function clampUnlockLevel(unlockLevel: UnlockLevel): UnlockLevel {
  return Math.min(Math.max(unlockLevel, 0), 5) as UnlockLevel;
}
