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

const bootstrapProfileSchema = z.object({
  requestId,
  displayName: z.string().trim().min(1).max(120),
  consentVersion: z.string().trim().min(1).max(80).optional(),
});

const startSessionSchema = z.discriminatedUnion("mode", [
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
    confirmationHash: z.string().min(1).max(4000).optional(),
  }),
]);

const evaluateResponseSchema = z.object({
  requestId,
  sessionId: z.string().trim().min(1).max(160),
  expectedPhase: z.enum(REASONING_PHASES),
  revision: z.number().int().min(0),
  response: mathResponse,
});

const supportRequestSchema = z.object({
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

const saveDraftSchema = z.object({
  requestId,
  sessionId: z.string().trim().min(1).max(160),
  revision: z.number().int().min(0),
  draft: z.object({
    answer: mathResponse,
    methodology: z.string().trim().min(1).max(4_000),
    reflection: z.string().trim().min(1).max(2_000),
  }),
});

const sessionMutationSchema = z.object({
  requestId,
  sessionId: z.string().trim().min(1).max(160),
});

const revisionedSessionMutationSchema = sessionMutationSchema.extend({
  revision: z.number().int().min(0),
});

const adminSupportOverrideSchema = sessionMutationSchema.extend({
  level: z.enum(["worked_explanation", "full_solution"]),
  reason: z.string().trim().min(8).max(1_000),
});

const adminReviewSchema = sessionMutationSchema.extend({
  outcome: z.enum(["reviewed", "returned"]),
  comment: z.string().trim().min(1).max(2_000),
});

const contentMutationSchema = z.object({
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

const adminUserSchema = z.object({
  requestId,
  userId: z.string().trim().min(1).max(160),
  action: z.enum(["promote", "demote", "suspend", "activate", "deactivate", "anonymize", "reset_access"]),
  reason: z.string().trim().min(4).max(1_000),
});

const auditReason = z.string().trim().min(8).max(1_000);
const deletableContentCollection = z.enum([
  "subjects",
  "topics",
  "problems",
  "formula_theorem_references",
  "socratic_prompt_bank",
  "misconception_categories",
  "difficulty_policies",
]);

const adminDeleteContentSchema = z.object({
  requestId,
  collection: deletableContentCollection,
  id: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  reason: auditReason,
});

const adminPublishAnnouncementSchema = z.object({
  requestId,
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2_000),
  reason: auditReason,
});

const reportQuerySchema = z.object({
  requestId: requestId.optional(),
  kind: z.enum(["learning_progress", "scorecards", "misconceptions", "activity", "usage"]),
  subject: subject.optional(),
  topic: z.string().trim().max(160).optional(),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
  includeIdentity: z.boolean().default(false),
  exportReason: z.string().trim().min(4).max(1_000).optional(),
  limit: z.number().int().min(1).max(1_000).default(100),
  cursor: z.string().max(2000).optional(),
});

const reportExportSchema = reportQuerySchema.extend({
  requestId,
  output: z.enum(["csv", "print"]),
  exportReason: auditReason,
});

const managedStatus = z.enum(["draft", "pending_validation", "approved", "rejected", "archived"]);
const scalarAnswer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("number"), value: z.number().finite(), tolerance: z.number().finite().nonnegative().optional(), unit: z.string().max(40).optional() }),
  z.object({ kind: z.literal("expression"), expression: z.string().min(1).max(1000) }),
  z.object({ kind: z.literal("truth"), value: z.boolean() }),
  z.object({ kind: z.literal("set"), values: z.array(z.number().finite()).max(100) }),
]);
const answerSpecification = z.union([scalarAnswer, z.object({ kind: z.literal("parts"), parts: z.record(z.string().min(1).max(40), scalarAnswer) })]);
const privateProblemSolution = z.object({
  answerSpecification: answerSpecification.optional(),
  rubricVersion: z.string().max(80).optional(),
  safeHints: z.record(z.enum(REASONING_PHASES), z.record(z.enum(["socratic_prompt", "targeted_hint", "stronger_hint", "partial_step"]), z.array(z.string().min(1).max(1000)).min(1).max(4))).optional(),
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
  subjects: z.object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_000),
    status: managedStatus,
  }),
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

const submitProblemValidationSchema = z.object({
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

const bulkImportProblemsSchema = z.object({
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
    if (id === "pilot" || id === "maintenance") throw callableError("invalid-argument", "use_pilot_controls", "Use the typed pilot release controls for maintenance and participant access.");
    const schema = id === "privacy"
      ? z.object({
          policyEvidenceReference: z.string().min(1).max(1000).optional(),
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

const FORBIDDEN_PUBLIC_KEYS = new Set([
  "answerSpecification", "safeHints", "verifiedGivens", "configurationSnapshot",
  "finalAnswer",
  "solutionSteps",
  "referenceAnswer",
  "solutionOutline",
  "privateSolution",
  "socraticPrompts",
  "rubric",
  "rawOutput",
  "apiKey",
]);

export function findForbiddenPublicKeys(
  value: unknown,
  allowRootPrivateSolution: boolean
): string[] {
  const failures: string[] = [];
  const scan = (candidate: unknown, path: string, root: boolean): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => scan(item, `${path}[${index}]`, false));
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (root && key === "privateSolution" && allowRootPrivateSolution) continue;
      if (FORBIDDEN_PUBLIC_KEYS.has(key)) failures.push(`${path}.${key}`);
      scan(nested, `${path}.${key}`, false);
    }
  };
  scan(value, "content", true);
  return failures;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Validate the public operation boundary before any Firestore side effects. */
export function validateOperation(name: string, value: unknown): unknown {
  const schemas: Record<string, z.ZodType> = {
    bootstrapProfile: bootstrapProfileSchema,
    startLearningSession: startSessionSchema,
    evaluatePhaseResponse: evaluateResponseSchema,
    requestSessionSupport: supportRequestSchema,
    saveSessionDraft: saveDraftSchema,
    finalizeScorecard: revisionedSessionMutationSchema,
    submitLearningSession: revisionedSessionMutationSchema,
    abandonLearningSession: sessionMutationSchema,
    createFollowUpSession: sessionMutationSchema,
    adminOverrideSessionSupport: adminSupportOverrideSchema,
    adminReviewSession: adminReviewSchema,
    adminUpsertContent: contentMutationSchema,
    adminArchiveContent: contentMutationSchema,
    adminManageUser: adminUserSchema,
    adminDeleteContent: adminDeleteContentSchema,
    adminPublishAnnouncement: adminPublishAnnouncementSchema,
    adminQueryReport: reportQuerySchema,
    adminExportReport: reportExportSchema,
    adminSubmitProblemValidation: submitProblemValidationSchema,
    adminRecordProblemValidation: recordProblemValidationSchema,
    adminBulkImportProblems: bulkImportProblemsSchema,
  };
  return schemas[name] ? parseInput(schemas[name], value) : value;
}
