import { describe, expect, it } from "vitest";
import { solveVerifiedProblem, verifiedConfirmation } from "@/lib/learning/verified-problems";

describe("verified problem input", () => {
  it.each([
    "what is the mean for 23, 41,9,56",
    "What is the mean of 23, 41, 9, 56?",
    "Calculate the mean of 23, 41, 9, 56.",
    "mean: 23, 41,9,56",
  ])("extracts and solves the reported dataset from %s", (question) => {
    const preview = verifiedConfirmation(question, "Measures of Central Tendency");
    expect(preview.givens).toEqual({ operation: "mean", values: [23, 41, 9, 56] });
    expect(preview.description).toBe("mean: 23, 41, 9, 56");
    expect(solveVerifiedProblem(preview.givens).finalAnswer).toBe("32.25");
  });

  it.each([
    ["median: -2.5, 4, 9", "Measures of Central Tendency", "4"],
    ["Find the mode of 2, 2, 5", "Measures of Central Tendency", "{2}"],
    ["product: 3, 4", "Counting Principles", "12"],
    ["permutation: 5, 2", "Counting Principles", "20"],
    ["combination: 5, 2", "Counting Principles", "10"],
  ])("preserves supported operations: %s", (question, topic, answer) => {
    expect(solveVerifiedProblem(verifiedConfirmation(question, topic).givens).finalAnswer).toBe(answer);
  });

  it.each([
    "what is the mean for 23, 41,9,56 excluding 9",
    "mean: 23, 41, nope, 56",
    "mean: 23, 41,",
    "mean: 1000001, 2",
    "mean: 1, 2 and median: 3, 4",
  ])("rejects ambiguous or unsupported input without dropping information: %s", (question) => {
    expect(() => verifiedConfirmation(question, "Measures of Central Tendency")).toThrow();
  });

  it("still checks topic and counting constraints", () => {
    expect(() => verifiedConfirmation("mean: 1, 2", "Counting Principles")).toThrow();
    expect(() => verifiedConfirmation("combination: 2, 5", "Counting Principles")).toThrow();
  });
});

