import { describe, expect, it } from "vitest";
import { mindGuideProblems } from "@/data/mindguide-problems";
import {
  SUBJECT_TOPICS,
  type MindGuideDifficulty,
  type Topic,
} from "@/types";

const DIFFICULTIES: MindGuideDifficulty[] = [
  "Basic",
  "Intermediate",
  "Advanced",
];

const topics = Object.values(SUBJECT_TOPICS).flat() as Topic[];

describe("MINDGUIDE curated problem bank", () => {
  it("contains exactly one problem for every topic and difficulty", () => {
    expect(topics).toHaveLength(11);
    expect(mindGuideProblems).toHaveLength(33);

    for (const topic of topics) {
      const topicProblems = mindGuideProblems.filter(
        (problem) => problem.topic === topic
      );
      expect(
        topicProblems.map((problem) => problem.difficulty).sort(),
        `difficulty coverage for ${topic}`
      ).toEqual([...DIFFICULTIES].sort());
    }
  });

  it("uses unique IDs and keeps every answer key complete", () => {
    expect(new Set(mindGuideProblems.map((problem) => problem.id)).size).toBe(
      mindGuideProblems.length
    );

    for (const problem of mindGuideProblems) {
      expect(problem.problemText.trim().length, problem.id).toBeGreaterThan(20);
      expect(problem.expectedConcepts.length, problem.id).toBeGreaterThanOrEqual(2);
      expect(
        Boolean(problem.requiredFormula?.trim() || problem.requiredTheorem?.trim()),
        `${problem.id} formula/theorem`
      ).toBe(true);
      expect(problem.solutionSteps.length, `${problem.id} solution steps`).toBeGreaterThanOrEqual(3);
      expect(problem.solutionSteps.every((step) => step.trim().length > 0), problem.id).toBe(true);
      expect(problem.finalAnswer.trim().length, `${problem.id} final answer`).toBeGreaterThan(5);
      expect(problem.interpretation.trim().length, `${problem.id} interpretation`).toBeGreaterThan(10);
      expect(
        Object.values(problem.socraticPrompts).every(
          (prompt) => prompt.trim().length > 10
        ),
        `${problem.id} Socratic prompts`
      ).toBe(true);
    }
  });

  it("keeps each problem under the subject that owns its topic", () => {
    for (const problem of mindGuideProblems) {
      expect(
        SUBJECT_TOPICS[problem.subject].includes(problem.topic as never),
        `${problem.id} subject/topic pairing`
      ).toBe(true);
    }
  });
});
