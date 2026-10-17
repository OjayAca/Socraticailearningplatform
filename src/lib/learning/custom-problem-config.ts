export const CUSTOM_FAMILIES = {
  functions: { topics: ['quantitative-methods-functions', 'discrete-mathematics-relations-and-functions', 'Functions', 'Relations and Functions'], types: 'Function evaluation with arithmetic and polynomial expressions', example: 'Given f(x) = 2x + 3, find f(5).', limitation: 'Only evaluation at a numeric input; no calculus, domain/range or composition.' },
  statistics: { topics: ['quantitative-methods-descriptive-statistics', 'Descriptive Statistics', 'Measures of Central Tendency'], types: 'Mean, median, mode, range, population/sample variance and standard deviation', example: 'Find the sample variance of 2, 4, and 6.', limitation: 'Explicit comma-separated datasets only; specify population or sample for dispersion.' },
  counting: { topics: ['discrete-mathematics-combinatorics', 'Combinatorics', 'Counting Principles'], types: 'Product rule, permutation, combination', example: 'combination: 8, 3', limitation: 'Independent stage counts or selections without replacement only.' },
  probability: { topics: ['quantitative-methods-introduction-to-probability', 'discrete-mathematics-discrete-probability', 'Introduction to Probability', 'Discrete Probability'], types: 'Classical probability', example: 'probability: 3, 10', limitation: 'Favorable and total counts of equally likely outcomes only; no conditional probability or distributions.' },
  sets: { topics: ['discrete-mathematics-set-theory', 'Set Theory'], types: 'Union, intersection, left-minus-right difference', example: 'Find the union of {1, 2, 3} and {2, 3, 4}.', limitation: 'Two finite numerical sets only.' },
  logic: { topics: ['discrete-mathematics-logic', 'Logic'], types: 'Boolean evaluation with AND, OR, NOT and parentheses', example: 'Evaluate p AND q when p=true and q=false.', limitation: 'Explicit assignments required; no proofs, quantifiers or truth-table generation.' },
} as const;
export type CustomFamily = keyof typeof CUSTOM_FAMILIES;
export function customGuidance(topic: string) {
  return Object.values(CUSTOM_FAMILIES).find(item => (item.topics as readonly string[]).includes(topic));
}
