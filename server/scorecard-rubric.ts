/** Four equal criteria; no assistance penalty. Score final demonstrated learner mastery. */
export const SCORECARD_RUBRIC = {
  accuracy: {
    phases:["guided_computation_or_proof","verification_and_checking"],
    strong:"21–25: Complete, correct computations or proof conclusion, checked against givens.",
    adequate:"16–20: Substantially correct work with a minor verification omission.",
    weak:"6–15: Partial correct work with unresolved computational errors.",
    incorrect:"0–5: Incorrect result or no usable mathematical evidence.",
  },
  logicalValidity: {
    phases:["guided_computation_or_proof","verification_and_checking"],
    strong:"21–25: Every material implication is supported; assumptions and verification are explicit.",
    adequate:"16–20: Sound argument with a minor unstated link.",
    weak:"6–15: Some valid steps but substantial gaps or unsupported implications.",
    incorrect:"0–5: Circular, contradictory or invalid argument; no usable chain of reasoning.",
  },
  methodSelection: {
    phases:["method_selection","formula_theorem_justification"],
    strong:"21–25: Appropriate method with conditions explicitly linked to the actual givens; valid alternatives receive equal credit.",
    adequate:"16–20: Appropriate method with a minor omission in applicability reasoning.",
    weak:"6–15: Relevant method named but conditions are weakly justified or partially mismatched.",
    incorrect:"0–5: Inapplicable method or no usable method evidence. Arithmetic mistakes alone do not lower this criterion.",
  },
  explanationQuality: {
    phases:["result_interpretation"],
    strong:"21–25: Clear learner explanation of the result in context, including relevant units, scope and limitations.",
    adequate:"16–20: Understandable contextual explanation with a minor omission.",
    weak:"6–15: Partial explanation with an unsupported or unclear interpretation.",
    incorrect:"0–5: No contextual interpretation or interpretation contradicts the problem.",
  },
} as const;
