import { validateOperation } from "./learning/validation";
import type {
  AdminBulkImportProblemsRequest,
  AdminDeleteContentRequest,
  AdminPublishAnnouncementRequest,
  AdminRecordProblemValidationRequest,
  AdminReviewSessionRequest,
  BootstrapProfileRequest,
  CatalogReadinessResponse,
  ContentMutationRequest,
  EvaluatePhaseResponseRequest,
  EvaluatePhaseResponseResponse,
  GetCurrentConsentNoticeResponse,
  LearningCatalog,
  ReportQueryRequest,
  ReportQueryResponse,
  ReportExportRequest,
  ReportExportResponse,
  RequestSupportRequest,
  RequestSupportResponse,
  SaveSessionDraftRequest,
  SessionMutationResponse,
  StartLearningSessionInput,
} from "@mindguide/contracts";
import { auth } from "./firebase";
import { AI_OPERATIONS, aiOperation } from "./ai-client";
import { secureErrorMessage } from "./secure-error";

function newRequestId(): string {
  return crypto.randomUUID();
}

export async function resumeTutorOpening(sessionId: string, revision: number): Promise<SessionMutationResponse> {
  return call("resumeTutorOpening", { sessionId, revision, requestId: newRequestId() });
}

export async function checkLearningSessionActivity(sessionId: string): Promise<void> {
  await call("checkLearningSessionActivity", { sessionId });
}

export async function bootstrapProfile(
  input: Omit<BootstrapProfileRequest, "requestId"> & { requestId?: string }
): Promise<{ profile: Record<string, unknown> }> {
  return call("bootstrapProfile", { ...input, requestId: input.requestId ?? newRequestId() });
}

export async function getCurrentConsentNotice(): Promise<GetCurrentConsentNoticeResponse> {
  return call("getCurrentConsentNotice", {});
}

export async function getLearningCatalog(): Promise<LearningCatalog> {
  return call("getLearningCatalog", {});
}

export async function startLearningSession(
  input: StartLearningSessionInput & { requestId?: string }
): Promise<SessionMutationResponse> {
  return call("startLearningSession", { ...input, requestId: input.requestId ?? newRequestId() });
}

export async function evaluatePhaseResponse(
  input: Omit<EvaluatePhaseResponseRequest, "requestId"> & { requestId?: string }
): Promise<EvaluatePhaseResponseResponse> {
  return call("evaluatePhaseResponse", { ...input, requestId: input.requestId ?? newRequestId() });
}

export async function requestSessionSupport(
  input: Omit<RequestSupportRequest, "requestId"> & { requestId?: string }
): Promise<RequestSupportResponse> {
  return call("requestSessionSupport", { ...input, requestId: input.requestId ?? newRequestId() });
}

export async function saveSessionDraft(
  input: Omit<SaveSessionDraftRequest, "requestId"> & { requestId?: string }
): Promise<SessionMutationResponse> {
  return call("saveSessionDraft", { ...input, requestId: input.requestId ?? newRequestId() });
}

export async function finalizeScorecard(sessionId: string, revision: number): Promise<SessionMutationResponse> {
  return call("finalizeScorecard", { sessionId, revision, requestId: newRequestId() });
}

export async function submitLearningSession(sessionId: string, revision: number): Promise<SessionMutationResponse> {
  return call("submitLearningSession", { sessionId, revision, requestId: newRequestId() });
}

export async function createFollowUpSession(sessionId: string): Promise<SessionMutationResponse> {
  return call("createFollowUpSession", { sessionId, requestId: newRequestId() });
}

export async function abandonLearningSession(sessionId: string): Promise<SessionMutationResponse> {
  return call("abandonLearningSession", { sessionId, requestId: newRequestId() });
}

export async function adminReviewSession(
  input: Omit<AdminReviewSessionRequest, "requestId">
): Promise<Record<string, unknown>> {
  return call("adminReviewSession", { ...input, requestId: newRequestId() });
}

export async function adminOverrideSessionSupport(input: {
  sessionId: string;
  level: "worked_explanation" | "full_solution";
  reason: string;
}): Promise<Record<string, unknown>> {
  return call("adminOverrideSessionSupport", { ...input, requestId: newRequestId() });
}

export async function adminUpsertContent(
  input: Omit<ContentMutationRequest, "requestId">
): Promise<Record<string, unknown>> {
  return call("adminUpsertContent", { ...input, requestId: newRequestId() });
}

export async function adminArchiveContent(
  input: Omit<ContentMutationRequest, "requestId" | "value">
): Promise<Record<string, unknown>> {
  return call("adminArchiveContent", { ...input, requestId: newRequestId() });
}

export async function adminCatalogReadiness(): Promise<CatalogReadinessResponse> {
  return call("adminCatalogReadiness", {});
}

export async function adminSubmitProblemValidation(problemId: string): Promise<Record<string, unknown>> {
  return call("adminSubmitProblemValidation", { problemId, requestId: newRequestId() });
}

