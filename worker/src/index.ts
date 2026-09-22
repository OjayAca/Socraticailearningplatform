import { authenticate, Firestore, ServiceError, type Env } from "./platform";
import { LearningService } from "./service";
import { GeminiTutor } from "./tutor";
import { checkMath, turnSchema } from "./tutor";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map(s=>s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response("Origin not allowed",{status:403});
    const headers = {"Access-Control-Allow-Origin":origin,"Vary":"Origin","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Content-Type":"application/json"};
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
    try {
      if (request.method !== "POST" || new URL(request.url).pathname !== "/api/learning") throw new ServiceError(404,"not-found","Unknown endpoint.");
      const body = await request.text();
      if (body.length>20000) throw new ServiceError(413,"too-large","Request is too large.");
      const uid = await authenticate(request,env);
      const {operation,input} = JSON.parse(body);
      const store = new Firestore(env);
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
    }
  },
};
