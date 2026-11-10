import { describe, expect, it } from "vitest";
import { METHOD_REFERENCES } from "../../src/lib/learning/method-references";
import { solveVerifiedProblem } from "../../src/lib/learning/verified-problems";
import { containsExcludedContent } from "../../src/data/validated-curriculum";

describe("bounded mathematical reference conditions",()=>{
  it("every supported method has an application condition, misconception and justification",()=>{
    for(const [operation,ref] of Object.entries(METHOD_REFERENCES)) {
      expect(ref.name,operation).toBeTruthy();expect(ref.statement,operation).toBeTruthy();
      expect(ref.conditions.length,operation).toBeGreaterThan(0);
      expect(ref.commonMisconceptions.length,operation).toBeGreaterThan(0);
      expect(ref.acceptedJustifications.length,operation).toBeGreaterThan(0);
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
});