export async function adminRecordProblemValidation(
  input: Omit<AdminRecordProblemValidationRequest, "requestId">
): Promise<Record<string, unknown>> {
  return call("adminRecordProblemValidation", { ...input, requestId: newRequestId() });
}

export async function adminBulkImportProblems(
  input: Omit<AdminBulkImportProblemsRequest, "requestId">
): Promise<Record<string, unknown>> {
  return call("adminBulkImportProblems", { ...input, requestId: newRequestId() });
}

export async function adminManageUser(input: {
  userId: string;
  action: "promote" | "demote" | "suspend" | "activate" | "deactivate" | "anonymize" | "reset_access";
  reason: string;
}): Promise<Record<string, unknown>> {
  return call("adminManageUser", { ...input, requestId: newRequestId() });
}

export async function adminDeleteContent(
  input: Omit<AdminDeleteContentRequest, "requestId">
): Promise<Record<string, unknown>> {
  return call("adminDeleteContent", { ...input, requestId: newRequestId() });
}

export async function adminPublishAnnouncement(
  input: Omit<AdminPublishAnnouncementRequest, "requestId">
): Promise<{ announcementId: string; delivered: number; total: number; complete: boolean; error?: string }> {
  return call("adminPublishAnnouncement", { ...input, requestId: newRequestId() });
}

export async function adminQueryReport(input: ReportQueryRequest): Promise<ReportQueryResponse> {
  return call<ReportQueryRequest, ReportQueryResponse>("adminQueryReport", input);
}

export async function adminExportReport(
  input: Omit<ReportExportRequest, "requestId">
): Promise<ReportExportResponse> {
  let cursor: string | undefined;
  let combined: ReportExportResponse | undefined;
  do {
    const page = await call<Record<string, unknown>, ReportExportResponse>("adminExportReport", { ...input, cursor, requestId: newRequestId() });
    if (!combined) combined = page;
    else if (combined.output === "csv" && page.output === "csv") combined.csv += "\r\n" + page.csv.slice(page.csv.indexOf("\r\n") + 2);
    else if (combined.output === "print" && page.output === "print") combined.rows.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { ...combined!, complete: true, nextCursor: null };

}

async function call<TRequest, TResponse>(name: string, input: TRequest): Promise<TResponse> {
  const payload = input && typeof input === "object" ? { ...input } as Record<string, unknown> : null;
  let pendingKey: string | null = null;
  if (payload && typeof payload.requestId === "string") {
    const { requestId: _requestId, ...values } = payload;
    const fingerprint = stableInput(values);
    pendingKey = `mindguide.pending.${auth?.currentUser?.uid ?? "anonymous"}.${name}.${fingerprint}`;
    const pending = sessionStorage.getItem(pendingKey);
    if (pending) { const stored = JSON.parse(pending); payload.requestId = stored.requestId; }
    else sessionStorage.setItem(pendingKey, JSON.stringify({ requestId: payload.requestId, input: values }));
  }
  try {
    const operation = AI_OPERATIONS.has(name) ? aiOperation : name.startsWith("admin") || name === "getPilotStatus"
      ? (await import("./admin-service")).adminOperation
      : (await import("./learning-service")).learningOperation;
    const result = await operation(name, validateOperation(name, payload ?? input));
    if (pendingKey && !(name == "adminPublishAnnouncement" && result?.complete === false)) sessionStorage.removeItem(pendingKey);
    return result as TResponse;
  } catch (error) {
    if (AI_OPERATIONS.has(name)) throw error;
    const code = (error as { code?: string })?.code?.split("/").at(-1);
    if (["unavailable", "deadline-exceeded", "resource-exhausted"].includes(code ?? "") && !/^(get|preview|adminQuery|adminCatalog|check)/.test(name)) {
      throw new Error("Unable to save your changes. Check your connection and try again; your last saved progress is preserved.");
    }
    throw new Error(secureErrorMessage(error));
  }
}

export async function previewVerifiedProblem(input: { topicId: string; question: string; requestedDifficulty: string }): Promise<{ confirmationHash: string; description: string }> {
  return call("previewVerifiedProblem", { ...input, requestId: newRequestId() });
}

function stableInput(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableInput).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stableInput(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export type PilotStatus = { state: "closed" | "open" | "drain" | "write-freeze"; enabledTopicIds: string[]; admitted: boolean; releaseArtifactId?: string | null };
export async function getPilotStatus(): Promise<PilotStatus> { return call("getPilotStatus", {}); }
export async function adminSetPilot(input: { state: PilotStatus["state"]; enabledTopicIds: string[]; releaseArtifactId?: string }): Promise<PilotStatus> { return call("adminSetPilot", input); }
export async function adminPilotRoster(uid: string, status: "admitted" | "revoked"): Promise<{ status: string }> { return call("adminPilotRoster", { uid, status }); }
