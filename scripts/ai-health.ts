import nextEnv from "@next/env";
import { getAdminApp } from "../server/firebase";
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { loadOperatorCredentials } from "./lib/operator-auth";

// Read-only health probe using ONLY the signed-in Firebase operator's existing application account.
// No new user, session, learning content, approval or admission is created.
nextEnv.loadEnvConfig(process.cwd());
const values = process.env;
await loadOperatorCredentials();
const require=createRequire(import.meta.url);
const operator=require("firebase-tools/lib/auth").getProjectDefaultAccount(process.cwd());
if(!operator?.user?.email)throw new Error("Sign in with the existing Firebase operator account.");
const project=values.FIREBASE_PROJECT_ID;
const admin=initializeApp({projectId:project,credential:applicationDefault()},"health-operator");
const user=await getAuth(admin).getUserByEmail(operator.user.email);
const signer = getAdminApp();
const customToken=await getAuth(signer).createCustomToken(user.uid);
const exchange=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(values.NEXT_PUBLIC_FIREBASE_API_KEY || values.VITE_FIREBASE_API_KEY || "")}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:customToken,returnSecureToken:true})});
const auth=await exchange.json() as any;
if(!exchange.ok)throw new Error("Could not authenticate the operator's existing application account.");
const response=await fetch(`${process.env.MINDGUIDE_BASE_URL ?? "http://localhost:5173"}/api/learning`,{method:"POST",headers:{"Content-Type":"application/json",Origin:`https://${project}.web.app`,Authorization:`Bearer ${auth.idToken}`},body:JSON.stringify({operation:"backendHealth",input:{probe:process.argv.includes("--probe")}})});
const result=await response.json();
console.log(JSON.stringify({httpStatus:response.status,...result},null,2));
if(!response.ok)process.exitCode=1;
