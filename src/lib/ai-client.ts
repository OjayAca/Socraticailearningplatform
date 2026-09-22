import { auth } from "./firebase";

export const AI_OPERATIONS = new Set([
  "startLearningSession", "createFollowUpSession", "evaluatePhaseResponse", "requestSessionSupport",
  "finalizeScorecard", "submitLearningSession", "abandonLearningSession", "checkLearningSessionActivity", "previewVerifiedProblem", "saveSessionDraft", "resumeTutorOpening",
]);

export async function aiOperation(operation: string, input: unknown): Promise<any> {
  const base = import.meta.env.VITE_AI_WORKER_URL?.replace(/\/$/, "");
  if (!base) throw new Error("AI tutoring is not configured yet. Your administrator needs to connect the free AI backend.");
  if (!/^https:\/\//.test(base) && !/^http:\/\/localhost:\d+$/.test(base)) throw new Error("The AI backend URL must use HTTPS.");
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in to continue.");
  let response: Response;
  try {
    response = await fetch(`${base}/api/learning`, {method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({operation,input}),signal:AbortSignal.timeout(70000)});
  } catch { throw new Error("The AI tutor could not be reached. Your work is preserved; retry when connected."); }
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message ?? "The AI tutor is temporarily unavailable.");
    Object.assign(error,{code:result.error?.code,details:result.error});
    throw error;
  }
  return result;
}
