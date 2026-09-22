import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { loadOperatorCredentials } from "./lib/operator-auth";

// Read-only health probe using ONLY the signed-in Firebase operator's existing application account.
// No new user, session, learning content, approval or admission is created.
const values=Object.fromEntries((await readFile(".env","utf8")).split(/\r?\n/).filter(line=>/^\w+=/.test(line)).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
await loadOperatorCredentials();
const require=createRequire(import.meta.url);
const operator=require("firebase-tools/lib/auth").getProjectDefaultAccount(process.cwd());
if(!operator?.user?.email)throw new Error("Sign in with the existing Firebase operator account.");
const project=values.VITE_FIREBASE_PROJECT_ID;
const admin=initializeApp({projectId:project,credential:applicationDefault()},"health-operator");
const user=await getAuth(admin).getUserByEmail(operator.user.email);
if (process.argv.includes("--configure-operator")) {
  const config=JSON.parse(await readFile("worker/wrangler.jsonc","utf8"));
  config.vars.OPERATOR_UID=user.uid;
  await writeFile("worker/wrangler.jsonc",JSON.stringify(config,null,2)+"\n");
  console.log("Bound health diagnostics to the existing signed-in Firebase operator. No user role was changed.");
  process.exit(0);
}
const key=JSON.parse(await readFile(".local-backups/ai-worker-service-account.json","utf8"));
if(key.project_id!==project)throw new Error("Worker service account project mismatch.");
const signer=initializeApp({projectId:project,credential:cert(key)},"health-signer");
const customToken=await getAuth(signer).createCustomToken(user.uid);
const exchange=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(values.VITE_FIREBASE_API_KEY)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:customToken,returnSecureToken:true})});
const auth=await exchange.json() as any;
if(!exchange.ok)throw new Error("Could not authenticate the operator's existing application account.");
const response=await fetch(`${values.VITE_AI_WORKER_URL}/api/learning`,{method:"POST",headers:{"Content-Type":"application/json",Origin:`https://${project}.web.app`,Authorization:`Bearer ${auth.idToken}`},body:JSON.stringify({operation:"backendHealth",input:{probe:process.argv.includes("--probe")}})});
const result=await response.json();
console.log(JSON.stringify({httpStatus:response.status,...result},null,2));
if(!response.ok)process.exitCode=1;
