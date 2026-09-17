import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const project = process.env.MINDGUIDE_STAGING_PROJECT;
const file = process.env.MINDGUIDE_LOAD_FIXTURE;
const apiKey = process.env.MINDGUIDE_STAGING_WEB_API_KEY;
if (!project || project === "socratic-ai-a7765" || !file || !apiKey) throw new Error("Set an isolated MINDGUIDE_STAGING_PROJECT, MINDGUIDE_LOAD_FIXTURE and MINDGUIDE_STAGING_WEB_API_KEY. Never use production accounts.");
const fixture = JSON.parse(await readFile(file,"utf8"));
const count = Number(process.env.MINDGUIDE_LOAD_CONCURRENCY ?? 50);
if (!Number.isInteger(count) || count < 1 || count > 400 || fixture.accounts?.length < count || fixture.phases?.length !== 7 || !fixture.draft || !fixture.topicId) throw new Error("Supply distinct admitted staging accounts, seven faculty-reviewed phase responses, a final draft and a topic. Default concurrency is 50.");
if (new Set(fixture.accounts.slice(0,count).map(account=>account.email)).size !== count) throw new Error("Load participants must use distinct staging identities.");
const endpoint = `https://${process.env.MINDGUIDE_STAGING_REGION ?? "asia-southeast1"}-${project}.cloudfunctions.net`;
const measurements = [];
const startedAt = Date.now();
async function participant(account) {
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:account.email,password:account.password,returnSecureToken:true})});
  const identity = await login.json();
  if (!login.ok || !identity.idToken) throw new Error("staging_auth_failed");
  async function call(name,input) {
    const start = performance.now();
    const payload = {data:{...input,requestId:randomUUID()}};
    const response = await fetch(`${endpoint}/${name}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${identity.idToken}`,"X-Firebase-AppCheck":account.appCheckToken ?? ""},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
    const value = await response.json();
    measurements.push({operation:name,latencyMs:performance.now()-start,ok:response.ok&&!value.error});
    if (!response.ok || value.error) throw new Error(value.error?.status ?? "call_failed");
    return value.result ?? value.data;
  }
  const question = fixture.question ?? "mean: 4, 8, 12";
  const preview = await call("previewVerifiedProblem",{mode:"free_form",topicId:fixture.topicId,question,requestedDifficulty:"Basic"});
  let {session} = await call("startLearningSession",{mode:"free_form",topicId:fixture.topicId,question,requestedDifficulty:"Basic",confirmationHash:preview.confirmationHash});
  for(const phase of fixture.phases) {
    if (session.currentPhase !== phase.phase) throw new Error("unexpected_phase_or_rejection");
    ({session} = await call("evaluatePhaseResponse",{sessionId:session.id,revision:session.revision,expectedPhase:phase.phase,response:phase.response}));
  }
  ({session} = await call("saveSessionDraft",{sessionId:session.id,revision:session.revision,draft:fixture.draft}));
  ({session} = await call("finalizeScorecard",{sessionId:session.id,revision:session.revision}));
  await call("submitLearningSession",{sessionId:session.id,revision:session.revision});
}
const results = await Promise.allSettled(fixture.accounts.slice(0,count).map(participant));
const latencies = measurements.map(item=>item.latencyMs).sort((a,b)=>a-b);
const percentile = n => latencies[Math.max(0,Math.ceil(latencies.length*n)-1)] ?? null;
const report = {project,concurrency:count,durationMs:Date.now()-startedAt,completed:results.filter(item=>item.status==="fulfilled").length,failed:results.filter(item=>item.status==="rejected").length,callCount:measurements.length,p50Ms:percentile(.5),p95Ms:percentile(.95),failedCalls:measurements.filter(item=>!item.ok).length,measurements,tokenCostEvidence:"Join server mindguide_ai_usage telemetry with the approved provider price and billing records; not inferred by this client."};
await mkdir(".local-backups",{recursive:true});
await writeFile(".local-backups/pilot-load-report.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,measurements:undefined},null,2));
if(report.failed) process.exitCode=1;
