import type { MindGuideProblem } from "../src/types/index.ts";

export const FORBIDDEN_PUBLIC_KEYS = new Set([
  "finalAnswer",
  "solutionSteps",
  "referenceAnswer",
  "solutionOutline",
  "privateSolution",
  "socraticPrompts",
  "rubric",
  "rawOutput",
  "apiKey",
]);

export function buildPrivateProblem(problem: MindGuideProblem) {
  return {
    expectedConcepts: problem.expectedConcepts,
    requiredFormula: problem.requiredFormula ?? null,
    requiredTheorem: problem.requiredTheorem ?? null,
    solutionSteps: problem.solutionSteps,
    finalAnswer: problem.finalAnswer,
    interpretation: problem.interpretation,
    socraticPrompts: {
      problem_understanding: problem.socraticPrompts.problem_understanding,
      relevant_information_identification: "Which given values, variables, sets, propositions, or conditions are relevant, and what is unknown?",
      method_selection: problem.socraticPrompts.method_selection,
      formula_theorem_justification: problem.socraticPrompts.formula_theorem_justification,
      guided_computation_or_proof: problem.socraticPrompts.guided_computation_or_reasoning,
      verification_and_checking: "How can you check the calculation, cases, or logical conclusion without assuming it is correct?",
      result_interpretation: "What does the verified result mean in the context of the original problem?",
    },
  };
}

export function buildPublicProblem(problem: MindGuideProblem) {
  return {
    subject: problem.subject,
    topic: problem.topic,
    difficulty: problem.difficulty,
    problemText: problem.problemText,
    supportedResponseFormats: ["text", "latex"],
    status: "approved",
    version: 1,
  };
}

export function shouldPreserveCurrentSession(session: Record<string, any>): boolean {
  return session.schemaVersion === 3 && Number(session.workflowVersion ?? 0) >= 3;
}

export function sanitizePublicProblemContext(context: Record<string, any> | undefined) {
  if (!context || context.mode === "curated") {
    return context ? { mode: "curated", problemId: context.problemId, promptSnapshot: context.promptSnapshot } : null;
  }
  const analysis = context.analysis ?? {};
  return {
    mode: "free_form",
    question: context.question,
    validation: {
      analysisVersion: analysis.analysisVersion ?? 1,
      validationStatus: analysis.validationStatus ?? "legacy_unverified",
      isSupported: analysis.isSupported ?? true,
      isSolvable: analysis.isSolvable ?? true,
      rejectionReason: analysis.rejectionReason ?? null,
      normalizedQuestion: analysis.normalizedQuestion ?? context.question,
      subject: analysis.subject,
      topic: analysis.topic,
    },
  };
}

export function findForbiddenPublicKeys(value: unknown, location = "document"): string[] {
  const failures: string[] = [];
  scan(value, location, failures);
  return failures;
}

function scan(value: unknown, location: string, failures: string[]): void {
  if (Array.isArray(value)) return value.forEach((entry, index) => scan(entry, `${location}[${index}]`, failures));
  if (!value || typeof value !== "object" || isTimestampLike(value)) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) failures.push(`${location}: forbidden public key '${key}'.`);
    scan(nested, `${location}.${key}`, failures);
  }
}

function isTimestampLike(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "seconds" in value && "nanoseconds" in value);
}
