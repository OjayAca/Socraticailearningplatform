import { readFile, writeFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { loadOperatorCredentials } from "./lib/operator-auth.ts";
import { containsExcludedContent, VALIDATED_TOPICS } from "../src/data/validated-curriculum.ts";

// Read-only audit of the configured real project; no seed, reset or publication.
const env=await readFile(".env","utf8");
const projectId=env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if(!projectId || projectId.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Use the configured project without an emulator.");
await loadOperatorCredentials();
const db=getFirestore(initializeApp({projectId,credential:applicationDefault()}));
const [problems,quota]=await Promise.all([db.collection("problems").where("status","==","approved").get(),db.doc("ai_usage/shared").get()]);
const coverage=VALIDATED_TOPICS.map(topic=>({subject:topic.subject,topic:topic.name,topicId:topic.id,...Object.fromEntries(["Basic","Intermediate","Advanced"].map(level=>[level,problems.docs.filter(d=>d.get("topicId")===topic.id && d.get("difficulty")===level).length]))}));
const excluded=problems.docs.filter(d=>containsExcludedContent([d.get("problemText"),d.get("title")])).map(d=>d.id);
const report={checkedAt:new Date().toISOString(),projectId,readOnly:true,targetPerLevel:5,coverage,excludedActiveQuestions:excluded,quota:quota.exists?quota.data():null};
console.log(JSON.stringify(report,null,2));
const output=process.argv.find(a=>a.startsWith("--report="))?.slice(9);
if(output) await writeFile(output,JSON.stringify(report,null,2));