describe('expanded bounded custom operations', () => {
  it.each([
    ['Given f(x) = 2x + 3, find f(5).', 'Functions', '13'],
    ['Given f(x) = x^2 + 2x + 1, find f(3).', 'Functions', '16'],
    ['Find f(4) if f(x) = 3x - 2.', 'Functions', '10'],
    ['Given f(x) = -x^2 + 2(x + 1), find f(-2).', 'Functions', '-6'],
    ['Find the mean of the scores 4, 8, and 12.', 'Descriptive Statistics', '8'],
    ['Find the range of 2, 9, and 5.', 'Descriptive Statistics', '7'],
    ['Find the sample variance of 2, 4, and 6.', 'Descriptive Statistics', '4'],
    ['population variance: 2, 4, 6', 'Descriptive Statistics', String(8/3)],
    ['sample standard deviation: 2, 4, 6', 'Descriptive Statistics', '2'],
    ['population standard deviation: 2, 4, 6', 'Descriptive Statistics', String(Math.sqrt(8/3))],
    ['median: -4, -4, 2, 2', 'Descriptive Statistics', '-1'],
    ['mode: 1, 1, 2, 2', 'Descriptive Statistics', '{1, 2}'],
    ['mean: 1000000', 'Descriptive Statistics', '1000000'],
    ['How many combinations are possible when choosing 3 from 8?', 'Combinatorics', '56'],
    ['permutation: 0, 0', 'Combinatorics', '1'],
    ['Find the probability of 3 favorable outcomes out of 10 equally likely outcomes.', 'Introduction to Probability', '0.3'],
    ['probability: 2, 8', 'Discrete Probability', '0.25'],
    ['probability: 0, 1', 'Discrete Probability', '0'],
    ['Find the union of {1, 2, 3} and {2, 3, 4}.', 'Set Theory', '{1, 2, 3, 4}'],
    ['Find the intersection of {1, 2, 3} and {2, 3, 4}.', 'Set Theory', '{2, 3}'],
    ['Find the difference of {1, 2, 3} and {2, 3, 4}.', 'Set Theory', '{1}'],
    ['{} union {-2, -2, 4}', 'Set Theory', '{-2, 4}'],
    ['Evaluate p AND q when p=true and q=false.', 'Logic', 'false'],
    ['Evaluate NOT (p OR q) when p=false, q=false.', 'Logic', 'true'],
  ])('solves %s', (q,t,a) => expect(solveVerifiedProblem(verifiedConfirmation(q,t).givens).finalAnswer).toBe(a));
  it.each([
    ['Given f(x) = [math], find f(3).', 'Functions', 'x^{2}+\\frac{2x}{3}', '11'],
    ['[math]', 'Set Theory', '\\left\\{1,2\\right\\} \\cup \\{2,3\\}', '{1, 2, 3}'],
    ['Evaluate [math] when p=true and q=false.', 'Logic', 'p\\land \\neg q', 'true'],
  ])('normalizes supported notation %s', (q,t,l,a) => expect(solveVerifiedProblem(verifiedConfirmation(q,t,l).givens).finalAnswer).toBe(a));
  it.each([
    ['Given f(x) = 1/(x-2), find f(2).','Functions'],
    ['Given f(x) = x^11, find f(2).','Functions'],
    ['Given f(x) = x^-1, find f(2).','Functions'],
    ['Given f(x) = x^2^2, find f(2).','Functions'],
    ['Given f(x) = 1e9, find f(2).','Functions'],
    ['Given f(x) = y+1, find f(2).','Functions'],
    ['Given f(x) = sin(x), find f(2).','Functions'],
    ['Given f(x) = 1 .2, find f(2).','Functions'],
    ['Given f(x) = \\rightx, find f(2).','Functions'],
    ['Given f(x) = (2x, find f(2).','Functions'],
    ['Given f(x) = x^10, find f(100).','Functions'],
    ['Find the derivative of f(x)=x^2','Functions'],
    ['Given f(x)=x+1','Functions'],
    ['sample variance: 2','Descriptive Statistics'],
    ['variance: 2, 4','Descriptive Statistics'],
    ['mean: 1, 2, junk','Descriptive Statistics'],
    ['product: -1, 2','Combinatorics'],
    ['permutation: 5.5, 2','Combinatorics'],
    ['combination: 100, 50','Combinatorics'],
    ['probability: 3, 2','Discrete Probability'],
    ['probability: 0, 0','Discrete Probability'],
    ['probability: 1.5, 2','Discrete Probability'],
    ['{1, x} union {2}','Set Theory'],
    ['{1} union {2} union {3}','Set Theory'],
    ['Evaluate p AND r when p=true','Logic'],
    ['Evaluate p XOR q when p=true and q=false','Logic'],
    ['Evaluate p when p=true and p=false','Logic'],
    ['Evaluate p OR when p=true','Logic'],
    ['mean: 1, 2','Functions'],
  ])('rejects %s', (q,t) => expect(()=>verifiedConfirmation(q,t)).toThrow());
  it('enforces size limits and binds both forms and difficulty', () => {
    expect(()=>verifiedConfirmation(`mean: ${Array(51).fill(1).join(',')}`, 'Descriptive Statistics')).toThrow();
    expect(()=>verifiedConfirmation(`Given f(x) = ${'x+'.repeat(60)}x, find f(1).`, 'Functions')).toThrow();
    expect(()=>verifiedConfirmation('mean: 1, 2', 'Descriptive Statistics', '3')).toThrow();
    const q='Given f(x) = [math], find f(2).';
    expect(verifiedConfirmation(q,'Functions','2x','Basic').confirmationHash).not.toBe(verifiedConfirmation(q,'Functions','3x','Basic').confirmationHash);
    expect(verifiedConfirmation(q,'Functions','2x','Basic').confirmationHash).not.toBe(verifiedConfirmation(q,'Functions','2x','Advanced').confirmationHash);
  });
});
