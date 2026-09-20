/** Explicit publication allowlist: never copy an entire private solution document. */
const scoringFields = ["answerSpecification", "safeHints", "expectedConcepts", "requiredFormula", "requiredTheorem", "solutionSteps", "finalAnswer", "interpretation", "formulaTheoremConditions", "socraticPrompts", "misconceptionPrompts", "rubricVersion", "rubricCalibrationStatus"] as const;

export function scoringReference(solution: Record<string, any>, problem: Record<string, any>, validation: Record<string, any>): Record<string, unknown> {
  if (problem.status !== "approved" || !problem.validationRecordId || validation.decision !== "approved" || validation.problemId !== problem.id || validation.problemVersion !== problem.version) throw new Error("A matching recorded approval is required to publish scoring material.");
  if (!solution.answerSpecification || !Array.isArray(solution.expectedConcepts) || !Array.isArray(solution.solutionSteps) || typeof solution.finalAnswer !== "string" || typeof solution.interpretation !== "string") throw new Error("Validated scoring material is incomplete.");
  return {
    ...Object.fromEntries(scoringFields.filter(key => solution[key] !== undefined).map(key => [key, solution[key]])),
    problemId: problem.id, problemVersion: problem.version, validationRecordId: problem.validationRecordId,
  };
}
