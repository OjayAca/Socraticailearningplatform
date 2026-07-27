import { httpsCallable } from "firebase/functions";
import type {
  AdminReviewSessionRequest,
  BootstrapProfileRequest,
  ContentMutationRequest,
  EvaluatePhaseResponseRequest,
  EvaluatePhaseResponseResponse,
  GetCurrentConsentNoticeResponse,
  ReportQueryRequest,
  ReportQueryResponse,
  RequestSupportRequest,
  RequestSupportResponse,
  SaveSessionDraftRequest,
  SessionMutationResponse,
  StartLearningSessionRequest,
} from "@mindguide/contracts";
import { firebaseSetupMessage, functions } from "./firebase";
import { secureErrorMessage } from "./secure-error";

function newRequestId(): string {
  return crypto.randomUUID();
}

export async function bootstrapProfile(
  input: Omit<BootstrapProfileRequest, "requestId"> & { requestId?: string }
): Promise<{ profile: Record<string, unknown> }> {
  return call("bootstrapProfile", { ...input, requestId: input.requestId ?? newRequestId() });
}

export async function getCurrentConsentNotice(): Promise<GetCurrentConsentNoticeResponse> {
  return call("getCurrentConsentNotice", {});
}

export async function startLearningSession(
  input: Omit<StartLearningSessionRequest, "requestId"> & { requestId?: string }
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

export async function adminManageUser(input: {
  userId: string;
  action: "promote" | "demote" | "suspend" | "activate" | "deactivate" | "anonymize" | "reset_access";
  reason: string;
}): Promise<Record<string, unknown>> {
  return call("adminManageUser", { ...input, requestId: newRequestId() });
}

export async function adminQueryReport(input: ReportQueryRequest): Promise<ReportQueryResponse> {
  return call<ReportQueryRequest, ReportQueryResponse>("adminQueryReport", input);
}

export async function adminExportReport(input: ReportQueryRequest) {
  return call<{ [key: string]: unknown }, { csv: string; filename: string }>("adminExportReport", {
    ...input,
    requestId: newRequestId(),
  });
}

async function call<TRequest, TResponse>(name: string, input: TRequest): Promise<TResponse> {
  if (!functions) throw new Error(firebaseSetupMessage);
  try {
    const callable = httpsCallable<TRequest, TResponse>(functions, name);
    const result = await callable(input);
    return result.data;
  } catch (error) {
    throw new Error(secureErrorMessage(error));
  }
}
