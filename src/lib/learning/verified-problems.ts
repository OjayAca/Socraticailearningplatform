import type { PrivateProblemReference } from './workflow.js';
import { REASONING_PHASES, type ReasoningPhase } from '@mindguide/contracts';
import { parseVerifiedProblem, type VerifiedGivens } from './custom-problem-grammar';
import { bounded, evaluateFunction, evaluateLogic, invalid } from './custom-problem-parser';
export { ProblemInputError } from './custom-problem-parser';
export type { VerifiedGivens } from './custom-problem-grammar';
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
  let result: number | number[] | boolean;
  let setup = `Apply ${operation} to the confirmed inputs.`;
  if (operation === 'function evaluation') { result = evaluateFunction(givens.expression!, values[0]); setup = `Substitute ${values[0]} for x in ${givens.expression}, respecting operation order.`; }
  else if (operation === 'logic') { result = evaluateLogic(givens.expression!, givens.assignments!); setup = 'Substitute assignments; evaluate parentheses, NOT, AND, then OR.'; }
  else if (['union', 'intersection', 'difference'].includes(operation)) {
    const right = new Set(givens.right);
    result = [...new Set(operation === 'union' ? [...values, ...right] : values.filter(v => operation === 'intersection' ? right.has(v) : !right.has(v)))].sort((a,b)=>a-b);
    setup = 'Compare membership; remove duplicates and preserve operand order for difference.';
  }
  else if (operation === 'mean') result = values.reduce((a,b)=>a+b,0)/values.length;
  else if (operation === 'range') result = Math.max(...values)-Math.min(...values);
  else if (operation.includes('variance') || operation.includes('standard deviation')) {
    const mean = values.reduce((a,b)=>a+b,0)/values.length;
    const variance = values.reduce((sum,v)=>sum+(v-mean)**2,0)/(values.length-(operation.startsWith('sample') ? 1 : 0));
    result = operation.includes('standard deviation') ? Math.sqrt(variance) : variance;
    setup = `Find the mean, sum squared deviations, and divide by ${operation.startsWith('sample') ? 'n - 1' : 'n'}.${operation.includes('standard deviation') ? ' Take the square root.' : ''}`;
  }
  else if (operation === 'median') { const sorted = [...values].sort((a,b)=>a-b); result = sorted.length % 2 ? sorted[Math.floor(sorted.length/2)] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2; }
  else if (operation === 'mode') { const counts = new Map<number,number>(); values.forEach(v=>counts.set(v,(counts.get(v)??0)+1)); const max = Math.max(...counts.values()); result = max === 1 ? [] : [...counts].filter(([,n])=>n===max).map(([v])=>v).sort((a,b)=>a-b); }
  else if (operation === 'probability') result = values[0]/values[1];
  else if (operation === 'product') result = values.reduce((a,b)=>bounded(a*b, Number.MAX_SAFE_INTEGER),1);
  else if (operation === 'permutation' || operation === 'combination') {
    const [n,r] = values; let count = 1n;
    for (let i=1;i<=r;i++) count = operation === 'permutation' ? count*BigInt(n-i+1) : count*BigInt(n-i+1)/BigInt(i);
    result = Number(count);
  } else invalid('Unsupported operation.');
  const counting = ['product','permutation','combination'].includes(operation);
  if (typeof result === 'number') { bounded(result, counting ? Number.MAX_SAFE_INTEGER : 1e12); if (counting && !Number.isSafeInteger(result)) invalid('Use smaller counting inputs for an exact result.'); }
  const answer = Array.isArray(result) ? `{${result.join(', ')}}` : String(result);
  const safeHints = safePilotHints(operation);
  return { expectedConcepts: [operation], requiredFormula: operation, solutionSteps: [setup, `The ${operation} is ${answer}.`], finalAnswer: answer,
    answerSpecification: typeof result === 'boolean' ? { kind: 'truth', value: result } : Array.isArray(result) ? { kind: 'set', values: result } : { kind: 'number', value: result, tolerance: counting ? 0 : 0.000001 },
    interpretation: `This result represents the requested ${operation} for the confirmed givens.`, safeHints,
    socraticPrompts: Object.fromEntries(REASONING_PHASES.map(phase => [phase, safeHints[phase]!.socratic_prompt![0]])), rubricVersion: 'pilot-v5-draft' };
}
export function verifiedConfirmation(question: string, topic: string, latex = '', difficulty = '') {
  if (typeof question !== 'string' || question.length > 2000 || typeof latex !== 'string' || latex.length > 2000) invalid('Problem text and notation must each be at most 2000 characters.');
  if (latex && question.split('[math]').length !== 2) invalid('Place [math] exactly once in your sentence where the optional notation belongs.');
  const combined = latex ? question.replace('[math]', () => latex) : question;
  const givens = parseVerifiedProblem(combined, topic);
  solveVerifiedProblem(givens);
  return { givens, confirmationHash: JSON.stringify({ question: question.trim(), topic, latex, difficulty, givens }), description: `${givens.operation}: ${givens.expression ?? givens.values.join(', ')}` };
}
