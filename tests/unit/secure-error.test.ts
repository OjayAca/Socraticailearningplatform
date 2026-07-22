import { describe, expect, it } from "vitest";
import { secureErrorMessage } from "@/lib/secure-error";

describe("secure Firebase error messages", () => {
  it("explains when callable Functions have not been deployed", () => {
    expect(
      secureErrorMessage({ code: "functions/not-found", message: "not-found" })
    ).toMatch(/not deployed for this environment/i);
  });

  it("does not expose Firebase's raw internal label", () => {
    expect(
      secureErrorMessage({ code: "functions/internal", message: "internal" })
    ).toBe("MINDGUIDE could not complete the request. Please try again.");
  });

  it("preserves typed callable details and their correlation reference", () => {
    expect(
      secureErrorMessage({
        code: "functions/failed-precondition",
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
