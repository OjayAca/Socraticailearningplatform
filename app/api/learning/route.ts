import { authenticate } from "../../../server/auth";
import { Firestore } from "../../../server/firestore";
import { ServiceError } from "../../../server/platform";
import { getServerEnv } from "../../../server/config";
import { LearningService } from "../../../server/services/LearningService";
import { GeminiTutor, checkMath, turnSchema } from "../../../server/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const headers = { "Cache-Control": "no-store" };

async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "invalid-request", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 20000) {
        await reader.cancel();
        throw new ServiceError(413, "too-large", "Request is too large.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  try {
      const env = getServerEnv();
      const uid = await authenticate(request, env);
      console.info(JSON.stringify({ event: "learning_auth_timing", durationMs: Date.now() - started }));
      const body = await readBody(request);
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { throw new ServiceError(400, "invalid-request", "Request must contain valid JSON."); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as any).operation !== "string")
        throw new ServiceError(400, "invalid-request", "A learning operation is required.");
      const {operation, input} = parsed as { operation: string; input?: any };
      const store = new Firestore();
      if (operation === "backendHealth") {
        const profile = await store.get(`users/${uid}`);
        if ((profile.data?.role !== "admin" && uid !== env.OPERATOR_UID) || profile.data?.status !== "active") throw new ServiceError(403,"forbidden","Deployment operator access is required.");
        const privacy = await store.get("system_settings/privacy");
        let structuredAiResponse = false;
        if (input?.probe === true) {
          if (env.AI_FREE_TIER_CONFIRMED !== "true") throw new ServiceError(503,"configuration","Confirm free-tier configuration before probing Gemini.");
          const response = await new GeminiTutor(env).generate({intent:"opening",session:{subject:"Quantitative Methods",topic:"Problem understanding",difficulty:"Basic",originalQuestion:"Explain how to identify the givens and goal of a mathematical problem.",currentPhase:"problem_understanding"},reference:{expectedConcepts:["givens","goal"]},messages:[]});
          structuredAiResponse = turnSchema.safeParse(response).success;
        }
        return Response.json({authenticated:true,firestoreConnected:true,privacyConfigured:Boolean(privacy.data?.currentConsentVersion),aiEnabled:env.AI_ENABLED==="true",model:env.GEMINI_MODEL,structuredAiResponse,mathematicsCheck:checkMath({plainText:"(4+8+12)/3"},{kind:"number",value:8})},{headers});
      }
      const result = await new LearningService(store,new GeminiTutor(env),env,uid).operation(operation,input);
      return Response.json(result,{headers});
    } catch (error) {
      const known = error instanceof ServiceError;
      const status = known ? error.status : 503;
      // Operational metadata only: never log tokens, prompts, responses or credentials.
      console.warn(JSON.stringify({event:"learning_request_failed",status,code:known?error.code:"unavailable"}));
      return Response.json({error:{code:known?error.code:"unavailable",message:known?error.message:"The AI tutor is temporarily unavailable. Your saved work is preserved.",retryable:status===429||status>=500,retryAfter:known?error.retryAfter:0}}, {status,headers});
    } finally {
      console.info(JSON.stringify({ event: "learning_request_timing", durationMs: Date.now() - started }));
    }
}
