import { z } from "zod";
import { REASONING_PHASES } from "@mindguide/contracts";
import { callableError } from "./errors.js";

const requestId = z.string().uuid();
const subject = z.enum(["Quantitative Methods", "Discrete Mathematics"]);
const difficulty = z.enum(["Basic", "Intermediate", "Advanced"]);
const mathResponse = z.object({
  plainText: z.string().max(4_000),
  latex: z.string().max(4_000).optional(),
  normalizedLatex: z.string().max(4_000).optional(),
  mathJson: z.unknown().optional(),
});

export const bootstrapProfileSchema = z.object({
  requestId,
  displayName: z.string().trim().min(1).max(120),
  consentVersion: z.string().trim().min(1).max(80).optional(),
});

export const academicProfileSchema = z.object({
  studentNumber: z.string().trim().min(1).max(80),
  course: z.string().trim().min(1).max(160),
  yearLevel: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(80),
});

export const completeAcademicProfileSchema = academicProfileSchema.extend({ requestId });

export const startSessionSchema = z.discriminatedUnion("mode", [
  z.object({
    requestId,
    mode: z.literal("curated"),
    topicId: z.string().trim().min(1).max(160),
  }),
  z.object({
    requestId,
    mode: z.literal("free_form"),
    topicId: z.string().trim().min(1).max(160),
    question: z.string().trim().min(8).max(2_000),
    requestedDifficulty: difficulty,
  }),
]);

export const evaluateResponseSchema = z.object({
  requestId,
  sessionId: z.string().trim().min(1).max(160),
  expectedPhase: z.enum(REASONING_PHASES),
  revision: z.number().int().min(0),
  response: mathResponse,
});

export const supportRequestSchema = z.object({
  requestId,
  sessionId: z.string().trim().min(1).max(160),
  requestedLevel: z.enum([
    "socratic_prompt",
    "targeted_hint",
    "stronger_hint",
    "partial_step",
    "worked_explanation",
    "full_solution",
  ]),
  revision: z.number().int().min(0),
});

export const saveDraftSchema = z.object({
  requestId,
  sessionId: z.string().trim().min(1).max(160),
  revision: z.number().int().min(0),
  draft: z.object({
    answer: mathResponse,
    methodology: z.string().trim().min(1).max(4_000),
    reflection: z.string().trim().min(1).max(2_000),
  }),
});

export const sessionMutationSchema = z.object({
  requestId,
  sessionId: z.string().trim().min(1).max(160),
});

export const revisionedSessionMutationSchema = sessionMutationSchema.extend({
  revision: z.number().int().min(0),
});

export const adminSupportOverrideSchema = sessionMutationSchema.extend({
  level: z.enum(["worked_explanation", "full_solution"]),
  reason: z.string().trim().min(8).max(1_000),
});

export const adminReviewSchema = sessionMutationSchema.extend({
  outcome: z.enum(["reviewed", "returned"]),
  comment: z.string().trim().min(1).max(2_000),
});

export const contentMutationSchema = z.object({
  requestId,
  collection: z.enum([
    "subjects",
    "topics",
    "problems",
    "formula_theorem_references",
    "socratic_prompt_bank",
    "misconception_categories",
    "difficulty_policies",
    "system_settings",
    "policy_documents",
  ]),
  id: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  value: z.record(z.string(), z.unknown()).optional(),
});

export const adminUserSchema = z.object({
  requestId,
  userId: z.string().trim().min(1).max(160),
  action: z.enum(["promote", "demote", "suspend", "activate", "deactivate", "anonymize", "reset_access"]),
  reason: z.string().trim().min(4).max(1_000),
});

export const reportQuerySchema = z.object({
  requestId: requestId.optional(),
  kind: z.enum(["learning_progress", "scorecards", "misconceptions", "activity", "usage"]),
  subject: subject.optional(),
  topic: z.string().trim().max(160).optional(),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
  includeIdentity: z.boolean().default(false),
  exportReason: z.string().trim().min(4).max(1_000).optional(),
  limit: z.number().int().min(1).max(1_000).default(100),
});

const managedStatus = z.enum(["draft", "pending_validation", "approved", "rejected", "archived"]);
const privateProblemSolution = z.object({
  expectedConcepts: z.array(z.string().trim().min(1).max(160)).min(1).max(30),
  requiredFormula: z.string().max(1_000).nullable().optional(),
  requiredTheorem: z.string().max(1_000).nullable().optional(),
  solutionSteps: z.array(z.string().trim().min(1).max(2_000)).min(1).max(30).optional(),
  workedSteps: z.array(z.string().trim().min(1).max(2_000)).min(1).max(30).optional(),
  finalAnswer: z.string().trim().min(1).max(4_000),
  interpretation: z.string().trim().min(1).max(4_000),
  socraticPrompts: z.record(z.string(), z.string().max(1_000)).optional(),
}).superRefine((value, context) => {
  if (!value.solutionSteps && !value.workedSteps) {
    context.addIssue({ code: "custom", path: ["workedSteps"], message: "Protected worked steps are required." });
  }
}).transform((value) => {
  const { workedSteps, ...rest } = value;
  return { ...rest, solutionSteps: value.solutionSteps ?? workedSteps! };
});

