import { invalidateViews, loadView } from "./view-cache";
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
  SessionMutationResponse,
  StartLearningSessionInput,
  OwnProblemInput,
} from "@mindguide/contracts";
import { auth } from "./firebase";
import { getOptionalAppCheckToken } from "./app-check-client";
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
  return loadView(`catalog:${auth?.currentUser?.uid ?? "anonymous"}`, () => call("getLearningCatalog", {}));
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

export async function finalizeScorecard(sessionId: string, revision: number, requestId = newRequestId()): Promise<SessionMutationResponse> {
  return call("finalizeScorecard", { sessionId, revision, requestId });
}

export async function submitLearningSession(sessionId: string, revision: number): Promise<SessionMutationResponse> {
  return call("submitLearningSession", { sessionId, revision, requestId: newRequestId() });
}

export async function createFollowUpSession(sessionId: string): Promise<SessionMutationResponse> {
  return call("createFollowUpSession", { sessionId, requestId: newRequestId() });
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

export async function adminEditAcademicProfile(input: {userId:string; course:string; yearLevel:string; section:string; reason:string}): Promise<Record<string, unknown>> {
  return call("adminEditAcademicProfile", {...input, requestId:newRequestId()});
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
    if (!/^(get|preview|adminQuery|adminCatalog|check)/.test(name)) invalidateViews();
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

export function getPreparedTopicIds(subjectId: string): Promise<string[]> {
  return loadView(`prepared-topics:${auth?.currentUser?.uid}:${subjectId}`, () => call("getPreparedTopicIds", { subjectId }));
}

export async function previewVerifiedProblem(input: OwnProblemInput): Promise<{ confirmationHash: string; description: string }> {
  return call("previewVerifiedProblem", { ...input, requestId: newRequestId() });
}

export interface ExtractProblemMediaRequest {
  file: File;
  subjectId?: string;
}

export interface ExtractedProblemResponse {
  detected: boolean;
  problemText: string;
  problemLatex?: string;
  confidence: "high" | "medium" | "low";
  warning?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(""));
}

async function readFileAsBase64(file: File): Promise<string> {
  if (typeof file.arrayBuffer === "function") {
    const buffer = await file.arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image or PDF file to the authenticated problem extraction endpoint
 * and returns the transcribed problem text and optional LaTeX notation.
 *
 * @param input - Media file and optional selected subject identifier.
 * @returns Extracted problem statement, optional LaTeX, confidence, and optional warning.
 */
export async function extractProblemFromMedia(
  input: ExtractProblemMediaRequest,
): Promise<ExtractedProblemResponse> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in to continue.");
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw Object.assign(
      new Error("Your sign-in could not be refreshed. Check your connection and sign in again if needed."),
      { code: "auth-unavailable" },
    );
  }

  const appCheckToken = await getOptionalAppCheckToken();
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (appCheckToken) {
    requestHeaders["X-Firebase-AppCheck"] = appCheckToken;
  }

  const dataBase64 = await readFileAsBase64(input.file);
  const requestPayload = JSON.stringify({
    dataBase64,
    mimeType: input.file.type,
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
  });

  let response: Response;
  try {
    response = await fetch("/api/learning/extract-problem", {
      method: "POST",
      headers: requestHeaders,
      body: requestPayload,
      signal: AbortSignal.timeout(120000),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw Object.assign(
      new Error(
        timedOut
          ? "Reading the image took too long. Try a clearer photo or type your problem below."
          : "The learning server could not be reached. Check your connection or type your problem below.",
      ),
      { code: timedOut ? "request-timeout" : "network-unavailable" },
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw Object.assign(
      new Error("The learning server returned an unreadable response. You can still type your problem below."),
      { code: "invalid-server-response" },
    );
  }

  if (!response.ok) {
    const errorPayload = (result as { error?: { message?: string; code?: string } })?.error;
    const error = new Error(
      errorPayload?.message ?? "Could not extract the problem from this file. You can still type it below.",
    );
    Object.assign(error, { code: errorPayload?.code, details: errorPayload });
    throw error;
  }

  return result as ExtractedProblemResponse;
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

/** Response from syncing the signed-in user's own email verification state to Firestore. */
export interface SelfVerificationSyncResult {
  readonly synced: boolean;
  readonly emailVerified: boolean;
}

/** Response from an administrator bulk-syncing user email verification states from Firebase Auth. */
export interface AdminVerificationSyncResult {
  readonly checked: number;
  readonly updated: number;
  readonly alreadySynced: number;
  readonly verified: number;
  readonly unverified: number;
  readonly missingInAuth: number;
  readonly statuses: Readonly<Record<string, boolean>>;
}

async function postAuthenticatedEndpoint<TResponse>(
  path: string,
  fallbackError: string,
  options?: { forceRefreshToken?: boolean },
): Promise<TResponse> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in to continue.");

  let token: string;
  try {
    token = await user.getIdToken(options?.forceRefreshToken ?? false);
  } catch {
    throw Object.assign(
      new Error("Your sign-in could not be refreshed. Check your connection and sign in again if needed."),
      { code: "auth-unavailable" },
    );
  }

  const appCheckToken = await getOptionalAppCheckToken();
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (appCheckToken) {
    requestHeaders["X-Firebase-AppCheck"] = appCheckToken;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: requestHeaders,
      signal: AbortSignal.timeout(60000),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw Object.assign(
      new Error(
        timedOut
          ? "The verification sync request timed out. Try again shortly."
          : "The server could not be reached. Check your connection and try again.",
      ),
      { code: timedOut ? "request-timeout" : "network-unavailable" },
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw Object.assign(
      new Error("The server returned an unreadable response."),
      { code: "invalid-server-response" },
    );
  }

  if (!response.ok) {
    const errorPayload = (result as { error?: { message?: string; code?: string } })?.error;
    const error = new Error(errorPayload?.message ?? fallbackError);
    Object.assign(error, { code: errorPayload?.code, details: errorPayload });
    throw error;
  }

  return result as TResponse;
}

/**
 * Syncs the currently signed-in user's verified Firebase ID token `email_verified`
 * flag to their Firestore `users/{uid}` document via the backend API.
 *
 * @param forceRefreshToken - Whether to force-refresh the Firebase ID token first.
 * @returns Whether the Firestore document was updated and the persisted verification status.
 */
export async function syncOwnEmailVerification(
  forceRefreshToken = false,
): Promise<SelfVerificationSyncResult> {
  return postAuthenticatedEndpoint<SelfVerificationSyncResult>(
    "/api/auth/sync-verification",
    "Could not sync account verification status.",
    { forceRefreshToken },
  );
}

/**
 * Triggers an administrator bulk sync of `emailVerified` from Firebase Authentication
 * onto all Firestore `users/{uid}` documents and invalidates cached admin views.
 *
 * @returns Aggregate sync counts and per-UID verification statuses.
 */
export async function adminSyncEmailVerification(): Promise<AdminVerificationSyncResult> {
  const result = await postAuthenticatedEndpoint<AdminVerificationSyncResult>(
    "/api/admin/sync-verification",
    "Could not sync learner verification statuses.",
  );
  invalidateViews();
  return result;
}
