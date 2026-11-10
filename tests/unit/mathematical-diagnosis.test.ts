// @vitest-environment node
import { describe, expect, it } from "vitest";
import { diagnoseArithmetic, isBareAnswer } from "../../server/mathematical-diagnosis";
const problem="Given f(x)=x², find the image and preimage of the specified sets.";
describe("specific bounded arithmetic diagnosis",()=>{
  it.each(["f(-2)=-4, image {-4,0,1}","f(-1)=-1", "f(−2) = −4"])("regresses QM-07-B01 L2: %s",plainText=>{
    const d=diagnoseArithmetic({plainText},problem);
    expect(d).toMatchObject({category:"computational_error",confidence:"high"});
    expect(d!.incorrectStep).toMatch(/f\(/);
    expect(d!.correctivePrompt).toContain("two identical factors");
    expect(d!.recommendedAction).toContain("image and preimage");
    expect(d!.explanation).not.toContain("=4");
  });
  it.each(["The total is 4+6+8=20; divide by 3.","18/3=8", "(-2)^2=-4", "2+2=5=4"])("identifies the actual false equality in %s",plainText=>{
    expect(diagnoseArithmetic({plainText},problem)?.incorrectStep).toContain("=");
  });
  it.each(["f(-2)=4", "f(-1)=1", "-2^2=-4", "18/3=6", "0.1+0.2=0.3", "2^-2=0.25", "50%=1/2", "x+2=3", "f(2)=3", "I previously thought 2+2=5; now 2+2=4", "Is 2+2=5?", "The wrong step was 2+2=5", "Suppose 2+2=5", "x+x=2x", "1/0=2"])("does not invent an error in %s",plainText=>{
    expect(diagnoseArithmetic({plainText},"Unspecified function and proof.")).toBeNull();
  });
  it("does not apply the square rule to a shifted function",()=>{
    expect(diagnoseArithmetic({plainText:"f(2)=5"},"Given f(x)=x^2+1")).toBeNull();
  });
  it("does not discard a calculation supplied in the math field",()=>{
    expect(isBareAnswer({plainText:"8",latex:"(4+8+12)/3=8"})).toBe(false);
    expect(isBareAnswer({plainText:"8",latex:"8"})).toBe(true);
  });
  it("defers rounded and modular equalities to contextual assessment",()=>{
    expect(diagnoseArithmetic({plainText:"1/3=0.33"},"Round to two decimal places.")).toBeNull();
    expect(diagnoseArithmetic({plainText:"2+2=0 mod 4"},"Check an equivalence relation.")).toBeNull();
    expect(diagnoseArithmetic({plainText:"1/3=0.33 approximately"},"Find the probability.")).toBeNull();
  });
});
