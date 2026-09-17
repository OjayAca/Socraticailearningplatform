import { solveVerifiedProblem, type VerifiedGivens } from "../functions/src/verified-problems.ts";
import type { SchemaV4ProblemSeed } from "./problem-bank-v4-core.ts";

export const PILOT_TOPIC_IDS = ["quantitative-methods-measures-of-central-tendency", "discrete-mathematics-counting-principles"];

/** All records are drafts. This generator never creates faculty approval evidence. */
export function buildPilotProblemSeeds(): SchemaV4ProblemSeed[] {
  const cases: Array<{ difficulty: "Basic" | "Intermediate" | "Advanced"; givens: VerifiedGivens; question: string }> = [
    { difficulty: "Basic", givens: { operation: "mean", values: [4,8,12] }, question: "Three books have 4, 8, and 12 chapters. Find the mean number of chapters." },
    { difficulty: "Basic", givens: { operation: "median", values: [9,3,7,1,5] }, question: "Five waiting times in minutes are 9, 3, 7, 1, and 5. Find the median." },
    { difficulty: "Basic", givens: { operation: "mode", values: [2,4,4,5,6] }, question: "The numbers of visits are 2, 4, 4, 5, and 6. Give the set of modes." },
    { difficulty: "Intermediate", givens: { operation: "mean", values: [12,18,25,29] }, question: "Four daily sales counts are 12, 18, 25, and 29. Find the arithmetic mean." },
    { difficulty: "Intermediate", givens: { operation: "median", values: [18,7,22,10,15,12] }, question: "The delivery times are 18, 7, 22, 10, 15, and 12 minutes. Find the median." },
    { difficulty: "Intermediate", givens: { operation: "mode", values: [3,3,5,5,7,9] }, question: "The survey responses are 3, 3, 5, 5, 7, and 9. Report every mode as a set." },
    { difficulty: "Advanced", givens: { operation: "mean", values: [-4,2,8,14,30] }, question: "Net daily changes are -4, 2, 8, 14, and 30 units. Find their arithmetic mean and explain the effect of the negative observation." },
    { difficulty: "Advanced", givens: { operation: "median", values: [2.5,7.5,4.5,100,5.5,3.5] }, question: "Measured times are 2.5, 7.5, 4.5, 100, 5.5, and 3.5 seconds. Find the median and explain why the large value does not determine it." },
    { difficulty: "Advanced", givens: { operation: "mode", values: [1,2,3,4,5,6] }, question: "Observed categories have codes 1, 2, 3, 4, 5, and 6, each appearing once. Under the convention that all-unique data have no mode, give the set of modes and justify it." },
    { difficulty: "Basic", givens: { operation: "product", values: [3,4] }, question: "A meal uses one of 3 mains and one of 4 drinks. Every pair is allowed. How many meals can be made?" },
    { difficulty: "Basic", givens: { operation: "product", values: [2,5] }, question: "A uniform uses one of 2 shirts and one of 5 trousers. Every pair is allowed. How many uniforms are possible?" },
    { difficulty: "Basic", givens: { operation: "product", values: [4,6] }, question: "Choose one of 4 notebook covers and one of 6 paper styles independently. How many combinations are possible?" },
    { difficulty: "Intermediate", givens: { operation: "permutation", values: [5,2] }, question: "Five students are eligible. Choose a president and a secretary; nobody may hold both roles. How many assignments are possible?" },
    { difficulty: "Intermediate", givens: { operation: "combination", values: [6,2] }, question: "Choose an unordered pair of representatives from six distinct students. How many pairs are possible?" },
    { difficulty: "Intermediate", givens: { operation: "product", values: [2,3,4] }, question: "A route uses one of 2 buses, one of 3 ferries, and one of 4 trains. All stage combinations are possible. Count the routes." },
    { difficulty: "Advanced", givens: { operation: "permutation", values: [8,3] }, question: "Eight finalists compete for distinct gold, silver, and bronze awards. There are no ties and each finalist receives at most one award. Count the outcomes and justify whether order matters." },
    { difficulty: "Advanced", givens: { operation: "combination", values: [9,4] }, question: "Choose a committee of four from nine distinct volunteers. There are no roles or restrictions. Count the committees and explain why rearranging members creates no new committee." },
    { difficulty: "Advanced", givens: { operation: "product", values: [5,4,3,2] }, question: "Create a four-symbol code from five distinct symbols without repetition. Count the codes by successive choices and explain why the number of available symbols changes." },
  ];
  return cases.map((item, index) => {
    const central = index < 9;
    const id = `pilot-v5-${central ? "central" : "counting"}-${String(index % 9 + 1).padStart(2, "0")}`;
    const reference = solveVerifiedProblem(item.givens);
    return { id, sourceProblemId: id, subjectId: central ? "quantitative-methods" : "discrete-mathematics", topicId: PILOT_TOPIC_IDS[central ? 0 : 1],
      subject: central ? "Quantitative Methods" : "Discrete Mathematics", topic: central ? "Measures of Central Tendency" : "Counting Principles",
      difficulty: item.difficulty, variant: (index % 3 + 1) as 1|2|3, problemText: item.question, formulaTheoremReferenceIds: [`pilot-ref-${item.givens.operation}`],
      status: "draft", privateSolution: { ...reference, verifiedGivens: item.givens }, prompts: reference.socraticPrompts as Record<string,string> };
  });
}
