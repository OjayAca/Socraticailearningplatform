import { describe, expect, it } from "vitest";
import { toCsv } from "../reporting.js";
import {
  findForbiddenPublicKeys,
  validateManagedContent,
} from "../validation.js";
import { isStudentMutationAllowed } from "../session-state.js";

describe("administrator hardening helpers", () => {
  it("permits the protected problem solution envelope but rejects public instructional secrets", () => {
    expect(findForbiddenPublicKeys({
      status: "draft",
      privateSolution: { finalAnswer: "42", solutionSteps: ["private"] },
    }, true)).toEqual([]);
    expect(findForbiddenPublicKeys({
      status: "approved",
      nested: { finalAnswer: "leaked" },
    }, true)).toEqual(["content.nested.finalAnswer"]);
  });

  it("validates and strips server-managed problem fields", () => {
    const result = validateManagedContent("problems", "mean-1", {
      subject: "Quantitative Methods",
      topic: "Measures of Central Tendency",
      difficulty: "Basic",
      problemText: "Find the mean of 8, 10, and 12.",
      supportedResponseFormats: ["text", "latex"],
      status: "draft",
      version: 99,
    });
    expect(result.version).toBeUndefined();
    expect(result.problemText).toBe("Find the mean of 8, 10, and 12.");
  });

  it("neutralizes spreadsheet formulas before CSV quoting", () => {
    const csv = toCsv([{ kind: "activity", learner: "=HYPERLINK(\"https://example.test\")" }]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.test\"\")\"");
  });

  it("enforces the terminal session lifecycle matrix", () => {
    expect(isStudentMutationAllowed("in_progress", "support")).toBe(true);
    expect(isStudentMutationAllowed("ready_for_submission", "submit")).toBe(true);
    expect(isStudentMutationAllowed("ready_for_submission", "support")).toBe(false);
    expect(isStudentMutationAllowed("submitted", "finalize")).toBe(false);
    expect(isStudentMutationAllowed("reviewed", "draft")).toBe(false);
    expect(isStudentMutationAllowed("returned", "follow_up")).toBe(true);
    expect(isStudentMutationAllowed("returned", "submit")).toBe(false);
  });
});
