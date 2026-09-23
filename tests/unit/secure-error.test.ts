import { describe, expect, it } from "vitest";
import { secureErrorMessage } from "@/lib/secure-error";

describe("secure Firebase error messages", () => {
  it("uses the fallback when a document is missing", () => {
    expect(
      secureErrorMessage({ code: "not-found", message: "not-found" })
    ).toMatch(/could not complete the request/i);
  });

  it("does not expose Firebase's raw internal label", () => {
    expect(
      secureErrorMessage({ code: "internal", message: "internal" })
    ).toBe("Unable to load learning materials.");
  });

  it("preserves structured error details and their correlation reference", () => {
    expect(
      secureErrorMessage({
        code: "failed-precondition",
        message: "failed-precondition",
        details: {
          message: "Review the current privacy notice first.",
          correlationId: "request-123",
        },
      })
    ).toBe("Review the current privacy notice first. Reference: request-123");
  });

  it("uses the caller fallback for an unstructured failure", () => {
    expect(secureErrorMessage(null, "Learning content could not be loaded.")).toBe(
      "Learning content could not be loaded."
    );
  });
});
