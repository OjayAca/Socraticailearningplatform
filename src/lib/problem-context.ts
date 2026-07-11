import { mindGuideProblems } from "@/data/mindguide-problems";
import type {
  FreeFormProblemAnalysis,
  MindGuideProblem,
  SessionProblemContext,
} from "@/types";

export function createCuratedProblemContext(
  problem: MindGuideProblem
): SessionProblemContext {
  return {
    mode: "curated",
    problemId: problem.id,
    promptSnapshot: {
      subject: problem.subject,
      topic: problem.topic,
      difficulty: problem.difficulty,
      problemText: problem.problemText,
    },
  };
}

export function createFreeFormProblemContext(
  question: string,
  analysis: FreeFormProblemAnalysis
): SessionProblemContext {
  return {
    mode: "free_form",
    question,
    analysis,
  };
}

export function resolveProblemFromContext(
  context: SessionProblemContext | null | undefined
): MindGuideProblem | null {
  if (!context) return null;
  if (context.mode === "curated") {
    return (
      mindGuideProblems.find((problem) => problem.id === context.problemId) ?? null
    );
  }

  return buildProblemFromFreeFormAnalysis(context.analysis);
}

export function buildProblemFromFreeFormAnalysis(
  analysis: FreeFormProblemAnalysis
): MindGuideProblem {
  const conceptList = analysis.expectedConcepts.join(", ");
  const requiredArea =
    analysis.requiredFormula ?? analysis.requiredTheorem ?? "the most appropriate method";

  return {
    id: `free-form-${stableQuestionKey(analysis.normalizedQuestion)}`,
    subject: analysis.subject,
    topic: analysis.topic,
    difficulty: "Intermediate",
    problemText: analysis.normalizedQuestion,
    expectedConcepts: analysis.expectedConcepts,
    requiredFormula: analysis.requiredFormula ?? undefined,
    requiredTheorem: analysis.requiredTheorem ?? undefined,
    socraticPrompts: {
      problem_understanding:
        "Restate the problem in your own words. What information is given, and what must be found or proved?",
      method_selection: `Which method fits this problem, and which clue points you toward it? Relevant concepts include ${conceptList || "the selected topic"}.`,
      formula_theorem_justification: `Why is ${requiredArea} appropriate here? Connect it to a specific condition in the problem.`,
      guided_computation_or_reasoning:
        "Show the next calculation or logical step only, then explain why that step follows.",
      error_diagnosis:
        "Check your setup and most recent step. What mistake would be most likely here, and how can you rule it out?",
      progressive_unlock:
        "Use the reasoning developed so far to outline the remaining steps without jumping straight to the final result.",
      scorecard:
        "Summarize why your answer is accurate, logically valid, well justified, and meaningfully interpreted.",
    },
    solutionSteps: analysis.solutionOutline,
    finalAnswer: analysis.referenceAnswer,
    interpretation: analysis.interpretation,
  };
}

function stableQuestionKey(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
