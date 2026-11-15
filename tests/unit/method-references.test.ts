import { describe, expect, it } from "vitest";
import { METHOD_REFERENCES } from "../../src/lib/learning/method-references";
import { solveVerifiedProblem } from "../../src/lib/learning/verified-problems";
import { containsExcludedContent } from "../../src/data/validated-curriculum";
import {
  conditionPromptForMethod,
  evaluateConditionEquivalence,
  isBareMethodSelection,
  leaksFutureCheckpoint,
  validateJustificationBySubject,
} from "../../server/tutor-dialogue";

describe("bounded mathematical reference conditions",()=>{
  it("every supported method has an application condition, misconception and justification",()=>{
    for(const [operation,ref] of Object.entries(METHOD_REFERENCES)) {
      expect(ref.name,operation).toBeTruthy();expect(ref.statement,operation).toBeTruthy();
      expect(ref.conditions.length,operation).toBeGreaterThan(0);
      expect(ref.commonMisconceptions.length,operation).toBeGreaterThan(0);
      expect(ref.acceptedJustifications.length,operation).toBeGreaterThan(0);
      expect(ref.equivalentConditions?.length,operation).toBeGreaterThan(0);
      expect(ref.domain,operation).toMatch(/^(Quantitative Methods|Discrete Mathematics)$/);
      expect(containsExcludedContent(ref),operation).toBe(false);
    }
  });
  it("distinguishes sample and population denominators using checked examples",()=>{
    const sample=solveVerifiedProblem({operation:"sample variance",values:[2,4,6]});
    const population=solveVerifiedProblem({operation:"population variance",values:[2,4,6]});
    expect(sample.finalAnswer).toBe("4");expect(Number(population.finalAnswer)).toBeCloseTo(8/3);
    expect(sample.methodReference!.conditions).toContain("The observations form a sample; n >= 2");
    expect(population.methodReference!.conditions).toContain("The dataset is the full population; n >= 1");
  });
  it("keeps order and replacement assumptions explicit for counting",()=>{
    expect(solveVerifiedProblem({operation:"combination",values:[5,2]}).finalAnswer).toBe("10");
    expect(solveVerifiedProblem({operation:"permutation",values:[5,2]}).finalAnswer).toBe("20");
    expect(METHOD_REFERENCES.combination.conditions).toContain("Order does not matter");
    expect(METHOD_REFERENCES.permutation.conditions).toContain("Order matters");
    expect(METHOD_REFERENCES.permutation.conditions).toContain("No replacement");
  });
  it("does not use frequency ratios without an equal likelihood condition",()=>{
    expect(METHOD_REFERENCES.probability.conditions).toContain("Outcomes are equally likely");
    expect(solveVerifiedProblem({operation:"probability",values:[2,8]}).finalAnswer).toBe("0.25");
  });

  it("recognizes mathematically equivalent condition paraphrases and rejects negated or contradictory claims", () => {
    const meanRef = solveVerifiedProblem({ operation: "mean", values: [4, 8, 12] });
    for (const paraphrase of [
      "Each value has equal weight.",
      "All observations contribute equally.",
      "Every data point is treated with the same importance.",
    ]) {
      const eq = evaluateConditionEquivalence({ plainText: paraphrase }, meanRef);
      expect(eq.matched, paraphrase).toBe(true);
      expect(eq.contradicted, paraphrase).toBe(false);
      expect(isBareMethodSelection({ plainText: paraphrase }, meanRef), paraphrase).toBe(false);
    }

    const negatedMean = evaluateConditionEquivalence(
      { plainText: "Use the mean because the observations do not have equal weight." },
      meanRef,
    );
    expect(negatedMean.matched).toBe(false);
    expect(negatedMean.contradicted).toBe(true);

    const sampleVarRef = solveVerifiedProblem({ operation: "sample variance", values: [2, 4, 6] });
    const wrongDenominator = validateJustificationBySubject(
      { plainText: "We divide by N because this is the entire population." },
      sampleVarRef,
      "Quantitative Methods",
    );
    expect(wrongDenominator.valid).toBe(false);
    expect(wrongDenominator.contradicted).toBe(true);

    const combRef = solveVerifiedProblem({ operation: "combination", values: [6, 2] });
    const wrongOrder = validateJustificationBySubject(
      { plainText: "Use combinations because order matters in the arrangement." },
      combRef,
      "Discrete Mathematics",
    );
    expect(wrongOrder.valid).toBe(false);
    expect(wrongOrder.contradicted).toBe(true);
  });

  it("generates formula-specific condition prompts and blocks future checkpoint leakage in Stage 1", () => {
    const meanRef = solveVerifiedProblem({ operation: "mean", values: [4, 8, 12] });
    expect(conditionPromptForMethod({ requiredFormula: "mean" }, "Quantitative Methods")).toBe(
      "Why is the arithmetic mean appropriate for this dataset?",
    );
    expect(leaksFutureCheckpoint("Apply x̄ = (Σx)/n to the dataset.", "problem_understanding", "targeted_hint", meanRef)).toBe(true);
    expect(leaksFutureCheckpoint("Identify the three given observations and what needs to be determined.", "problem_understanding", "targeted_hint", meanRef)).toBe(false);
  });
});
