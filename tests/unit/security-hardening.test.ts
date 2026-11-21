import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { educationalContext, exposesAnswer, type Turn } from "../../server/gemini";
import { diagnoseArithmetic } from "../../server/mathematical-diagnosis";
import { MathInput } from "../../src/app/components/MathInput";
import { normalizeMathResponse } from "../../src/lib/learning/math";
import { toCsv } from "../../src/lib/learning/reporting";
import { validateOperation } from "../../src/lib/learning/validation";
import { getNotificationActionUrl, isSafeInternalRoute } from "../../src/stores/notification-store";

afterEach(cleanup);

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    feedback: "Good start.",
    question: "Can you explain the next step?",
    accepted: false,
    confidence: "high",
    category: "none",
    evidence: ["I started checking the values."],
    intent: "answer",
    leaksSolution: false,
    ...overrides,
  };
}

describe("security hardening regression suite", () => {
  it("blocks backslash open-redirect payloads and control characters in internal notification routes", () => {
    expect(isSafeInternalRoute("/student/history")).toBe(true);
    expect(isSafeInternalRoute("/session/abc123/learn")).toBe(true);
    expect(isSafeInternalRoute("/\\evil.com")).toBe(false);
    expect(isSafeInternalRoute("//evil.com")).toBe(false);
    expect(isSafeInternalRoute("/student\\profile")).toBe(false);
    expect(isSafeInternalRoute("/student/history\r\nSet-Cookie: a=b")).toBe(false);
    expect(isSafeInternalRoute("https://evil.com")).toBe(false);

    expect(
      getNotificationActionUrl(
        { id: "n1", actionUrl: "/\\evil.com" } as never,
        "student",
      ),
    ).toBeUndefined();
    expect(
      getNotificationActionUrl(
        { id: "n2", actionUrl: "/student/history" } as never,
        "student",
      ),
    ).toBe("/student/history");
  });

  it("detects markdown-wrapped answer reveals and verbatim solutionSteps in exposesAnswer without false positives", () => {
    const reference = {
      finalAnswer: "8",
      solutionSteps: [
        "Add the three observations 4, 8, and 12 to obtain 24, then divide by 3.",
      ],
      answerSpecification: { kind: "number", value: 8 },
    };

    expect(exposesAnswer(makeTurn({ feedback: "**Final Answer:** 8" }), reference)).toBe(true);
    expect(exposesAnswer(makeTurn({ feedback: "_Solution:_ 8" }), reference)).toBe(true);
    expect(exposesAnswer(makeTurn({ feedback: "The `correct answer` is 8." }), reference)).toBe(true);
    expect(
      exposesAnswer(
        makeTurn({
          feedback: "Here is what you do: Add the three observations 4, 8, and 12 to obtain 24, then divide by 3.",
        }),
        reference,
      ),
    ).toBe(true);

    expect(
      exposesAnswer(
        makeTurn({
          feedback: "You identified the three observations.",
          question: "How do you combine them to find the average?",
        }),
        reference,
      ),
    ).toBe(false);
  });

  it("omits finalAnswer, solutionSteps, and interpretation during opening intent in educationalContext", () => {
    const baseContext = {
      session: {
        subject: "Quantitative Methods",
        topic: "Descriptive Statistics",
        topicId: "quantitative-methods-descriptive-statistics",
        difficulty: "Basic",
        originalQuestion: "Find the mean of 4, 8, and 12.",
        currentPhase: "problem_understanding",
      },
      reference: {
        expectedConcepts: ["mean"],
        solutionSteps: ["Sum the values and divide by 3."],
        finalAnswer: "8",
        interpretation: "The mean value is 8.",
      },
      messages: [],
    };

    const opening = educationalContext({ ...baseContext, intent: "opening" });
    expect(opening.reference.finalAnswer).toBeUndefined();
    expect(opening.reference.solutionSteps).toBeUndefined();
    expect(opening.reference.interpretation).toBeUndefined();

    const score = educationalContext({ ...baseContext, intent: "score" });
    expect(score.reference.finalAnswer).toBe("8");
    expect(score.reference.solutionSteps).toEqual(["Sum the values and divide by 3."]);
  });

  it("neutralizes leading-whitespace and newline CSV formula injection payloads", () => {
    const csv = toCsv([
      {
        learner: " =HYPERLINK(\"https://evil.example\",\"click\")",
        note: "\n=CMD|'/C calc'!A0",
        safe: "Normal text",
      },
    ]);
    expect(csv).toContain("\"' =HYPERLINK");
    expect(csv).toContain("\"'\n=CMD");
    expect(csv).toContain("\"Normal text\"");
  });

  it("preserves \\displaystyle while rejecting \\style, \\htmlData, and \\def in normalizeMathResponse", () => {
    expect(() =>
      normalizeMathResponse({ plainText: "", latex: "\\displaystyle \\frac{1}{2}" }),
    ).not.toThrow();

    expect(() =>
      normalizeMathResponse({ plainText: "", latex: "\\style{color:red}{x}" }),
    ).toThrow(/unsupported/i);

    expect(() =>
      normalizeMathResponse({ plainText: "", latex: "\\htmlData{key=val}{x}" }),
    ).toThrow(/unsupported/i);

    expect(() =>
      normalizeMathResponse({ plainText: "", latex: "\\def\\a{\\a\\a}\\a" }),
    ).toThrow(/unsupported/i);
  });

  it("enforces schema validation on checkLearningSessionActivity and bounds mathJson depth", () => {
    expect(() => validateOperation("checkLearningSessionActivity", {})).toThrow();
    expect(
      validateOperation("checkLearningSessionActivity", { sessionId: "session-1" }),
    ).toEqual({ sessionId: "session-1" });

    let deepJson: unknown = "leaf";
    for (let i = 0; i < 12; i += 1) {
      deepJson = [deepJson];
    }
    expect(() =>
      validateOperation("evaluatePhaseResponse", {
        requestId: "123e4567-e89b-42d3-a456-426614174000",
        sessionId: "session-1",
        expectedPhase: "problem_understanding",
        revision: 0,
        response: { plainText: "x", mathJson: deepJson },
      }),
    ).toThrow();
  });

  it("evaluates diagnoseArithmetic in linear time on crafted space/digit inputs", () => {
    const crafted = `1${" ".repeat(4000)}2`;
    const started = performance.now();
    const result = diagnoseArithmetic({ plainText: crafted }, "Find 1 + 2.");
    const elapsedMs = performance.now() - started;
    expect(result).toBeNull();
    expect(elapsedMs).toBeLessThan(50);
  });

  it("bounds MathInput KaTeX preview length and disables macro expansion/trust", () => {
    render(
      createElement(MathInput, {
        value: { plainText: "", latex: "\\def\\a{\\a\\a}\\a" },
        onChange: () => undefined,
      }),
    );
    expect(
      screen.getByText("Check the mathematical notation before submitting."),
    ).toBeVisible();

    cleanup();
    render(
      createElement(MathInput, {
        maxLength: 20,
        value: { plainText: "", latex: "x + ".repeat(10) },
        onChange: () => undefined,
      }),
    );
    expect(
      screen.getByText("Mathematical notation exceeds the maximum allowed length."),
    ).toBeVisible();
  });
});