const managedSchemas = {
  subjects: z.object({ name: z.string().trim().min(1).max(160), status: managedStatus }),
  topics: z.object({
    subjectId: z.string().trim().min(1).max(160),
    subject: subject.optional(),
    name: z.string().trim().min(1).max(160),
    status: managedStatus,
  }),
  problems: z.object({
    subjectId: z.string().trim().min(1).max(160),
    topicId: z.string().trim().min(1).max(160),
    subject,
    topic: z.string().trim().min(1).max(160),
    difficulty,
    variant: z.number().int().min(1).max(3),
    problemText: z.string().trim().min(8).max(4_000),
    supportedResponseFormats: z.array(z.enum(["text", "latex"])).min(1),
    formulaTheoremReferenceIds: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
    status: managedStatus,
    privateSolution: privateProblemSolution.optional(),
  }),
  formula_theorem_references: z.object({
    kind: z.enum(["formula", "theorem"]),
    statement: z.string().trim().min(1).max(2_000),
    variables: z.array(z.unknown()).default([]),
    conditions: z.array(z.string().max(1_000)).default([]),
    domain: z.string().trim().min(1).max(160),
    supportedTopics: z.array(z.string().max(160)).default([]),
    equivalentNotation: z.array(z.string().max(1_000)).default([]),
    status: managedStatus,
  }),
  socratic_prompt_bank: z.object({
    problemId: z.string().trim().min(1).max(160),
    phase: z.enum(REASONING_PHASES),
    prompt: z.string().trim().min(1).max(1_000),
    status: managedStatus,
  }),
  misconception_categories: z.object({
    name: z.string().trim().min(1).max(160),
    phases: z.array(z.enum(REASONING_PHASES)).default([]),
    correctivePrompt: z.string().trim().min(1).max(1_000).optional(),
    priority: z.number().int().min(0).max(100).default(0),
    status: managedStatus,
  }),
  difficulty_policies: z.object({
    subjectId: z.string().trim().min(1).max(160).nullable().optional(),
    topicId: z.string().trim().min(1).max(160).nullable().optional(),
    minimumCompletedSessions: z.number().int().min(1).max(100),
    increaseScoreThreshold: z.number().min(0).max(100),
    decreaseScoreThreshold: z.number().min(0).max(100),
    maxHintsForIncrease: z.number().int().min(0).max(100),
    arithmeticErrorAloneLowersDifficulty: z.boolean(),
    status: managedStatus,
  }),
  policy_documents: z.object({
    version: z.string().trim().min(1).max(80).optional(),
    title: z.string().trim().min(1).max(240),
    status: z.enum(["draft", "active", "archived"]),
    summary: z.string().trim().min(1).max(4_000),
    collectedData: z.array(z.string().max(500)).default([]),
    purpose: z.string().trim().min(1).max(2_000),
    retention: z.string().trim().min(1).max(2_000),
  }),
} as const;

export const submitProblemValidationSchema = z.object({
  requestId,
  problemId: z.string().trim().min(1).max(160),
});

export const recordProblemValidationSchema = submitProblemValidationSchema.extend({
  syllabusReference: z.string().trim().min(1).max(500),
  contentMatrixItem: z.string().trim().min(1).max(240),
  validatorName: z.string().trim().min(1).max(160),
  validatorRole: z.string().trim().min(1).max(160),
  validationDate: z.number().int().positive(),
  evidenceReference: z.string().trim().min(1).max(1_000),
  evidenceHash: z.string().trim().min(16).max(256),
  decision: z.enum(["approved", "rejected"]),
});

export const bulkImportProblemsSchema = z.object({
  requestId,
  dryRun: z.boolean(),
  problems: z.array(z.object({
    id: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
    subjectId: z.string().trim().min(1).max(160),
    topicId: z.string().trim().min(1).max(160),
    subject,
    topic: z.string().trim().min(1).max(160),
    difficulty,
    variant: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    problemText: z.string().trim().min(8).max(4_000),
    supportedResponseFormats: z.array(z.enum(["text", "latex"])).min(1),
    formulaTheoremReferenceIds: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
    privateSolution: privateProblemSolution,
  })).min(1).max(100),
});

export function validateManagedContent(
  collection: string,
  id: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  if (collection === "system_settings") {
    const schema = id === "privacy"
      ? z.object({
          currentConsentVersion: z.string().trim().min(1).max(80),
          aiLogRetentionDays: z.number().int().min(1).max(3650).optional(),
          identifiableRetentionMonths: z.number().min(0).max(120).optional(),
          sessionInactivityHours: z.number().min(1).max(720).optional(),
          studyClosedAt: z.unknown().nullable().optional(),
        })
      : z.record(z.string(), z.unknown());
    return parseInput(schema, value) as Record<string, unknown>;
  }
  const schema = managedSchemas[collection as keyof typeof managedSchemas];
  if (!schema) throw callableError("invalid-argument", "unsupported_content_collection", "This content collection is not supported.");
  return parseInput(schema as z.ZodType<unknown>, value) as Record<string, unknown>;
}

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw callableError(
      "invalid-argument",
      "invalid_request",
      first?.message || "Invalid request data."
    );
  }
  return result.data;
}
