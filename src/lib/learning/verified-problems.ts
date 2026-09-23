const contentHash = (value: unknown): string => JSON.stringify(value);
import type { PrivateProblemReference } from "./workflow.js";
import { REASONING_PHASES, type ReasoningPhase } from "@mindguide/contracts";
import { callableError } from "./errors.js";

export type VerifiedGivens = { operation: "mean" | "median" | "mode"; values: number[] } | { operation: "product" | "permutation" | "combination"; values: number[] };
function parseVerifiedProblem(question: string, topic: string): VerifiedGivens {
  // A deliberately bounded grammar avoids pretending to understand arbitrary prose.
  const match = /^(?:(?:what\s+is|find|calculate|compute)\s+(?:the\s+)?)?(mean|median|mode|product|permutation|combination)(?:\s*:\s*|\s+(?:of|for)\s+)(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+)\s*[?.]?\s*$/i.exec(question.trim());
  if (!match) throw callableError("invalid-argument", "unsupported_problem", "Use a verified format: mean: 4, 8, 12; median: 2, 7, 9; mode: 2, 2, 5; product: 3, 4; permutation: 5, 2; combination: 5, 2.");
  const operation = match[1].toLowerCase() as VerifiedGivens["operation"];
  const values = match[2].split(",").map(Number);
  const central = ["mean", "median", "mode"].includes(operation);
  if ((central ? "Measures of Central Tendency" : "Counting Principles") !== topic || values.length > 50 || values.some(value => !Number.isFinite(value) || Math.abs(value) > 1_000_000)) throw callableError("invalid-argument", "unsupported_problem", "The operation must match the enabled topic and contain at most 50 bounded values.");
  if (!central && (values.some(value => !Number.isInteger(value) || value < 0 || value > 100) || (operation !== "product" && (values.length !== 2 || values[1] > values[0])))) throw callableError("invalid-argument", "invalid_counting_inputs", "Counting requires integers from 0 to 100; permutation and combination require n, r with r ≤ n.");
  return { operation, values } as VerifiedGivens;
}

function safePilotHints(operation: string): NonNullable<PrivateProblemReference["safeHints"]> {
  const prompts: Record<ReasoningPhase, string> = {
    problem_understanding: "What quantity does the question ask you to determine?",
    relevant_information_identification: "List the given values and distinguish them from the unknown.",
    method_selection: "Which operation fits the requested quantity?",
    formula_theorem_justification: "State the conditions that make your selected method applicable.",
    guided_computation_or_proof: "Write the next operation using the given quantities, then compute it yourself.",
    verification_and_checking: "Use an independent calculation or a small enumerated example to check your work.",
    result_interpretation: "Explain what the result represents in this question, including units where applicable.",
  };
  return Object.fromEntries(REASONING_PHASES.map(phase => [phase, {
    socratic_prompt: [prompts[phase]], targeted_hint: [`Focus on the meaning of ${operation}. ${prompts[phase]}`],
    stronger_hint: ["Separate the setup from the calculation. Explain the relevant assumption before using the values."],
    partial_step: ["Write an incomplete setup with a blank for the next result. Fill that blank yourself and justify the operation."],
  }])) as NonNullable<PrivateProblemReference["safeHints"]>;
}

export function solveVerifiedProblem(givens: VerifiedGivens): PrivateProblemReference {
  const { operation, values } = givens;
  let result: number | number[];
  let setup: string;
  if (operation === "mean") { result = values.reduce((a,b) => a+b,0) / values.length; setup = `Add ${values.join(" + ")} and divide by ${values.length}.`; }
  else if (operation === "median") { const sorted = [...values].sort((a,b) => a-b); result = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2; setup = `Sort the values: ${sorted.join(", ")}. Select the middle value or average the middle pair.`; }
  else if (operation === "mode") { const counts = new Map<number, number>(); values.forEach(v => counts.set(v,(counts.get(v)??0)+1)); const max = Math.max(...counts.values()); result = max === 1 ? [] : [...counts].filter(([,count])=>count===max).map(([v])=>v).sort((a,b)=>a-b); setup = "Tally occurrences of each input value. Report the most frequent values; when every count is one, report no mode."; }
  else if (operation === "product") { result = values.reduce((a,b)=>a*b,1); setup = `Multiply the independent stage counts: ${values.join(" × ")}.`; }
  else { const [n,r] = values; let count = 1; for(let i=1;i<=r;i++) count = operation === "permutation" ? count*(n-i+1) : count*(n-i+1)/i; result = Math.round(count); setup = operation === "permutation" ? `Ordered selection without replacement: P(${n}, ${r}).` : `Unordered selection without replacement: C(${n}, ${r}).`; }
  if (typeof result === "number" && (!Number.isFinite(result) || (operation !== "mean" && operation !== "median" && !Number.isSafeInteger(result)))) throw callableError("invalid-argument", "result_out_of_range", "Use smaller counting inputs so the result can be verified exactly.");
  const safeHints = safePilotHints(operation);
  const answer = Array.isArray(result) ? `{${result.join(", ")}}` : String(result);
  return { expectedConcepts: [operation], requiredFormula: operation, solutionSteps: [setup, `The ${operation} is ${answer}.`], finalAnswer: answer,
    answerSpecification: Array.isArray(result) ? { kind: "set", values: result } : { kind: "number", value: result, tolerance: operation === "mean" ? 0.000001 : 0 },
    interpretation: `This result represents the requested ${operation} for the confirmed givens.`, safeHints,
    socraticPrompts: Object.fromEntries(REASONING_PHASES.map(phase => [phase, safeHints[phase]!.socratic_prompt![0]])), rubricVersion: "pilot-v5-draft" };
}
export function verifiedConfirmation(question: string, topic: string) {
  const givens = parseVerifiedProblem(question, topic);
  solveVerifiedProblem(givens); // reject unsafe results, but never return them in the preview
  return { givens, confirmationHash: contentHash({ question: question.trim(), topic, givens }), description: `${givens.operation}: ${givens.values.join(", ")}` };
}
