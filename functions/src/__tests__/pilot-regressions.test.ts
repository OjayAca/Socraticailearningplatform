import { describe, it, expect } from "vitest";
import { answerMatches, checkAnswer } from "../answers.js";
import { buildScorecard, evaluateDeterministically, initialGateStates, recommendDifficulty, supportContent } from "../workflow.js";
import { parseVerifiedProblem, solveVerifiedProblem, verifiedConfirmation } from "../verified-problems.js";
import { contentHash } from "../content-hash.js";
import { observedWriter } from "../observed-writer.js";

describe("audit regression cases", () => {
  const reference = solveVerifiedProblem({ operation: "mean", values: [8,10,12] });
  it.each(["100", "-10", "The answer is not 10", "10 or 100", "10 apples", "\\href{https://bad}{10}"])("rejects false credit for %s", input => {
    const score = buildScorecard({ reference, gates: initialGateStates(), draft: { answer: { plainText: input }, methodology: "unrelated", reflection: "unrelated" } });
    expect(score.criteria.accuracy.score).toBe(0);
    expect(score.criteria.methodSelection.score).toBe(0);
    expect(score.criteria.explanationQuality.score).toBe(0);
  });
  it("accepts canonical answers independently of display prose", () => {
    expect(checkAnswer({ plainText: "8" }, {kind: "number", value: 8})).toBe(true);
    expect(checkAnswer({ plainText: "", latex: "\\frac{16}{2}" }, {kind: "number", value: 8})).toBe(true);
    expect(checkAnswer({ plainText: "not 8", latex: "8" }, {kind: "number", value: 8})).toBe(false);
    expect(checkAnswer({ plainText: "9", latex: "8" }, {kind: "number", value: 8})).toBe(false);
  });
  it("checks tolerance, units, sets, truth and named parts", () => {
    expect(answerMatches("3.14 cm", {kind:"number", value: Math.PI, tolerance: .002, unit:"cm"})).toBe(true);
    expect(answerMatches("3.14 m", {kind:"number", value: Math.PI, tolerance: .002, unit:"cm"})).toBe(false);
    expect(answerMatches("{2,1}", {kind:"set", values:[1,2]})).toBe(true);
    expect(answerMatches("false", {kind:"truth", value:false})).toBe(true);
    expect(answerMatches("a=2;b=3", {kind:"parts", parts:{a:{kind:"number", value:2}, b:{kind:"number", value:3}}})).toBe(true);
    expect(answerMatches("a=2;a=3", {kind:"parts", parts:{a:{kind:"number", value:2}, b:{kind:"number", value:3}}})).toBe(false);
  });
  it("sends concise symbolic computation to semantic checking", () => {
    const result = evaluateDeterministically({phase:"guided_computation_or_proof", response:{plainText:"2+2=4"}, problemText:"Calculate two plus two", reference, attemptCount:1, correctiveCycleCount:0});
    expect(result.requiresAI).toBe(true);
  });
  it("does not use worked steps as partial hints", () => {
    const content = supportContent("partial_step", "guided_computation_or_proof", { ...reference, safeHints: undefined, solutionSteps: ["40 / 5 = 8"] });
    expect(content.content.join(" ")).not.toContain("40 / 5 = 8");
  });
  it("counts repeated diagnoses across distinct sessions", () => {
    expect(recommendDifficulty({currentDifficulty:"Intermediate", recentSessions:[{score:75,supportUsage:0,diagnoses:["invalid_logic","invalid_logic"]},{score:75,supportUsage:0,diagnoses:[]}]}).recommendedDifficulty).toBe("Intermediate");
  });
  it("rejects unsupported and unsafe own-problem inputs", () => {
    expect(() => parseVerifiedProblem("Prove every integer is even", "Counting Principles")).toThrow();
    expect(() => parseVerifiedProblem("permutation: 2, 3", "Counting Principles")).toThrow();
    expect(() => parseVerifiedProblem("mean: 2, 3", "Counting Principles")).toThrow();
    expect(() => solveVerifiedProblem({operation:"permutation",values:[100,50]})).toThrow();
    const preview = verifiedConfirmation("mean: 4, 8, 12", "Measures of Central Tendency");
    expect(preview).not.toHaveProperty("answerSpecification");
    expect(preview.confirmationHash).not.toBe(verifiedConfirmation("mean: 4, 8, 15", "Measures of Central Tendency").confirmationHash);
  });
  it("hashes equivalent object ordering and detects instructional edits", () => {
    expect(contentHash({a:1,b:2})).toBe(contentHash({b:2,a:1}));
    expect(contentHash({answer:8})).not.toBe(contentHash({answer:9}));
  });
  it("observes permanent writes even when BulkWriter.close resolves", async () => {
    const writer = observedWriter({ set: () => Promise.reject(new Error("permanent failure")), close: () => Promise.resolve() } as unknown as FirebaseFirestore.BulkWriter);
    writer.set({} as FirebaseFirestore.DocumentReference, {});
    await expect(writer.close()).rejects.toThrow("1 document writes failed");
  });
});
