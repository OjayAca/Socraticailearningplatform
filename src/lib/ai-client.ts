import { auth } from "./firebase";

export const AI_OPERATIONS = new Set([
  "startLearningSession", "createFollowUpSession", "evaluatePhaseResponse", "requestSessionSupport",
  "finalizeScorecard", "submitLearningSession", "abandonLearningSession", "checkLearningSessionActivity", "previewVerifiedProblem", "saveSessionDraft", "resumeTutorOpening",
]);

export async function aiOperation(operation: string, input: unknown): Promise<any> {
  try { return await sendOperation(operation, input); }
  catch (error) {
    const code = (error as { code?: string }).code;
    if (!(input as { requestId?: string })?.requestId || !["request-timeout", "network-unavailable", "invalid-server-response", "database-unavailable", "unavailable"].includes(code ?? "")) throw error;
    // Read the exact operation's saved result; never replay an uncertain mutation.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const saved = await sendOperation("getLearningOperationResult", { operation, input }, 10000);
        if (saved.status === "complete") return saved.result;
        if (saved.status !== "pending") break;
      } catch { break; }
    }
    throw error;
  }
}

async function sendOperation(operation: string, input: unknown, timeoutMs = 125000): Promise<any> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in to continue.");
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw Object.assign(new Error("Your sign-in could not be refreshed. Your work is preserved. Check your connection and sign in again if needed."), { code: "auth-unavailable" });
  }
  let response: Response;
  try {
    // The server has a 120-second limit and may retry a 45-second provider call.
    // Wait for its response rather than aborting a valid retry after 70 seconds.
    response = await fetch("/api/learning", {method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({operation,input}),signal:AbortSignal.timeout(timeoutMs)});
  } catch (cause) {
    const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw Object.assign(new Error(timedOut
      ? "The tutor took too long to respond. Your work is preserved. Reload saved progress before retrying; the request may have finished."
      : "The learning server could not be reached. Your work is preserved. Check your connection; if you are running the app locally, make sure the development server is running, then reload saved progress."), { code: timedOut ? "request-timeout" : "network-unavailable" });
  }
  let result: any;
  try { result = await response.json(); }
  catch {
    throw Object.assign(new Error("The learning server returned an unreadable response. Your work is preserved. Reload saved progress before retrying."), { code: "invalid-server-response" });
  }
  if (!response.ok) {
    const error = new Error(result.error?.message ?? "The AI tutor is temporarily unavailable.");
    Object.assign(error,{code:result.error?.code,details:result.error});
    throw error;
  }
  return result;
}
