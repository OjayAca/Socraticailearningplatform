import { ComputeEngine } from "@cortex-js/compute-engine";
import type { MathResponse } from "@mindguide/contracts";
import { callableError } from "./errors.js";

const computeEngine = new ComputeEngine();
const UNSUPPORTED_LATEX = /\\(includegraphics|href|url|htmlClass|htmlId|style|class|begin\s*\{(?:tikzpicture|picture)\})/i;

export function normalizeMathResponse(input: MathResponse): MathResponse {
  const plainText = String(input?.plainText ?? "").trim().slice(0, 4_000);
  const latex = typeof input?.latex === "string" ? input.latex.trim().slice(0, 4_000) : "";
  if (!plainText && !latex) {
    throw callableError(
      "invalid-argument",
      "empty_response",
      "Enter a relevant explanation or mathematical response before continuing."
    );
  }
  if (latex && UNSUPPORTED_LATEX.test(latex)) {
    throw callableError(
      "invalid-argument",
      "unsupported_notation",
      "The response contains unsupported graphical or external LaTeX commands."
    );
  }
  if (!latex) return { plainText };

  try {
    const expression = computeEngine.parse(latex);
    const mathJson = expression.json;
    if (JSON.stringify(mathJson).includes('"Error"')) {
      throw new Error("parse error");
    }
    return {
      plainText,
      latex,
      normalizedLatex: expression.latex,
      mathJson,
    };
  } catch {
    throw callableError(
      "invalid-argument",
      "invalid_latex",
      "The mathematical notation could not be parsed. Check the expression and try again."
    );
  }
}

export function mathematicalEquivalent(left: string, right: string): boolean {
  if (!left.trim() || !right.trim()) return false;
  try {
    const leftExpression = computeEngine.parse(left);
    const rightExpression = computeEngine.parse(right);
    return leftExpression.isEqual(rightExpression) === true;
  } catch {
    return false;
  }
}
