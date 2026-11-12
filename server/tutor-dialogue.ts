import { solverStageForPhase, type MathResponse, type ReasoningPhase, type ResponseOutcome } from "../packages/contracts/src/index";
import type { Turn } from "./gemini";

// Recognize standalone help requests. A reply that also contains mathematical work
// goes through ordinary assessment, even if it asks for confirmation or help.
export function asksForHint(plainText: string, latex?: string) {
  if (latex?.trim()) return false;
  const words = plainText.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:(?:i dont know|im stuck|i am stuck)(?:\s+|$))?(?:(?:please )?(?:help(?: me)?|can you help(?: me)?|(?:can i (?:have|get)|i need|give me) (?:a |another )?hint|hint)(?: please)?)?$/.test(words) && !!words;
}

export function responseOutcome(turn: Turn): ResponseOutcome {
  if (turn.accepted) return "correct_complete";
  if (turn.confidence !== "high" || !turn.evidence.some(e => e.trim()) || ["unsupported_response", "unrecognized_alternative"].includes(turn.category)) return "unclear";
  if (["none", "weak_justification", "skipped_reasoning"].includes(turn.category)) {
    return turn.outcome === "unclear" ? "unclear" : "correct_incomplete";
  }
  return "incorrect";
}

// Only recognize whole, unambiguous statements about a verified operation.
// Qualifiers, further claims, mathematical notation, and other paraphrases go to
// the ordinary assessment, where the tutor can consider them in context.
export function verifiedConceptTurn(operation: string | undefined, phase: ReasoningPhase, response: MathResponse): Turn | undefined {
  if (response.latex?.trim()) return;
  const statement = response.plainText.toLowerCase().trim().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  const evidence = [response.plainText.trim()];
  const base = {confidence:"high", evidence, intent:"answer", leaksSolution:false} as const;
  const stage = solverStageForPhase(phase);
  if (operation === "union" && stage === "problem_understanding") {
    const goal = /^(?:as i said[, ]+)?(?:(?:i|we) (?:need|have|want) to |(?:the )?goal is to )?(?:find|get|determine) (?:the )?union of (?:the (?:numbers|elements|values) (?:inside|in|within) (?:the |these |both )?(?:curly )?(?:braces?|brackets?)|(?:the |these |both )?(?:two |given )*sets)$/;
    if (goal.test(statement)) return {...base, accepted:true, outcome:"correct_complete", category:"none", questionStage:"method_selection",
      feedback:"You identified the union as the goal and the sets inside the braces as the givens.",
      question:"How will you handle a value that appears in both sets when forming the union?"};
  }
  if (operation === "population variance" && stage === "method_selection") {
    const spreadOnly = /^(?:because )?(?:(?:we (?:need|want) to|to) measure|(?:it|variance) measures) (?:the )?(?:spread|variability|dispersion) (?:of|in) (?:the |these )?(?:data|values|observations)$/;
    if (spreadOnly.test(statement)) return {...base, accepted:false, outcome:"correct_incomplete", category:"none", questionStage:stage, missingCriterion:"formula_theorem_justification",
      feedback:"You identified what variance measures: the spread of the data.",
      question:"Do the observations cover every member of the group being studied or only a sample?"};
    const sizeRule = /^(?:because )?(?:(?:it|population variance|the population variance formula) is used (?:when|if) )?(?:there are|we (?:only )?have|the (?:data ?set|group) (?:only )?has) (?:only |just )?(?:a few|very few|few) (?:numbers|values|observations|members)$/;
    if (sizeRule.test(statement)) return {...base, accepted:false, outcome:"incorrect", category:"conceptual_error", questionStage:stage, missingCriterion:"formula_theorem_justification",
      incorrectStep:evidence[0], explanation:"Group size does not determine whether the data represent a population or a sample.",
      feedback:"Both a population and a sample can contain just a few values.",
      question:"Does the data set cover everyone in the group being studied or only some members?",
      recommendedAction:"Identify who was observed and compare that with the group being studied."};
  }
}

