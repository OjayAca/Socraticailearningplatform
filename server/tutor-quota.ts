import { ensure, type Env, type RecordDoc, type Store } from "./platform";

/** Shared by learning requests and bounded operator diagnostics. No uncertain call refunds. */
export async function reserveTutorQuota(db: Store, env: Env): Promise<Array<{doc:RecordDoc;data:any}>> {
  const rpm=Number(env.GEMINI_RPM),tpm=Number(env.GEMINI_TPM),rpd=Number(env.GEMINI_RPD);
  ensure([rpm,tpm,rpd].every(n=>Number.isSafeInteger(n)&&n>0),"Configure the verified Gemini Free quotas before opening AI practice.",503);
  const quota=await db.get("ai_usage/shared");
  const minute=Math.floor(Date.now()/60000);
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const requests=quota.data?.minute===minute?quota.data.requests:0;
  const tokens=quota.data?.minute===minute?quota.data.tokens:0;
  const daily=quota.data?.day===day?quota.data.daily:0;
  ensure(requests+1<=rpm && tokens+32000<=tpm && daily+1<=rpd,"The shared free AI allowance is in use. Your work is preserved; try again later.",429);
  return [{doc:quota,data:{minute,day,requests:requests+1,tokens:tokens+32000,daily:daily+1}}];
}
