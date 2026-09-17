import { ComputeEngine } from "@cortex-js/compute-engine";
import type { MathResponse } from "@mindguide/contracts";

/** Private only. Display prose is deliberately not an answer specification. */
export type AnswerSpecification =
  | { kind: "number"; value: number; tolerance?: number; unit?: string }
  | { kind: "expression"; expression: string }
  | { kind: "truth"; value: boolean }
  | { kind: "set"; values: number[] }
  | { kind: "parts"; parts: Record<string, Exclude<AnswerSpecification, { kind: "parts" }>> };

const engine = new ComputeEngine();
const numericSyntax = /^[\d\s.+\-*/(){}\\%a-z]+$/i;
function numberValue(text: string): number | null {
  if (!numericSyntax.test(text) || /[a-z]/i.test(text.replace(/\\(?:frac|dfrac|sqrt|left|right)/g, ""))) return null;
  try {
    const parsed = engine.parse(text.replace(/\\%/g, "%").replace(/(\d+(?:\.\d+)?)%/g, "($1/100)"));
    if (JSON.stringify(parsed.json).includes('"Error"')) return null;
    const evaluated = parsed.N();
    if (evaluated.im !== 0) return null;
    const value = evaluated.re;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch { return null; }
}

export function answerMatches(text: string, specification: AnswerSpecification): boolean {
  text = text.trim();
  if (!text || /\b(?:not|never|incorrect|false answer)\b/i.test(text)) return false;
  switch (specification.kind) {
    case "number": {
      if (!Number.isFinite(specification.value) || !Number.isFinite(specification.tolerance ?? 0) || (specification.tolerance ?? 0) < 0) return false;
      if (specification.unit) {
        if (!text.endsWith(specification.unit)) return false;
        text = text.slice(0, -specification.unit.length).trim();
      }
      const value = numberValue(text);
      return value !== null && Math.abs(value - specification.value) <= (specification.tolerance ?? 0);
    }
    case "truth": return text.toLowerCase() === String(specification.value);
    case "expression": {
      if (!/^[\w\s.+\-*/^(){}\\=]+$/.test(text) || /\b[a-z]{3,}\b/i.test(text.replace(/\\[a-z]+/gi, ""))) return false;
      try {
        const actual = engine.parse(text), expected = engine.parse(specification.expression);
        if (JSON.stringify([actual.json, expected.json]).includes('"Error"')) return false;
        return actual.isEqual(expected) === true;
      } catch { return false; }
    }
    case "set": {
      if (!/^\{.*\}$/.test(text)) return false;
      const body = text.slice(1, -1).trim();
      const values = body ? body.split(",").map(numberValue) : [];
      if (values.some(value => value === null)) return false;
      const actual = [...new Set(values)].sort(), expected = [...new Set(specification.values)].sort();
      return JSON.stringify(actual) === JSON.stringify(expected);
    }
    case "parts": {
      const entries = text.split(";").map(part => part.split("="));
      if (entries.some(entry => entry.length !== 2)) return false;
      const parts = Object.fromEntries(entries.map(([key, value]) => [key.trim(), value.trim()]));
      return entries.length === Object.keys(specification.parts).length && Object.keys(parts).length === entries.length
        && Object.entries(specification.parts).every(([key, spec]) => typeof parts[key] === "string" && answerMatches(parts[key], spec));
    }
  }
}

export function checkAnswer(response: MathResponse, spec?: AnswerSpecification): boolean {
  if (!spec) return false;
  const math = response.normalizedLatex || response.latex;
  // Prose alongside notation may explain it, but must not contradict it.
  if (/\b(?:not|never|incorrect)\b/i.test(response.plainText)) return false;
  if (math && response.plainText.trim()) {
    const words: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
    let stated = response.plainText.trim().replace(/^the (?:answer|mean|median|mode|result|variance) is\s+/i, "").replace(/\.$/, "");
    stated = words[stated.toLowerCase()] ?? stated;
    if (!answerMatches(stated, spec)) return false;
  }
  return answerMatches(math || response.plainText, spec);
}

export function hasMathematicalStructure(text: string): boolean {
  return text.split("=").every(part => numberValue(part.trim()) !== null);
}
