import { SUBJECT_TOPICS, type MindGuideProblem } from "../types";

type PromptTuple = readonly [string, string, string, string, string, string, string];

function prompts(values: PromptTuple): MindGuideProblem["socraticPrompts"] {
  const [
    problem_understanding,
    method_selection,
    formula_theorem_justification,
    guided_computation_or_reasoning,
    error_diagnosis,
    progressive_unlock,
    scorecard,
  ] = values;

  return {
    problem_understanding,
    method_selection,
    formula_theorem_justification,
    guided_computation_or_reasoning,
    error_diagnosis,
    progressive_unlock,
    scorecard,
  };
}

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
  {
    id: "qm-central-001",
    subject: "Quantitative Methods",
    topic: "Measures of Central Tendency",
    difficulty: "Basic",
    problemText:
      "The daily study hours of five students are 2, 3, 3, 4, and 8. Find the mean, median, and mode.",
    expectedConcepts: ["mean", "median", "mode", "central tendency"],
    requiredFormula: "mean = sum of values / number of values",
    socraticPrompts: {
      problem_understanding:
        "What data values are given, and how many values are in the set?",
      method_selection:
        "Which three measures of central tendency are being requested?",
      formula_theorem_justification:
        "Why do mean, median, and mode each describe a different center of the data?",
      guided_computation_or_reasoning:
        "What is the sum of the study hours, and what value is in the middle after ordering?",
      error_diagnosis:
        "Where might an error happen: adding the values, finding the middle value, or identifying the repeated value?",
      progressive_unlock:
        "Order the values first, then compute the mean and look for the repeated value.",
      scorecard:
        "How do the mean, median, and mode each describe the students' study hours?",
    },
    solutionSteps: [
      "Order the data: 2, 3, 3, 4, 8.",
      "Find the mean: (2 + 3 + 3 + 4 + 8) / 5 = 20 / 5 = 4.",
      "Find the median: the middle value is 3.",
      "Find the mode: the most frequent value is 3.",
    ],
    finalAnswer: "The mean is 4, the median is 3, and the mode is 3.",
    interpretation:
      "The typical study time is around 3 to 4 hours, with the 8-hour value pulling the mean above the median.",
  },
  {
    id: "qm-central-002",
    subject: "Quantitative Methods",
    topic: "Measures of Central Tendency",
    difficulty: "Intermediate",
    problemText:
      "A small store recorded daily sales of 18, 20, 21, 22, 24, and 75 items. Which measure of central tendency best represents a typical day: mean or median?",
    expectedConcepts: ["mean", "median", "outlier", "central tendency"],
    requiredFormula: "mean = sum of values / number of values",
    socraticPrompts: {
      problem_understanding:
        "What sales values are given, and which value looks unusual compared with the rest?",
      method_selection:
        "Which measure is less affected by an extreme value: mean or median?",
      formula_theorem_justification:
        "Why can an outlier make the mean less representative than the median?",
      guided_computation_or_reasoning:
        "What are the mean and median of the sales values?",
      error_diagnosis:
        "What mistake might happen if you choose the larger average without checking the outlier?",
      progressive_unlock:
        "Compare the mean to the middle two values. Which measure stays closer to most days?",
      scorecard:
        "Explain why your chosen measure better represents a typical sales day.",
    },
    solutionSteps: [
      "Order the data: 18, 20, 21, 22, 24, 75.",
      "Find the mean: (18 + 20 + 21 + 22 + 24 + 75) / 6 = 180 / 6 = 30.",
      "Find the median: (21 + 22) / 2 = 21.5.",
      "Identify 75 as an outlier compared with the other values.",
      "Choose the median because it is less affected by the outlier.",
    ],
    finalAnswer:
      "The median, 21.5 items, best represents a typical day because the outlier 75 pulls the mean up to 30.",
    interpretation:
      "Most days are near 18 to 24 sales, so the median better describes the usual sales level.",
  },
  {
    id: "dm-truth-001",
    subject: "Discrete Mathematics",
    topic: "Truth Tables",
    difficulty: "Basic",
    problemText:
      "In one row of a truth table, p is true and q is false. Evaluate p AND NOT q.",
    expectedConcepts: ["truth table", "conjunction", "negation", "truth value"],
    requiredTheorem:
      "A conjunction P AND Q is true only when both parts are true; NOT reverses a truth value.",
    socraticPrompts: {
      problem_understanding:
        "What are the given truth values of p and q in this row?",
      method_selection:
        "Which operation should be evaluated before applying AND?",
      formula_theorem_justification:
        "How does NOT q change the given truth value of q?",
      guided_computation_or_reasoning:
        "After finding NOT q, what two truth values are combined by AND?",
      error_diagnosis:
        "Where might a truth-table error happen: negating q or applying AND?",
      progressive_unlock:
        "First find NOT q. Then check whether both parts of the AND statement are true.",
      scorecard:
        "What does the final truth value say about this row of the truth table?",
    },
    solutionSteps: [
      "Use the row values: p is true and q is false.",
      "Evaluate NOT q: NOT false is true.",
      "Evaluate p AND NOT q: true AND true is true.",
    ],
    finalAnswer: "For this row, p AND NOT q is true.",
    interpretation:
      "The compound statement is true in this row because p is true and NOT q is also true.",
  },
  {
    id: "dm-truth-002",
    subject: "Discrete Mathematics",
    topic: "Truth Tables",
    difficulty: "Intermediate",
    problemText:
      "Build the truth values for (p -> q) AND (q -> p). For which rows is the compound statement true?",
    expectedConcepts: ["truth table", "implication", "conjunction", "equivalence"],
    requiredTheorem:
      "An implication P -> Q is false only when P is true and Q is false.",
    socraticPrompts: {
      problem_understanding:
        "What four combinations of truth values for p and q must be considered?",
      method_selection:
        "Which two implications need to be evaluated before using AND?",
      formula_theorem_justification:
        "Why is each implication false only in the true-to-false case?",
      guided_computation_or_reasoning:
        "What are the truth values of p -> q and q -> p in each row?",
      error_diagnosis:
        "Which implication row is easiest to reverse incorrectly?",
      progressive_unlock:
        "List the four rows, evaluate both implications, then keep only rows where both are true.",
      scorecard:
        "What pattern do the true rows show about p and q?",
    },
    solutionSteps: [
      "Rows for p and q are: TT, TF, FT, FF.",
      "Evaluate p -> q: true, false, true, true.",
      "Evaluate q -> p: true, true, false, true.",
      "Combine with AND: true, false, false, true.",
      "The compound statement is true when p and q have the same truth value.",
    ],
    finalAnswer:
      "The statement is true in the TT and FF rows, when p and q have the same truth value.",
    interpretation:
      "The compound behaves like p if and only if q because both directions must hold.",
  },
  {
    id: "dm-perm-comb-001",
    subject: "Discrete Mathematics",
    topic: "Permutations and Combinations",
    difficulty: "Basic",
    problemText:
      "A club has 8 members and needs to choose 3 people for a cleanup committee. The roles are the same for everyone. How many committees are possible?",
    expectedConcepts: ["combination", "unordered selection", "committee"],
    requiredFormula: "C(n, r) = n! / (r!(n - r)!)",
    socraticPrompts: {
      problem_understanding:
        "How many members are available, and how many people must be chosen?",
      method_selection:
        "Does order matter when everyone has the same committee role?",
      formula_theorem_justification:
        "Why is a combination appropriate instead of a permutation?",
      guided_computation_or_reasoning:
        "How can you compute C(8, 3)?",
      error_diagnosis:
        "What would go wrong if you counted different orders of the same committee as different outcomes?",
      progressive_unlock:
        "Use C(8, 3) and simplify 8 * 7 * 6 divided by 3 * 2 * 1.",
      scorecard:
        "Explain what each counted outcome represents in the club context.",
    },
    solutionSteps: [
      "Since the roles are the same, order does not matter.",
      "Use combinations: C(8, 3).",
      "Compute C(8, 3) = 8! / (3!5!).",
      "Simplify: (8 * 7 * 6) / (3 * 2 * 1) = 56.",
    ],
    finalAnswer: "There are 56 possible cleanup committees.",
    interpretation:
      "Each outcome is a group of 3 members, and rearranging the same members does not create a new committee.",
  },
  {
    id: "dm-perm-comb-002",
    subject: "Discrete Mathematics",
    topic: "Permutations and Combinations",
    difficulty: "Intermediate",
    problemText:
      "From 7 finalists, a contest awards first, second, and third place. How many different award outcomes are possible?",
    expectedConcepts: ["permutation", "ordered selection", "ranking"],
    requiredFormula: "P(n, r) = n! / (n - r)!",
    socraticPrompts: {
      problem_understanding:
        "How many finalists are available, and how many ranked places are awarded?",
      method_selection:
        "Does order matter when first, second, and third place are different awards?",
      formula_theorem_justification:
        "Why should this be treated as a permutation instead of a combination?",
      guided_computation_or_reasoning:
        "How many choices are available for first place, then second, then third?",
      error_diagnosis:
        "What mistake happens if you treat the three winners as an unordered group?",
      progressive_unlock:
        "Multiply the choices for the three ranked positions: first, second, and third.",
      scorecard:
        "What does each counted outcome represent in the contest?",
    },
    solutionSteps: [
      "Order matters because the awards are ranked.",
      "Use permutations: P(7, 3).",
      "There are 7 choices for first place.",
      "After first place, there are 6 choices for second place.",
      "After those two awards, there are 5 choices for third place.",
      "Multiply: 7 * 6 * 5 = 210.",
    ],
    finalAnswer: "There are 210 different award outcomes.",
    interpretation:
      "Changing which finalist receives first, second, or third place creates a different outcome.",
  },
  {
    id: "qm-central-003",
    subject: "Quantitative Methods",
    topic: "Measures of Central Tendency",
    difficulty: "Advanced",
    problemText:
      "A course grade is based on quizzes (20%), a midterm (30%), and a final exam (50%). A student scores 82, 76, and 90 in those categories. Find the weighted mean.",
    expectedConcepts: ["weighted mean", "weights", "percentage"],
    requiredFormula: "weighted mean = sum(weight * value), where the weights sum to 1",
    socraticPrompts: prompts([
      "Which score belongs to each assessment weight?",
      "Why is an ordinary arithmetic mean not appropriate here?",
      "What must be true about the decimal weights before using the weighted-mean formula?",
      "What contribution does each assessment make to the final grade?",
      "What error results from using 20, 30, and 50 without converting them to decimals?",
      "Compute 0.20(82), 0.30(76), and 0.50(90), then add the contributions.",
      "How does the heavily weighted final exam influence the weighted mean?",
    ]),
    solutionSteps: [
      "Convert the weights to decimals: 0.20, 0.30, and 0.50.",
      "Compute the quiz contribution: 0.20 * 82 = 16.4.",
      "Compute the midterm contribution: 0.30 * 76 = 22.8.",
      "Compute the final-exam contribution: 0.50 * 90 = 45.",
      "Add the contributions: 16.4 + 22.8 + 45 = 84.2.",
    ],
    finalAnswer: "The weighted mean course grade is 84.2.",
    interpretation:
      "The final exam has the greatest effect because it contributes half of the course grade.",
  },
  {
    id: "qm-var-002",
    subject: "Quantitative Methods",
    topic: "Variance and Standard Deviation",
    difficulty: "Intermediate",
    problemText:
      "The values 4, 6, 8, 10, and 12 are a sample from a larger population. Find the sample variance and sample standard deviation.",
    expectedConcepts: ["sample mean", "sample variance", "sample standard deviation"],
    requiredFormula: "s^2 = sum((x - x_bar)^2) / (n - 1), and s = sqrt(s^2)",
    socraticPrompts: prompts([
      "What values are in the sample, and what is n?",
      "Which denominator distinguishes sample variance from population variance?",
      "Why does the sample formula divide by n - 1?",
      "What are the mean, deviations, and sum of squared deviations?",
      "How would using n instead of n - 1 change the result?",
      "Divide the squared-deviation total by 4, then take its square root.",
      "What do the variance and standard deviation say about spread around the mean?",
    ]),
    solutionSteps: [
      "Find the sample mean: (4 + 6 + 8 + 10 + 12) / 5 = 8.",
      "Find deviations: -4, -2, 0, 2, and 4.",
      "Square and add the deviations: 16 + 4 + 0 + 4 + 16 = 40.",
      "Divide by n - 1: s^2 = 40 / 4 = 10.",
      "Take the square root: s = sqrt(10), approximately 3.16.",
    ],
    finalAnswer:
      "The sample variance is 10 and the sample standard deviation is approximately 3.16.",
    interpretation:
      "A typical sample value is about 3.16 units from the sample mean of 8.",
  },
  {
    id: "qm-var-003",
    subject: "Quantitative Methods",
    topic: "Variance and Standard Deviation",
    difficulty: "Advanced",
    problemText:
      "A population frequency table has values 1, 2, 3, and 4 with frequencies 2, 3, 4, and 1. Find the population variance and standard deviation.",
    expectedConcepts: ["frequency distribution", "weighted mean", "population variance"],
    requiredFormula: "population variance = sum(f(x - mean)^2) / sum(f)",
    socraticPrompts: prompts([
      "How many observations does the frequency table represent?",
      "How can frequency be used without expanding every observation?",
      "Why must both the mean and squared deviations be weighted by frequency?",
      "What are the weighted mean and weighted squared-deviation total?",
      "What mistake occurs if each distinct value is counted only once?",
      "Use the total frequency 10 as the population-variance denominator, then take the square root.",
      "Interpret the resulting standard deviation in the units of the original values.",
    ]),
    solutionSteps: [
      "Find the total frequency: 2 + 3 + 4 + 1 = 10.",
      "Find the mean: (1(2) + 2(3) + 3(4) + 4(1)) / 10 = 24 / 10 = 2.4.",
      "Compute the weighted squared deviations: 2(1 - 2.4)^2 + 3(2 - 2.4)^2 + 4(3 - 2.4)^2 + 1(4 - 2.4)^2.",
      "Add them: 3.92 + 0.48 + 1.44 + 2.56 = 8.40.",
      "Find the population variance: 8.40 / 10 = 0.84.",
      "Find the standard deviation: sqrt(0.84), approximately 0.92.",
    ],
    finalAnswer:
      "The population variance is 0.84 and the population standard deviation is approximately 0.92.",
    interpretation:
      "Population values typically differ from the mean of 2.4 by about 0.92 unit.",
  },
  {
    id: "qm-data-001",
    subject: "Quantitative Methods",
    topic: "Data Interpretation",
    difficulty: "Basic",
    problemText:
      "A website recorded 120 users in Week 1, 150 in Week 2, and 180 in Week 3. What was the percentage increase from Week 1 to Week 3?",
    expectedConcepts: ["absolute change", "percentage increase", "baseline"],
    requiredFormula: "percentage increase = (new - original) / original * 100%",
    socraticPrompts: prompts([
      "Which weeks are being compared, and which value is the baseline?",
      "What two steps are needed to turn the change into a percentage increase?",
      "Why is the increase divided by Week 1 rather than Week 3?",
      "What is the absolute increase, and what fraction of Week 1 is it?",
      "What error occurs if the new value is divided directly by the original value?",
      "Subtract 120 from 180, divide by 120, and convert the decimal to a percent.",
      "What does the computed percentage say about user growth over the period?",
    ]),
    solutionSteps: [
      "Find the increase: 180 - 120 = 60 users.",
      "Divide by the original Week 1 value: 60 / 120 = 0.5.",
      "Convert to a percentage: 0.5 * 100% = 50%.",
    ],
    finalAnswer: "Users increased by 50% from Week 1 to Week 3.",
    interpretation:
      "Week 3 had half as many additional users as the entire Week 1 baseline.",
  },
  {
    id: "qm-data-002",
    subject: "Quantitative Methods",
    topic: "Data Interpretation",
    difficulty: "Intermediate",
    problemText:
      "Department A received 200 inquiries and completed 30 enrollments. Department B received 150 inquiries and completed 27 enrollments. Which department had the higher enrollment rate, and by how many percentage points?",
    expectedConcepts: ["rate", "percentage point difference", "comparison"],
    requiredFormula: "enrollment rate = enrollments / inquiries * 100%",
    socraticPrompts: prompts([
      "What numerator and denominator define each department's enrollment rate?",
      "Why should the departments be compared by rates rather than raw enrollments?",
      "What is the difference between percent and percentage points in this comparison?",
      "Compute each department's enrollments per inquiry.",
      "Why would comparing 30 with 27 alone be misleading?",
      "Convert both ratios to percentages, then subtract the smaller rate from the larger.",
      "How can a department with fewer enrollments still have the better conversion rate?",
    ]),
    solutionSteps: [
      "Find A's rate: 30 / 200 = 0.15 = 15%.",
      "Find B's rate: 27 / 150 = 0.18 = 18%.",
      "Compare the rates: 18% - 15% = 3 percentage points.",
    ],
    finalAnswer:
      "Department B had the higher enrollment rate by 3 percentage points (18% versus 15%).",
    interpretation:
      "Department B converted a larger share of its inquiries even though it enrolled fewer people in total.",
  },
  {
    id: "qm-data-003",
    subject: "Quantitative Methods",
    topic: "Data Interpretation",
    difficulty: "Advanced",
    problemText:
      "Hospital A reported 12 infections among 300 patients, while Hospital B reported 9 infections among 150 patients. Compare the infection rates, the percentage-point difference, and the risk ratio B to A.",
    expectedConcepts: ["rate", "percentage point difference", "risk ratio"],
    requiredFormula: "risk ratio = rate_B / rate_A",
    socraticPrompts: prompts([
      "Why are the raw infection counts insufficient for comparing hospitals of different sizes?",
      "Which measures show absolute and relative differences between the rates?",
      "Why must the two infection rates be computed before forming a risk ratio?",
      "What are the infection rates for A and B?",
      "What incorrect conclusion could be drawn from observing only that 9 is less than 12?",
      "Subtract A's rate from B's rate, then divide B's rate by A's rate.",
      "Explain both the percentage-point difference and the risk ratio in plain language.",
    ]),
    solutionSteps: [
      "Find A's rate: 12 / 300 = 0.04 = 4%.",
      "Find B's rate: 9 / 150 = 0.06 = 6%.",
      "Find the percentage-point difference: 6% - 4% = 2 percentage points.",
      "Find the risk ratio B to A: 0.06 / 0.04 = 1.5.",
    ],
    finalAnswer:
      "Hospital B's rate is 6% versus A's 4%, a 2-percentage-point difference and a B-to-A risk ratio of 1.5.",
    interpretation:
      "The infection rate at B is 50% higher than at A despite B having fewer infections in absolute count.",
  },
  {
    id: "qm-prob-002",
    subject: "Quantitative Methods",
    topic: "Probability",
    difficulty: "Basic",
    problemText:
      "A fair six-sided die is rolled once. What is the probability of rolling an even number?",
    expectedConcepts: ["sample space", "favorable outcomes", "equally likely outcomes"],
    requiredFormula: "P(event) = favorable outcomes / total outcomes",
    socraticPrompts: prompts([
      "What outcomes are possible when one fair die is rolled?",
      "Which outcomes satisfy the event 'even number'?",
      "Why can favorable outcomes be divided by all outcomes for a fair die?",
      "How many favorable outcomes and total outcomes are there?",
      "What happens if zero is incorrectly included as a die outcome?",
      "Write the favorable count over six and simplify the fraction.",
      "What does this probability mean over many die rolls?",
    ]),
    solutionSteps: [
      "List the sample space: 1, 2, 3, 4, 5, 6.",
      "Identify the even outcomes: 2, 4, and 6.",
      "Write the probability: 3 / 6.",
      "Simplify: 3 / 6 = 1 / 2.",
    ],
    finalAnswer: "The probability of rolling an even number is 1/2.",
    interpretation:
      "Half of the equally likely die outcomes are even.",
  },
  {
    id: "qm-prob-003",
    subject: "Quantitative Methods",
    topic: "Probability",
    difficulty: "Advanced",
    problemText:
      "A bag contains 6 white balls and 4 black balls. Two balls are drawn without replacement. What is the probability of drawing exactly one black ball?",
    expectedConcepts: ["without replacement", "mutually exclusive orders", "compound probability"],
    requiredFormula: "P(exactly one black) = P(B then W) + P(W then B)",
    socraticPrompts: prompts([
      "What two draw orders produce exactly one black ball?",
      "How does drawing without replacement change the second denominator?",
      "Why are the probabilities of the two possible orders added?",
      "What are P(B then W) and P(W then B)?",
      "What mistake results from counting only one order or keeping 10 as the second denominator?",
      "Compute both order probabilities, add them, and simplify.",
      "How does the answer account for both possible positions of the black ball?",
    ]),
    solutionSteps: [
      "For black then white: (4 / 10)(6 / 9) = 24 / 90.",
      "For white then black: (6 / 10)(4 / 9) = 24 / 90.",
      "Add the mutually exclusive orders: 48 / 90.",
      "Simplify: 48 / 90 = 8 / 15.",
    ],
    finalAnswer: "The probability of drawing exactly one black ball is 8/15.",
    interpretation:
      "Exactly one black ball can occur in either draw order, and both orders are included.",
  },
  {
    id: "qm-corr-001",
    subject: "Quantitative Methods",
    topic: "Correlation and Basic Regression",
    difficulty: "Basic",
    problemText:
      "Study time and quiz score pairs are (1, 55), (2, 62), (3, 68), and (4, 74), where time is in hours. Describe the direction of the correlation.",
    expectedConcepts: ["paired data", "positive correlation", "association"],
    requiredFormula: "positive correlation: y tends to increase as x increases",
    socraticPrompts: prompts([
      "What happens to quiz score as study time increases across the pairs?",
      "Which correlation direction matches two variables increasing together?",
      "Why does a trend describe association rather than prove causation?",
      "Compare each successive change in study time and score.",
      "What mistake would reverse the meaning of positive and negative correlation?",
      "State the direction and cite the pattern in the paired values.",
      "What can and cannot be concluded from this small data set?",
    ]),
    solutionSteps: [
      "Read the pairs in order of increasing study time.",
      "Observe that scores rise from 55 to 62 to 68 to 74.",
      "Classify the association as positive because both variables increase together.",
    ],
    finalAnswer: "The data show a positive correlation.",
    interpretation:
      "Higher study time is associated with higher quiz scores in these observations, but the data alone do not prove causation.",
  },
  {
    id: "qm-corr-002",
    subject: "Quantitative Methods",
    topic: "Correlation and Basic Regression",
    difficulty: "Intermediate",
    problemText:
      "A fitted regression equation for quiz score y and study hours x is y = 45 + 6x. Predict the score for 5 study hours and interpret the slope.",
    expectedConcepts: ["linear regression", "prediction", "slope interpretation"],
    requiredFormula: "predicted y = intercept + slope * x",
    socraticPrompts: prompts([
      "Which number is the intercept, which is the slope, and what x value is given?",
      "How is a regression equation used to make a prediction?",
      "What units should be attached to the slope of 6?",
      "What value results when x = 5 is substituted?",
      "Why is 45 + 5 an incorrect substitution?",
      "Multiply the slope by 5, add the intercept, and describe the slope in context.",
      "Why should predictions far outside the observed hour range be treated cautiously?",
    ]),
    solutionSteps: [
      "Substitute x = 5 into y = 45 + 6x.",
      "Compute y = 45 + 6(5) = 45 + 30 = 75.",
      "Interpret the slope: each additional study hour is associated with a 6-point increase in predicted quiz score.",
    ],
    finalAnswer:
      "The predicted score is 75; the slope means 6 additional predicted points per extra study hour.",
    interpretation:
      "The model estimates an average linear increase, not a guaranteed causal gain for every student.",
  },
  {
    id: "qm-corr-003",
    subject: "Quantitative Methods",
    topic: "Correlation and Basic Regression",
    difficulty: "Advanced",
    problemText:
      "For the paired values x = 1, 2, 3 and y = 2, 3, 5, compute the Pearson correlation coefficient r and interpret it.",
    expectedConcepts: ["Pearson correlation", "deviation products", "strength and direction"],
    requiredFormula:
      "r = sum((x - x_bar)(y - y_bar)) / sqrt(sum((x - x_bar)^2) * sum((y - y_bar)^2))",
    socraticPrompts: prompts([
      "What are the means of x and y?",
      "Which deviation sums are needed for Pearson's r?",
      "Why does the denominator standardize the cross-product sum?",
      "What are the x deviations, y deviations, and their products?",
      "What error results from rounding the means too early?",
      "Compute the numerator and denominator before rounding the final ratio.",
      "What do the sign and magnitude of r say about this small data set?",
    ]),
    solutionSteps: [
      "Find the means: x_bar = 2 and y_bar = 10 / 3.",
      "The x deviations are -1, 0, 1; the y deviations are -4/3, -1/3, 5/3.",
      "Find the cross-product sum: 4/3 + 0 + 5/3 = 3.",
      "Find squared-deviation sums: 2 for x and 14/3 for y.",
      "Compute r = 3 / sqrt(2 * 14/3), approximately 0.982.",
    ],
    finalAnswer: "The Pearson correlation coefficient is approximately r = 0.982.",
    interpretation:
      "The three points have a very strong positive linear association.",
  },
  {
    id: "dm-logic-002",
    subject: "Discrete Mathematics",
    topic: "Logic and Propositions",
    difficulty: "Intermediate",
    problemText:
      "If a file is encrypted, then it is protected. The file is not protected. What valid conclusion follows?",
    expectedConcepts: ["implication", "negation", "modus tollens"],
    requiredTheorem: "Modus tollens: from p -> q and NOT q, infer NOT p.",
    socraticPrompts: prompts([
      "Which statements play the roles of p and q?",
      "Which inference rule starts with an implication and the negation of its conclusion?",
      "Why does NOT q rule out p when p would require q?",
      "Write the premises symbolically and apply the inference rule.",
      "How would affirming the consequent differ from this valid argument?",
      "From p -> q and NOT q, state the required conclusion about p.",
      "Translate the symbolic conclusion back into the file context.",
    ]),
    solutionSteps: [
      "Let p mean 'the file is encrypted' and q mean 'the file is protected.'",
      "The premises are p -> q and NOT q.",
      "Apply modus tollens to infer NOT p.",
      "Translate NOT p: the file is not encrypted.",
    ],
    finalAnswer: "The valid conclusion is that the file is not encrypted.",
    interpretation:
      "If encryption necessarily implied protection, lack of protection rules out encryption under the stated premise.",
  },
  {
    id: "dm-logic-003",
    subject: "Discrete Mathematics",
    topic: "Logic and Propositions",
    difficulty: "Advanced",
    problemText:
      "Show that (p -> q) AND (p -> r) is logically equivalent to p -> (q AND r).",
    expectedConcepts: ["logical equivalence", "implication law", "distributive law"],
    requiredTheorem: "p -> q is equivalent to NOT p OR q.",
    socraticPrompts: prompts([
      "What two compound statements must be shown equivalent?",
      "Which implication equivalence turns both sides into expressions using OR and NOT?",
      "How does the distributive law combine (NOT p OR q) AND (NOT p OR r)?",
      "Rewrite the left side one implication at a time.",
      "What mistake occurs if AND q AND r is replaced with OR q OR r?",
      "Factor the repeated NOT p term, then convert the result back to an implication.",
      "What common condition makes both implications on the left true together?",
    ]),
    solutionSteps: [
      "Rewrite each implication: (NOT p OR q) AND (NOT p OR r).",
      "Apply distributivity: NOT p OR (q AND r).",
      "Use the implication equivalence in reverse.",
      "Obtain p -> (q AND r), which is the right side.",
    ],
    finalAnswer:
      "(p -> q) AND (p -> r) is logically equivalent to p -> (q AND r).",
    interpretation:
      "Whenever p holds, both q and r must hold; when p is false, both forms are true.",
  },
  {
    id: "dm-truth-003",
    subject: "Discrete Mathematics",
    topic: "Truth Tables",
    difficulty: "Advanced",
    problemText:
      "Use a truth table to classify (p -> q) IFF (NOT q -> NOT p) as a tautology, contradiction, or contingency.",
    expectedConcepts: ["truth table", "contrapositive", "biconditional", "tautology"],
    requiredTheorem: "A proposition and its contrapositive always have the same truth value.",
    socraticPrompts: prompts([
      "What four p and q rows must the table contain?",
      "Which columns are needed before evaluating the biconditional?",
      "When is a biconditional true?",
      "Compute p -> q and NOT q -> NOT p for each row.",
      "Which negation or implication is most likely to be reversed incorrectly?",
      "Compare the two implication columns row by row, then fill the IFF column.",
      "How does an all-true final column classify the statement?",
    ]),
    solutionSteps: [
      "List the rows TT, TF, FT, and FF for p and q.",
      "Evaluate p -> q: T, F, T, T.",
      "Evaluate NOT q -> NOT p: T, F, T, T.",
      "The two columns match in every row, so the biconditional is T, T, T, T.",
    ],
    finalAnswer: "The compound statement is a tautology.",
    interpretation:
      "An implication is logically equivalent to its contrapositive in every possible truth assignment.",
  },
  {
    id: "dm-count-002",
    subject: "Discrete Mathematics",
    topic: "Counting Principles",
    difficulty: "Basic",
    problemText:
      "A student can choose one of 3 shirts and one of 2 pairs of pants. How many different outfits are possible?",
    expectedConcepts: ["multiplication principle", "independent choices", "product"],
    requiredTheorem:
      "Multiplication Principle: multiply the number of choices for successive independent decisions.",
    socraticPrompts: prompts([
      "What two clothing choices make one complete outfit?",
      "Which counting principle combines one shirt choice with one pants choice?",
      "Why is every shirt compatible with each pair of pants?",
      "How many pants choices go with each of the three shirts?",
      "Why would adding 3 + 2 count choices rather than complete outfits?",
      "Multiply the shirt choices by the pants choices.",
      "What does each of the counted outcomes represent?",
    ]),
    solutionSteps: [
      "There are 3 choices for the shirt.",
      "For each shirt, there are 2 choices for pants.",
      "Apply the multiplication principle: 3 * 2 = 6.",
    ],
    finalAnswer: "There are 6 different outfits.",
    interpretation:
      "Each outfit is one distinct shirt-and-pants pairing.",
  },
  {
    id: "dm-count-003",
    subject: "Discrete Mathematics",
    topic: "Counting Principles",
    difficulty: "Advanced",
    problemText:
      "A code has two different uppercase letters followed by three different digits. Repetition is not allowed within the letters or within the digits. How many codes are possible?",
    expectedConcepts: ["multiplication principle", "restricted choices", "ordered code"],
    requiredTheorem:
      "Multiply the remaining choices at each ordered position when repetition is forbidden.",
    socraticPrompts: prompts([
      "How many ordered positions are letters, and how many are digits?",
      "How does the no-repetition rule change choices after each position?",
      "Why does order matter in a code?",
      "How many choices are available for each of the five positions?",
      "What mistake results from using 26 choices twice and 10 choices three times?",
      "Evaluate 26 * 25 * 10 * 9 * 8.",
      "What restrictions are represented by each decreasing factor?",
    ]),
    solutionSteps: [
      "Choose the first letter in 26 ways and the second in 25 ways.",
      "Choose the first digit in 10 ways, the second in 9 ways, and the third in 8 ways.",
      "Multiply: 26 * 25 * 10 * 9 * 8 = 468,000.",
    ],
    finalAnswer: "There are 468,000 possible codes.",
    interpretation:
      "Each factor counts choices remaining for an ordered position after earlier symbols are excluded.",
  },
  {
    id: "dm-perm-comb-003",
    subject: "Discrete Mathematics",
    topic: "Permutations and Combinations",
    difficulty: "Advanced",
    problemText:
      "Seven distinct books are arranged on a shelf. If two particular books must be next to each other, how many arrangements are possible?",
    expectedConcepts: ["permutation", "block method", "internal arrangement"],
    requiredFormula: "treat the required pair as one block: 6! * 2!",
    socraticPrompts: prompts([
      "How can the two books that must stay together be treated as one object?",
      "How many objects remain to arrange after forming the block?",
      "Why must the two orders inside the block also be counted?",
      "Compute the arrangements of six objects and the internal pair arrangements.",
      "What is missed if only 6! is used?",
      "Multiply 6! by 2!.",
      "How does the block method guarantee adjacency without fixing a shelf position?",
    ]),
    solutionSteps: [
      "Treat the two particular books as one block.",
      "The block plus the other five books gives six objects, arranged in 6! ways.",
      "The two books inside the block can be ordered in 2! ways.",
      "Multiply: 6! * 2! = 720 * 2 = 1,440.",
    ],
    finalAnswer: "There are 1,440 valid arrangements.",
    interpretation:
      "Every arrangement keeps the designated pair adjacent while counting both possible orders within the pair.",
  },
  {
    id: "dm-pigeon-001",
    subject: "Discrete Mathematics",
    topic: "Pigeonhole Principle",
    difficulty: "Basic",
    problemText:
      "Show that among 13 people, at least two were born in the same month.",
    expectedConcepts: ["pigeonhole principle", "people", "birth months"],
    requiredTheorem:
      "If more than n objects are placed into n boxes, at least one box contains at least two objects.",
    socraticPrompts: prompts([
      "What are the objects and what are the possible boxes in this problem?",
      "Which principle applies when 13 objects are assigned to only 12 categories?",
      "Why is it impossible for every month to contain at most one person?",
      "Compare the number of people with the number of months.",
      "What unstated assumption would be needed to claim exactly two share a month?",
      "Assign each person to a birth-month box and apply the principle.",
      "What minimum conclusion, rather than an exact distribution, is guaranteed?",
    ]),
    solutionSteps: [
      "Treat the 13 people as objects.",
      "Treat the 12 months as boxes.",
      "Since 13 is greater than 12, the pigeonhole principle applies.",
      "At least one month contains birthdays of at least two people.",
    ],
    finalAnswer: "At least two of the 13 people share a birth month.",
    interpretation:
      "The principle guarantees a repeated month but does not identify which month or how many total repetitions occur.",
  },
  {
    id: "dm-pigeon-002",
    subject: "Discrete Mathematics",
    topic: "Pigeonhole Principle",
    difficulty: "Intermediate",
    problemText:
      "A drawer contains 25 socks in 4 colors. Show that at least 7 socks have the same color.",
    expectedConcepts: ["generalized pigeonhole principle", "ceiling", "color classes"],
    requiredTheorem:
      "Generalized pigeonhole principle: some box contains at least ceiling(N / k) objects.",
    socraticPrompts: prompts([
      "What are the objects, boxes, and their counts?",
      "Which generalized bound gives the guaranteed number in one color?",
      "Why is the ceiling of 25/4 used?",
      "What is the largest total possible if every color had at most 6 socks?",
      "Why does an average of 6.25 not mean a fractional sock exists?",
      "Compute ceiling(25/4) or use a contradiction with four groups of six.",
      "What does 'at least 7' guarantee and what does it leave unknown?",
    ]),
    solutionSteps: [
      "Treat 25 socks as objects and 4 colors as boxes.",
      "Compute ceiling(25 / 4) = ceiling(6.25) = 7.",
      "Equivalently, four colors with at most 6 socks each could hold only 24 socks.",
      "Therefore one color must contain at least 7 socks.",
    ],
    finalAnswer: "At least 7 socks have the same color.",
    interpretation:
      "The distribution could have more than seven of one color, but seven is the guaranteed minimum.",
  },
  {
    id: "dm-pigeon-003",
    subject: "Discrete Mathematics",
    topic: "Pigeonhole Principle",
    difficulty: "Advanced",
    problemText:
      "Prove that choosing any 11 distinct integers from 1 through 20 guarantees that two chosen integers are consecutive.",
    expectedConcepts: ["pigeonhole principle", "pair partition", "consecutive integers"],
    requiredTheorem:
      "Partition 1 through 20 into 10 pairs: {1,2}, {3,4}, ..., {19,20}.",
    socraticPrompts: prompts([
      "How can the integers 1 through 20 be partitioned into boxes that encode consecutiveness?",
      "How many two-integer boxes result from pairing consecutive numbers?",
      "Why do 11 selected integers force one pair to contribute two selections?",
      "Apply the pigeonhole principle to the selected integers and the ten pairs.",
      "Why would pairing {2,3}, {4,5}, and so on leave an endpoint problem?",
      "List the ten disjoint consecutive pairs, then place each selected integer into its pair.",
      "What property do the two selections from the same pair necessarily have?",
    ]),
    solutionSteps: [
      "Partition the set into ten boxes: {1,2}, {3,4}, ..., {19,20}.",
      "Place each of the 11 selected integers in the unique pair containing it.",
      "There are 11 selected integers but only 10 pairs.",
      "By the pigeonhole principle, one pair contains two selected integers.",
      "The two integers in that pair are consecutive.",
    ],
    finalAnswer:
      "Any 11 distinct selections include two consecutive integers.",
    interpretation:
      "Ten selections could take one number from each pair, but the eleventh forces a complete consecutive pair.",
  },
  {
    id: "dm-proof-001",
    subject: "Discrete Mathematics",
    topic: "Basic Proof Reasoning",
    difficulty: "Basic",
    problemText:
      "Disprove the statement: 'The sum of two odd integers is odd.'",
    expectedConcepts: ["counterexample", "universal statement", "odd and even"],
    requiredTheorem:
      "A single valid counterexample disproves a universal statement.",
    socraticPrompts: prompts([
      "What type of statement is being made about every pair of odd integers?",
      "What is the simplest proof method for showing a universal claim is false?",
      "Why is one counterexample enough?",
      "Choose two odd integers and compute their sum.",
      "What mistake would occur if one even addend were used?",
      "Verify that both chosen numbers are odd and that their sum is not odd.",
      "What conclusion can be made about the original universal statement?",
    ]),
    solutionSteps: [
      "Choose two odd integers, for example 3 and 5.",
      "Compute their sum: 3 + 5 = 8.",
      "Both addends are odd, but 8 is even.",
      "Therefore the universal statement is false.",
    ],
    finalAnswer: "The statement is false; 3 + 5 = 8 is a counterexample.",
    interpretation:
      "One valid case that violates a universal claim is sufficient to disprove it.",
  },
  {
    id: "dm-proof-002",
    subject: "Discrete Mathematics",
    topic: "Basic Proof Reasoning",
    difficulty: "Intermediate",
    problemText:
      "Prove directly that the product of two consecutive integers is even.",
    expectedConcepts: ["direct proof", "parity", "consecutive integers"],
    requiredTheorem:
      "Every integer is even or odd; among two consecutive integers, one is even.",
    socraticPrompts: prompts([
      "How can two consecutive integers be represented algebraically?",
      "Which parity fact about consecutive integers makes their product even?",
      "Why does a product with an even factor have the form 2k?",
      "Consider the cases where n is even and where n is odd.",
      "Why is testing only a few numerical pairs not a proof for all integers?",
      "Express the even member as twice an integer and factor 2 from the product.",
      "How do the two parity cases cover every possible integer n?",
    ]),
    solutionSteps: [
      "Let the consecutive integers be n and n + 1.",
      "If n is even, n = 2k, so n(n + 1) = 2k(n + 1), which is even.",
      "If n is odd, n + 1 is even, so n + 1 = 2k for some integer k.",
      "Then n(n + 1) = 2kn, which is even.",
      "The cases cover all integers, so the product is always even.",
    ],
    finalAnswer: "The product of any two consecutive integers is even.",
    interpretation:
      "One of every two consecutive integers supplies a factor of 2 to the product.",
  },
  {
    id: "dm-proof-003",
    subject: "Discrete Mathematics",
    topic: "Basic Proof Reasoning",
    difficulty: "Advanced",
    problemText:
      "Prove by contradiction that the square root of 2 is irrational.",
    expectedConcepts: ["proof by contradiction", "lowest terms", "parity"],
    requiredTheorem:
      "If an integer square is even, then the integer is even.",
    socraticPrompts: prompts([
      "What opposite assumption begins a proof by contradiction?",
      "How should a rational representation a/b be chosen to expose a contradiction?",
      "Why does a^2 = 2b^2 imply that a is even?",
      "After writing a = 2k, what does the equation imply about b?",
      "Where is the contradiction if both a and b are even?",
      "Assume lowest terms, derive evenness of both numerator and denominator, then reject the assumption.",
      "Why does contradicting lowest terms establish irrationality rather than merely finding a poor fraction?",
    ]),
    solutionSteps: [
      "Assume sqrt(2) = a / b in lowest terms, with integers a and b and b not zero.",
      "Square both sides: a^2 = 2b^2, so a^2 and therefore a are even.",
      "Write a = 2k and substitute: 4k^2 = 2b^2, so b^2 = 2k^2.",
      "Thus b is also even.",
      "Then a and b share a factor of 2, contradicting that a/b was in lowest terms.",
      "Therefore sqrt(2) is irrational.",
    ],
    finalAnswer: "The square root of 2 is irrational.",
    interpretation:
      "Assuming a lowest-terms fraction forces both terms to be even, an impossibility that rejects rationality.",
  },
];

