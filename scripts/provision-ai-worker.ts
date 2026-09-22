import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { applicationDefault } from "firebase-admin/app";
import { loadOperatorCredentials } from "./lib/operator-auth";

const values=Object.fromEntries((await readFile(".env","utf8")).split(/\r?\n/).filter(line=>/^\w+=/.test(line)).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const project=values.VITE_FIREBASE_PROJECT_ID;
if(!project||project.startsWith("demo-")||process.env.FIRESTORE_EMULATOR_HOST)throw new Error("Only the existing Firebase project is permitted.");
const email=`mindguide-ai-worker@${project}.iam.gserviceaccount.com`;
const role=`projects/${project}/roles/mindguideAiWorker`;
const permissions=["datastore.databases.get","datastore.databases.getMetadata","datastore.entities.get","datastore.entities.list","datastore.entities.create","datastore.entities.update"];
if(!process.argv.includes("--apply")) {
  console.log(JSON.stringify({project,serviceAccount:email,role,permissions,actions:["Create missing service account and custom Firestore role","Add that role to this service account only","Store credentials and Gemini key in Cloudflare Worker secrets"],databaseWrites:false,billingChanges:false},null,2));
} else {
  if(!values.GEMINI_API_KEY)throw new Error("Server-only GEMINI_API_KEY is required.");
  await loadOperatorCredentials();
  const token=await applicationDefault().getAccessToken();
  async function api(url:string,body?:unknown,method=body?"POST":"GET"):Promise<any> {
    const result=await fetch(url,{method,headers:{Authorization:`Bearer ${token.access_token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    if(result.status===404)return null;
    const json=await result.json() as any;
    if(!result.ok)throw new Error(`Google setup failed (${result.status}): ${json.error?.message??"Unavailable"}`);
    return json;
  }
  const iam="https://iam.googleapis.com/v1/";
  const accountName=`projects/${project}/serviceAccounts/${email}`;
  if(!await api(iam+accountName))await api(`${iam}projects/${project}/serviceAccounts`,{accountId:"mindguide-ai-worker",serviceAccount:{displayName:"MINDGUIDE free AI Worker",description:"Firestore session access only; no Auth, billing, IAM or deletion permissions."}});
  const existingRole=await api(iam+role);
  if(!existingRole)await api(`${iam}projects/${project}/roles`,{roleId:"mindguideAiWorker",role:{title:"MINDGUIDE AI Worker",description:"Read, create and update Firestore learning records; cannot delete records or administer accounts.",includedPermissions:permissions,stage:"GA"}});
  else if(JSON.stringify([...existingRole.includedPermissions].sort())!==JSON.stringify([...permissions].sort()))throw new Error("Existing Worker role differs from the reviewed permissions; inspect before changing it.");
  const crm=`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
  const policy=await api(`${crm}:getIamPolicy`,{options:{requestedPolicyVersion:3}});
  const member=`serviceAccount:${email}`;
  let binding=policy.bindings?.find((b:any)=>b.role===role&&!b.condition);
  if(!binding?.members?.includes(member)) {
    if(!binding){binding={role,members:[]};policy.bindings??=[];policy.bindings.push(binding);}
    binding.members.push(member);await api(`${crm}:setIamPolicy`,{policy});
  }
  const keyPath=".local-backups/ai-worker-service-account.json";
  let account: any;
  try {account=JSON.parse(await readFile(keyPath,"utf8"));}catch { /* First setup only. */ }
  if(account&&account.client_email!==email)throw new Error("Local Worker key belongs to another project.");
  if(!account){
    const key=await api(`${iam}${accountName}/keys`,{privateKeyType:"TYPE_GOOGLE_CREDENTIALS_FILE",keyAlgorithm:"KEY_ALG_RSA_2048"});
    account=JSON.parse(Buffer.from(key.privateKeyData,"base64").toString("utf8"));
    await mkdir(".local-backups",{recursive:true});await writeFile(keyPath,JSON.stringify(account),{mode:0o600});
  }
  const child=spawnSync(process.execPath,["node_modules/wrangler/bin/wrangler.js","secret","bulk","--config","worker/wrangler.jsonc"],{input:JSON.stringify({FIREBASE_SERVICE_ACCOUNT:JSON.stringify(account),GEMINI_API_KEY:values.GEMINI_API_KEY}),encoding:"utf8",windowsHide:true});
  // Wrangler prints secret names and status only; never echo the piped payload.
  process.stdout.write(child.stdout??"");process.stderr.write(child.stderr??"");
  if(child.status!==0)throw new Error("Secret upload failed. The ignored local recovery key is retained; retry this command.");
  console.log("Worker secrets configured. No learning records or billing settings changed.");
}
