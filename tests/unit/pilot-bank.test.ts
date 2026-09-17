import { describe, it, expect } from "vitest";
import { buildPilotProblemSeeds } from "../../scripts/problem-bank-v5-core";
import { checkAnswer } from "../../functions/src/answers";
import type { PrivateProblemReference } from "../../functions/src/workflow";
import { REASONING_PHASES } from "@mindguide/contracts";

describe("initial two-topic review bank", () => {
  const seeds = buildPilotProblemSeeds();
  it("contains exactly 18 distinct unapproved problems and three variants per cell", () => {
    expect(seeds).toHaveLength(18);
    expect(new Set(seeds.map(seed => seed.problemText)).size).toBe(18);
    const cells = new Map<string, number>();
    for (const seed of seeds) { expect(seed.status).toBe("draft"); const key = `${seed.topicId}/${seed.difficulty}`; cells.set(key,(cells.get(key)??0)+1); }
    expect([...cells.values()]).toEqual([3,3,3,3,3,3]);
  });
  it.each(seeds)("checks $id and provides safe hints for every phase", seed => {
    const reference = seed.privateSolution as unknown as PrivateProblemReference;
    expect(checkAnswer({plainText: reference.finalAnswer}, reference.answerSpecification)).toBe(true);
    expect(checkAnswer({plainText: "-99999"}, reference.answerSpecification)).toBe(false);
    for (const phase of REASONING_PHASES) for (const level of ["socratic_prompt","targeted_hint","stronger_hint","partial_step"] as const) {
      const hints = reference.safeHints?.[phase]?.[level]; expect(hints?.length).toBeGreaterThan(0);
      for (const hint of hints ?? []) expect(reference.solutionSteps).not.toContain(hint);
    }
  });
});