// Each row moves from a single question to a concrete, unfinished task.
const questions: Record<ReasoningPhase, readonly string[]> = {
  problem_understanding: ["What is the problem asking you to find?", "Which word in the problem names the goal?", "Are you looking for a value, a collection, or a statement to prove?", "How would you finish “I need to find ___” for this problem?"],
  relevant_information_identification: ["Which information has the problem given you?", "Which one of the stated facts will you use?", "Which part is already known and which part is the unknown?", "How would you finish “One given I can use is ___”?"],
  method_selection: ["Which method would you try?", "What feature of the givens suggests a method?", "Which operation or rule would connect one given to the goal?", "How would you finish “I would use ___ because ___”?"],
  formula_theorem_justification: ["What condition makes your rule applicable?", "Which given supports one condition of your rule?", "Would your rule still work if that condition were missing?", "How would you finish “This rule needs ___, and the problem tells me ___”?"],
  guided_computation_or_proof: ["What is the first step you can write down?", "Which given belongs in the next step?", "Which single operation or inference can you carry out now?", "What goes in the first blank if you write your next step as “___ gives ___”?"],
  verification_and_checking: ["How could you check one step?", "Which step can you check independently?", "What would happen if you reversed the last step or tried a small case?", "What do you get when you check just that one step?"],
  result_interpretation: ["What does your result describe?", "Looking at your result, what could you say about what it represents?", "What would you tell someone who asked what this result means here?", "How would you finish “For the group or objects in this problem, my result means ___”?"],
};
const unionGoalQuestions = ["Which two collections does the problem give you?", "Does the word union ask for a single number or a set?", "Point to one pair of braces. What does it enclose?", "How would you finish “The two sets are given, and I need to find ___”?"];
const unionMethodQuestions = ["How will you handle a value that appears in both sets?", "Does a value have to occur in both sets to belong to their union?", "Pick a value in either set. What does the union rule tell you about that value?", "Start with one set. For one value in the other set, how will you decide whether to add it?"];
const varianceQuestions = ["Who is the group being studied?", "Do the data cover every member of that group or only some members?", "Which matters for this choice: the number of observations or who was observed?", "How would you finish “These observations cover ___, so I would use ___ variance”?"];
const levels = ["socratic_prompt", "targeted_hint", "stronger_hint", "partial_step"];

export function stageHint(phase: ReasoningPhase, level: string, reference: any, previousPrompt: string) {
  const step = Math.max(0, levels.indexOf(level));
  const stage = solverStageForPhase(phase);
  const union = reference.requiredFormula === "union" && ["problem_understanding", "method_selection"].includes(stage);
  const variance = reference.requiredFormula === "population variance" && stage === "method_selection";
  let prompts = questions[phase];
  if (union) prompts = stage === "method_selection" ? unionMethodQuestions : unionGoalQuestions;
  if (variance) prompts = varianceQuestions;
  const reviewed = !union && !variance && step === 0 && reference.socraticPrompts?.[phase];
  let question = reviewed || prompts[step];
  if (sameQuestion(question, previousPrompt)) {
    question = step === 3 ? "Which part would you like to work through together first?" : prompts[step + 1];
  }
  const feedback = step >= 2 && union ? "A union includes values that belong to either set."
    : step >= 2 && variance ? "Population variance describes a whole group. Sample variance uses a subset to estimate the group's variance."
    : step >= 2 ? "Try just one part of this step." : "Let's focus on one detail.";
  return {feedback, question};
}

export function sameQuestion(left: string, right: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const a = normalize(left), b = normalize(right);
  if (a === b) return true;
  const [shorter,longer] = a.length < b.length ? [a,b] : [b,a];
  return shorter.split(" ").length >= 6 && longer.startsWith(shorter + " ");
}
