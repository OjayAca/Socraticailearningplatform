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
