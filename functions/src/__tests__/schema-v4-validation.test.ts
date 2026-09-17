import { describe, expect, it } from "vitest";
import {
  completeAcademicProfileSchema,
  adminDeleteContentSchema,
  adminDeleteUserSchema,
  adminPublishAnnouncementSchema,
  reportExportSchema,
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

  it("requires confirmation and audit context for P1 administrative operations", () => {
    expect(adminDeleteUserSchema.safeParse({ requestId, userId: "student-1", confirmationEmail: "student@example.com", reason: "Approved capstone deletion" }).success).toBe(true);
    expect(adminDeleteUserSchema.safeParse({ requestId, userId: "student-1", confirmationEmail: "not-an-email", reason: "Approved capstone deletion" }).success).toBe(false);
    expect(adminDeleteContentSchema.safeParse({ requestId, collection: "problems", id: "draft-problem", reason: "Unused rejected draft" }).success).toBe(true);
    expect(adminDeleteContentSchema.safeParse({ requestId, collection: "system_settings", id: "privacy", reason: "Not permitted here" }).success).toBe(false);
    expect(adminPublishAnnouncementSchema.safeParse({ requestId, title: "Reminder", message: "Review your active learning sessions.", reason: "Capstone learner notice" }).success).toBe(true);
    expect(reportExportSchema.safeParse({ requestId, kind: "learning_progress", includeIdentity: false, output: "print", exportReason: "Faculty evaluation report" }).success).toBe(true);
  });
});
