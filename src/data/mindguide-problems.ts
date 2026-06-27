import type { MindGuideProblem } from "../types";

export const mindGuideProblems: MindGuideProblem[] = [
  {
    id: "qm-var-001",
    subject: "Quantitative Methods",
    topic: "Variance and Standard Deviation",
    difficulty: "Basic",
    problemText:
      "The scores of five students are 6, 8, 10, 12, and 14. Find the variance.",
    expectedConcepts: ["mean", "deviation", "variance"],
    requiredFormula: "variance = sum((x - mean)^2) / n",
    socraticPrompts: {
      problem_understanding: "What values are given in the problem?",
      method_selection: "What measure of variability is being asked?",
      formula_theorem_justification: "Why is the variance formula appropriate for this problem?",
      guided_computation_or_reasoning: "What is the mean of the given scores?",
      error_diagnosis: "Which step is most likely to cause an error: finding the mean, squaring deviations, or dividing by n?",
      progressive_unlock: "Use the mean to list each deviation from 10. What squared deviations do you get?",
      scorecard: "Before writing the final answer, how confident are you in your method and what evidence supports it?",
    },
    solutionSteps: [
      "Find the mean: (6 + 8 + 10 + 12 + 14) / 5 = 10.",
      "Find deviations from the mean: -4, -2, 0, 2, 4.",
      "Square the deviations: 16, 4, 0, 4, 16.",
      "Add squared deviations: 16 + 4 + 0 + 4 + 16 = 40.",
      "Divide by n: 40 / 5 = 8.",
    ],
    finalAnswer: "The variance is 8.",
    interpretation:
      "The scores have an average squared deviation of 8 from the mean.",
  },
  {
    id: "qm-prob-001",
    subject: "Quantitative Methods",
    topic: "Probability",
    difficulty: "Intermediate",
    problemText:
      "A box contains 5 red balls, 3 blue balls, and 2 green balls. If one ball is selected at random, what is the probability that it is red OR green?",
    expectedConcepts: ["sample space", "favorable outcomes", "OR probability"],
    requiredFormula: "P(A OR B) = P(A) + P(B) when A and B cannot happen together",
    socraticPrompts: {
      problem_understanding: "How many balls are in the box altogether?",
      method_selection: "Which outcomes count as favorable for red OR green?",
      formula_theorem_justification:
        "Why can the probabilities of selecting red and green be added directly?",
      guided_computation_or_reasoning: "How many favorable outcomes are there out of all possible outcomes?",
      error_diagnosis: "What mistake might happen if someone includes the blue balls as favorable outcomes?",
      progressive_unlock:
        "Now write the favorable outcomes over the total outcomes. What fraction represents the probability?",
      scorecard:
        "What does the probability mean in the context of one random selection?",
    },
    solutionSteps: [
      "Find the total number of balls: 5 + 3 + 2 = 10.",
      "Identify favorable outcomes: red balls and green balls.",
      "Add favorable outcomes: 5 + 2 = 7.",
      "Write the probability: 7 / 10.",
      "Convert if needed: 7 / 10 = 0.70 = 70%.",
    ],
    finalAnswer: "The probability of selecting a red OR green ball is 7 / 10.",
    interpretation:
      "There is a 70% chance that one randomly selected ball will be either red or green.",
  },
  {
    id: "dm-logic-001",
    subject: "Discrete Mathematics",
    topic: "Logic and Propositions",
    difficulty: "Basic",
    problemText:
      "Let p be true and q be false. Determine the truth value of (p -> q) OR NOT q.",
    expectedConcepts: ["proposition", "implication", "negation", "OR"],
    requiredTheorem:
      "An implication p -> q is false only when p is true and q is false.",
    socraticPrompts: {
      problem_understanding: "What are the given truth values of p and q?",
      method_selection: "Which logical operations must be evaluated first?",
      formula_theorem_justification: "How do you decide the truth value of p -> q?",
      guided_computation_or_reasoning: "What is the truth value of NOT q?",
      error_diagnosis: "Where could a truth-value mistake happen when evaluating the implication or the negation?",
      progressive_unlock:
        "Combine the truth values for p -> q and NOT q using OR. What does OR require to be true?",
      scorecard:
        "What does the final truth value say about the whole compound statement?",
    },
    solutionSteps: [
      "Use the given values: p is true and q is false.",
      "Evaluate p -> q: true -> false is false.",
      "Evaluate NOT q: NOT false is true.",
      "Evaluate (p -> q) OR NOT q: false OR true is true.",
    ],
    finalAnswer: "The compound proposition is true.",
    interpretation:
      "Even though p -> q is false, the entire statement is true because NOT q is true and OR needs at least one true part.",
  },
  {
    id: "dm-count-001",
    subject: "Discrete Mathematics",
    topic: "Counting Principles",
    difficulty: "Intermediate",
    problemText:
      "A student council will choose 1 president, 1 vice president, and 1 secretary from 6 students. No student can hold more than one position. How many different officer arrangements are possible?",
    expectedConcepts: ["multiplication principle", "ordered selection", "permutation"],
    requiredTheorem:
      "Multiplication Principle: if one task has a choices and another has b choices, then both tasks have a * b possible outcomes.",
    socraticPrompts: {
      problem_understanding: "How many positions must be filled, and how many students are available?",
      method_selection:
        "Does the order of selection matter when the positions are different?",
      formula_theorem_justification:
        "Why should the number of choices decrease after each position is filled?",
      guided_computation_or_reasoning:
        "How many choices are available for president, then vice president, then secretary?",
      error_diagnosis: "What would go wrong if you used 6 choices for all three positions?",
      progressive_unlock:
        "Multiply the choices for the three distinct positions. What product do you get?",
      scorecard:
        "What does each arrangement represent in the context of the student council?",
    },
    solutionSteps: [
      "There are 6 choices for president.",
      "After choosing a president, there are 5 choices left for vice president.",
      "After choosing those two officers, there are 4 choices left for secretary.",
      "Multiply the choices: 6 * 5 * 4 = 120.",
    ],
    finalAnswer: "There are 120 different officer arrangements.",
    interpretation:
      "Because the positions are distinct, changing who holds each position creates a different arrangement.",
  },
];

export default mindGuideProblems;
