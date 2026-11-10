import nextEnv from "@next/env";
import { writeFile } from "node:fs/promises";
import { loadOperatorCredentials } from "./lib/operator-auth.ts";
import { Firestore } from "../server/firestore";
import { getServerEnv } from "../server/config";
import { GeminiTutor, turnSchema, exposesAnswer } from "../server/gemini";
import { diagnoseArithmetic } from "../server/mathematical-diagnosis";
import { reserveTutorQuota } from "../server/tutor-quota";

// One bounded provider call per invocation. Uses real approved references and the normal quota.
// Writes only the quota reservation, never learner sessions, scores, approvals or content.
nextEnv.loadEnvConfig(process.cwd());
await loadOperatorCredentials();
const env=getServerEnv();
if(env.AI_FREE_TIER_CONFIRMED!=="true" || !process.argv.includes("--free-tier-confirmed")) throw new Error("The configured free tier and explicit probe flag are required.");
const cases={
  understanding:{phase:"problem_understanding",response:"We must find the image of the subset {-2,0,1}, the preimage of {1,4}, and decide injectivity and surjectivity. The domain is {-2,-1,0,1,2}, the declared codomain is {0,1,4}, and f(x)=x². Preimage means all domain elements whose outputs lie in the given set, not an inverse function."},
  arithmetic:{phase:"guided_computation_or_proof",response:"f(-2)=-4 and f(-1)=-1, image {-4,0,1}, preimage {1,2}. It is injective because all five outputs differ."},
  method_invalid:{phase:"method_selection",response:"I will use the inverse function to find the preimage because every function has an inverse, even when distinct inputs share the same output."},
  method_alternative:{phase:"method_selection",response:"I will make a table of all five domain inputs and their squared outputs. For the image I collect outputs for the specified inputs; for the preimage I search the full table for outputs in the target set and collect every matching input. A preimage need not be a single-valued inverse. I can check repeated outputs for injectivity and compare the attained outputs with the declared codomain for surjectivity."},
} as const;
const name=process.argv.find(a=>a.startsWith("--case="))?.slice(7) as keyof typeof cases;
if(!cases[name]) throw new Error("Choose --case=understanding, arithmetic, method_invalid or method_alternative.");
const db=new Firestore();
const problemId="QM-07-B01";
const [problem,ref,source]=await Promise.all([db.get(`problems/${problemId}`),db.get(`problem_scoring/${problemId}`),db.get(`problems/${problemId}/private/import_source`)]);
if(problem.data?.status!=="approved" || !ref.data) throw new Error("An approved question and scoring reference are required.");
const input=cases[name];
const reference={...ref.data,sourceGuidance:source.data?.source?.instructor_only};
await db.commit(await reserveTutorQuota(db,env));
const result=turnSchema.parse(await new GeminiTutor(env).generate({intent:"answer",session:{subject:problem.data.subject,topic:problem.data.topic,topicId:problem.data.topicId,difficulty:problem.data.difficulty,originalQuestion:problem.data.problemText,currentPhase:input.phase},reference,messages:[],response:{plainText:input.response}}));
const arithmetic=name==="arithmetic"?diagnoseArithmetic({plainText:input.response},problem.data.problemText):null;
const passed=!exposesAnswer(result,reference,{plainText:input.response}) && (["understanding","method_alternative"].includes(name) ? result.intent==="answer" && result.accepted && result.confidence==="high" && result.category==="none" : name==="arithmetic" ? !!arithmetic && !result.accepted : !result.accepted && ["wrong_formula","theorem_condition_violation","procedural_error","conceptual_error"].includes(result.category));
const report={checkedAt:new Date().toISOString(),case:name,problemId,model:env.GEMINI_MODEL,liveGemini:true,liveFirestoreReference:true,learnerSessionWritten:false,quotaReservationWritten:true,passed,initialResponse:input.response,result,deterministicDiagnosis:arithmetic};
console.log(JSON.stringify(report,null,2));
const output=process.argv.find(a=>a.startsWith("--report="))?.slice(9);
if(output) await writeFile(output,JSON.stringify(report,null,2));
if(!passed) process.exitCode=1;
