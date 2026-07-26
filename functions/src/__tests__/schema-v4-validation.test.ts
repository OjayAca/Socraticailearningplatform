import { describe, expect, it } from "vitest";
import {
  completeAcademicProfileSchema,
  recordProblemValidationSchema,
  startSessionSchema,
} from "../validation.js";

describe("schema-v4 callable validation", () => {
  const requestId = "9f3a52bc-82f5-4d44-93df-17eb6f4d0c8a";

  it("requires all four academic profile fields", () => {
    expect(completeAcademicProfileSchema.safeParse({
      requestId,
      studentNumber: "2026-001",
      course: "BS Information Technology",
      yearLevel: "4",
      section: "A",
    }).success).toBe(true);
    expect(completeAcademicProfileSchema.safeParse({
      requestId,
      studentNumber: "2026-001",
      course: "",
      yearLevel: "4",
      section: "A",
    }).success).toBe(false);
  });

  it("accepts only topic-driven start requests", () => {
    expect(startSessionSchema.safeParse({
      requestId,
      mode: "curated",
      topicId: "quantitative-methods-probability",
    }).success).toBe(true);
    expect(startSessionSchema.safeParse({
      requestId,
      mode: "curated",
      problemId: "legacy-problem",
    }).success).toBe(false);
  });

  it("requires defensible validation evidence", () => {
    expect(recordProblemValidationSchema.safeParse({
      requestId,
      problemId: "qm-mean-basic",
      syllabusReference: "UC-QM-2026",
      contentMatrixItem: "QM-MCT-B-1",
      validatorName: "Faculty Validator",
      validatorRole: "Subject Matter Expert",
      validationDate: Date.now(),
      evidenceReference: "signed-content-matrix.pdf#QM-MCT-B-1",
      evidenceHash: "0123456789abcdef0123456789abcdef",
      decision: "approved",
    }).success).toBe(true);
  });
});