/** Returns every structural or coverage error in a prepared problem bank. */
export function validateMindGuideProblemBank(
  problems: readonly MindGuideProblem[] = mindGuideProblems
): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const coverage = new Map<string, number>();
  const difficulties = ["Basic", "Intermediate", "Advanced"] as const;

  for (const [subject, topics] of Object.entries(SUBJECT_TOPICS)) {
    for (const topic of topics) {
      for (const difficulty of difficulties) {
        coverage.set(`${subject}::${topic}::${difficulty}`, 0);
      }
    }
  }

  for (const problem of problems) {
    const label = problem.id || "<missing-id>";
    if (!problem.id.trim()) errors.push("A problem is missing an id.");
    if (seenIds.has(problem.id)) errors.push(`Duplicate problem id: ${problem.id}`);
    seenIds.add(problem.id);

    const allowedTopics = SUBJECT_TOPICS[problem.subject] as readonly string[];
    if (!allowedTopics?.includes(problem.topic)) {
      errors.push(`${label}: topic does not belong to its subject.`);
    }

    const key = `${problem.subject}::${problem.topic}::${problem.difficulty}`;
    coverage.set(key, (coverage.get(key) ?? 0) + 1);

    if (!problem.problemText.trim()) errors.push(`${label}: missing problem text.`);
    if (problem.expectedConcepts.length === 0) {
      errors.push(`${label}: expectedConcepts must not be empty.`);
    }
    if (!problem.requiredFormula && !problem.requiredTheorem) {
      errors.push(`${label}: a formula or theorem is required.`);
    }
    if (problem.solutionSteps.length < 2 || problem.solutionSteps.some((step) => !step.trim())) {
      errors.push(`${label}: solutionSteps must contain at least two non-empty steps.`);
    }
    if (!problem.finalAnswer.trim()) errors.push(`${label}: missing final answer.`);
    if (!problem.interpretation.trim()) errors.push(`${label}: missing interpretation.`);

    for (const [phase, prompt] of Object.entries(problem.socraticPrompts)) {
      if (!prompt.trim()) errors.push(`${label}: missing ${phase} prompt.`);
    }
  }

  for (const [key, count] of coverage) {
    if (count !== 1) errors.push(`${key}: expected exactly one problem, found ${count}.`);
  }

  if (problems.length !== 33) {
    errors.push(`Expected 33 prepared problems, found ${problems.length}.`);
  }

  return errors;
}

/** Fails fast during app/test startup if curated learning content is incomplete. */
export function assertValidMindGuideProblemBank(
  problems: readonly MindGuideProblem[] = mindGuideProblems
): void {
  const errors = validateMindGuideProblemBank(problems);
  if (errors.length > 0) {
    throw new Error(`Invalid MINDGUIDE problem bank:\n${errors.join("\n")}`);
  }
}

export default mindGuideProblems;
