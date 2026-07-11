import { describe, expect, it } from "vitest";
import {
  getAdminReviewPath,
  getSessionPath,
  getStudentReviewPath,
} from "@/lib/session-routes";

describe("session route helpers", () => {
  it("always includes and safely encodes the session ID", () => {
    expect(getSessionPath("session/with spaces", "logic_map")).toBe(
      "/session/session%2Fwith%20spaces/logic-map"
    );
    expect(getSessionPath("abc")).toBe("/session/abc/questioning");
  });

  it("builds role-specific review routes", () => {
    expect(getStudentReviewPath("abc/123")).toBe(
      "/student/review/abc%2F123"
    );
    expect(getAdminReviewPath("abc/123")).toBe("/admin/review/abc%2F123");
  });
});
