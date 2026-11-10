import type { MathResponse } from "../packages/contracts/src/index";
import { numericValue } from "./gemini";

export interface MathematicalDiagnosis {
  category: "computational_error";
  incorrectStep: string;
  explanation: string;
  correctivePrompt: string;
  recommendedAction: string;
  confidence: "high";
}
const normalize = (value: string) => value.replace(/−/g,"-").replace(/[×·]/g,"*").replace(/÷/g,"/").replace(/²/g,"^2").replace(/³/g,"^3");
const unequal = (left: number, right: number) => Math.abs(left-right) > 1e-9 * Math.max(1,Math.abs(left),Math.abs(right));
export function isBareAnswer(response: MathResponse): boolean {
  const bare = (value:string) => /^(?:(?:the\s+)?(?:answer|result)\s+is\s+|[a-z]\s*=\s*)?(?:[+-]?\d+(?:\.\d+)?|true|false|\{[\d,\s+.-]*\})[.!]?$/i.test(normalize(value).trim());
  return [response.plainText,response.latex].filter(value=>value?.trim()).every(value=>bare(value!));
}

/** Checks explicit asserted arithmetic only; never treats unsupported proof prose as wrong. */
export function diagnoseArithmetic(response: MathResponse, problem: string): MathematicalDiagnosis | null {
  const source = normalize([response.plainText,response.latex ?? ""].join("\n")).slice(0,8001);
  const context = `${problem}\n${source}`;
  // Ordinary-real equality is not a verifier for modular arithmetic or rounded equalities.
  if (/\b(?:mod|modulo)\b|≡/i.test(context)) return null;
  const rounded = /\b(?:rounded|rounding|approximately|approximate|decimal places|significant figures)\b|≈/i.test(context);
  const squareDefinition = /\bf\s*\(\s*x\s*\)\s*=\s*x\s*\^\s*2(?![\w^]|\s*[+*/-])/i.test(normalize(problem));
  for (const clause of source.split(/[;\n,]|(?<=[\d)])\.(?=\s|$)/)) {
    // Quoted, conditional and explicitly rejected work needs contextual assessment.
    if (/[?"“”]/.test(clause) || /\b(?:if|suppose|wrong|incorrect|not|mistake|thought|instead|previously)\b/i.test(clause)) continue;
    if (squareDefinition) {
      const match = clause.match(/\bf\(\s*([+-]?\d+(?:\.\d+)?)\s*\)\s*=\s*([+-]?\d+(?:\.\d+)?)(?![\w.]|\s*[+*/^=-])/);
      if (match && unequal(Number(match[1]) ** 2, Number(match[2]))) return {
        category:"computational_error", incorrectStep:match[0], confidence:"high",
        explanation:"The stated function squares its input. The asserted output does not equal that input multiplied by itself.",
        correctivePrompt:`In ${match[0]}, write the input as two identical factors. What sign results when you multiply them?`,
        recommendedAction:"Recalculate this function value, then check the image and preimage using the corrected mapping.",
      };
    }
    // Boundaries prevent interpreting a fragment of x+2=3 or a function call as arithmetic.
    if (rounded) continue;
    const equalities = clause.matchAll(/(?<![\w.(+*/^=-])([+-]?(?:\d|\()[\d.eE+*/()^%\s-]*\s*=\s*[+-]?(?:\d|\()[\d.eE+*/()^%\s=-]*)(?![\w.(])/g);
    for (const match of equalities) {
      const statement = match[1].trim();
      const parts = statement.split("=");
      const values = parts.map(numericValue);
      if (values.length < 2 || values.some(v=>v===null)) continue;
      if (values.slice(1).some((v,i)=>unequal(values[i]!,v!))) return {
        category:"computational_error",incorrectStep:statement,confidence:"high",
        explanation:"The two sides of this asserted arithmetic equality have different values when evaluated with the usual order of operations.",
        correctivePrompt:`Check ${statement} one operation at a time. Which equality first stops preserving the value?`,
        recommendedAction:"Recompute the indicated equality and show the corrected intermediate step before continuing.",
      };
    }
  }
  return null;
}
