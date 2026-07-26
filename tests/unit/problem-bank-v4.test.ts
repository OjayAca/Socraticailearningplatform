import { describe, expect, it } from "vitest";
import { buildSchemaV4ProblemSeeds } from "../../scripts/problem-bank-v4-core";

describe("schema-v4 faculty-gated problem bank", () => {
  const problems = buildSchemaV4ProblemSeeds();

  it("contains three variants for all 33 topic and difficulty cells", () => {
    expect(problems).toHaveLength(99);
    const cells = new Map<string, Set<number>>();
    for (const problem of problems) {
      const key = `${problem.topicId}::${problem.difficulty}`;
      const variants = cells.get(key) ?? new Set<number>();
      variants.add(problem.variant);
      cells.set(key, variants);
    }
    expect(cells.size).toBe(33);
    for (const variants of cells.values()) expect([...variants].sort()).toEqual([1, 2, 3]);
  });

  it("does not claim faculty approval for generated records", () => {
    expect(problems.every((problem) =>
      problem.status === "draft" || problem.status === "pending_validation"
    )).toBe(true);
    expect(problems.filter((problem) => problem.status === "pending_validation")).toHaveLength(33);
    expect(problems.filter((problem) => problem.status === "draft")).toHaveLength(66);
  });

  it("links every variant to protected content and managed references", () => {
    for (const problem of problems) {
      expect(problem.formulaTheoremReferenceIds).toHaveLength(1);
      expect(problem.privateSolution.finalAnswer).toBeTruthy();
      expect(Object.keys(problem.prompts)).toHaveLength(7);
    }
  });
});
