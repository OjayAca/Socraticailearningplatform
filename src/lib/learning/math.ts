import { ComputeEngine } from "@cortex-js/compute-engine";
import type { MathResponse } from "@mindguide/contracts";
import { callableError } from "./errors.js";
import { DANGEROUS_LATEX_RE } from "./latex-security.js";

const computeEngine = new ComputeEngine();

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
  if (latex && DANGEROUS_LATEX_RE.test(latex)) {
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

