import { describe, expect, it } from "vitest";
import { VALIDATED_SUBJECTS, VALIDATED_TOPICS, assertCurriculumContent, isValidatedTopic } from "@/data/validated-curriculum";
import { verifiedConfirmation } from "@/lib/learning/verified-problems";
describe("authoritative curriculum", () => {
  it("contains exactly two subjects and twelve unique topic IDs in the supplied order", () => {
    expect(VALIDATED_SUBJECTS.map(item => item.name)).toEqual(["Quantitative Methods", "Discrete Mathematics"]);
    expect(new Set(VALIDATED_TOPICS.map(item => item.id)).size).toBe(12);
    expect(VALIDATED_TOPICS.map(item => item.name)).toEqual(["Functions", "Descriptive Statistics", "Introduction to Probability", "Probability Distributions", "Introduction to Decision Making", "Decision Analysis", "Speaking Mathematically", "Set Theory", "Relations and Functions", "Logic", "Combinatorics", "Discrete Probability"]);
    for (const subject of VALIDATED_SUBJECTS) expect(VALIDATED_TOPICS.filter(item => item.subjectId === subject.id)).toHaveLength(6);
    const ids = VALIDATED_TOPICS.flatMap(topic => topic.subtopics.flatMap(item => [item.id, ...(item.children ?? []).map(child => child.id)]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("preserves the nested descriptive-measures hierarchy", () => {
    const topic = VALIDATED_TOPICS.find(item => item.name === "Descriptive Statistics")!;
    expect(topic.subtopics.map(item => item.name)).toEqual(["Basic Concepts of Statistics", "Collection, Organization, and Presentation of Data", "Frequency Distribution", "Descriptive Measures"]);
    expect(topic.subtopics[3].children?.map(item => item.name)).toEqual(["Central Tendency", "Dispersion", "Position", "Skewness", "Kurtosis"]);
  });
  it("rejects stale IDs, wrong parents, renamed topics, and invented subtopics", () => {
    const topic = VALIDATED_TOPICS[0];
    expect(isValidatedTopic(topic.id, topic)).toBe(true);
    expect(isValidatedTopic("temporary-central-tendency", topic)).toBe(false);
    for (const patch of [{ name: "Calculus" }, { subjectId: "discrete-mathematics" }, { subtopics: [] }]) expect(() => assertCurriculumContent("topics", topic.id, { ...topic, status: "approved", ...patch })).toThrow();
    expect(() => assertCurriculumContent("problems", "question", { topicId: "temporary-central-tendency" })).toThrow();
  });
  it("routes bounded typed problems by stable topic IDs without opening unsupported topics", () => {
    expect(verifiedConfirmation("mean: 4, 8, 12", "quantitative-methods-descriptive-statistics").givens.operation).toBe("mean");
    expect(verifiedConfirmation("combination: 5, 2", "discrete-mathematics-combinatorics").givens.operation).toBe("combination");
    expect(() => verifiedConfirmation("mean: 4, 8, 12", "quantitative-methods-functions")).toThrow();
  });
  it.each(["problems","formula_theorem_references","socratic_prompt_bank","difficulty_policies"])("rejects excluded concepts hidden under an approved %s topic",collection=>{
    for(const text of ["Pigeonhole Principle","linear regression"]) expect(()=>assertCurriculumContent(collection,"content",{topicId:VALIDATED_TOPICS[0].id,statement:text})).toThrow("approved curriculum scope");
  });
  it("allows custom subjects and topics across lifecycle statuses while keeping core curriculum locked", () => {
    expect(() =>
      assertCurriculumContent("subjects", "applied-linear-algebra", {
        name: "Applied Linear Algebra",
        description: "Vectors and eigenvalues.",
        status: "draft",
      }),
    ).not.toThrow();
    expect(() =>
      assertCurriculumContent("subjects", "applied-linear-algebra", {
        name: "Applied Linear Algebra",
        description: "Vectors and eigenvalues.",
        status: "archived",
      }),
    ).not.toThrow();
    expect(() =>
      assertCurriculumContent("topics", "applied-linear-algebra-eigenvalues", {
        subjectId: "applied-linear-algebra",
        subject: "Applied Linear Algebra",
        name: "Eigenvalues",
        status: "draft",
      }),
    ).not.toThrow();
    expect(() =>
      assertCurriculumContent("subjects", "quantitative-methods", {
        name: "Quantitative Methods",
        description: "Core subject",
        status: "draft",
      }),
    ).toThrow("active");
    expect(() =>
      assertCurriculumContent("topics", VALIDATED_TOPICS[0].id, {
        ...VALIDATED_TOPICS[0],
        status: "archived",
      }),
    ).toThrow("active");
  });
});
