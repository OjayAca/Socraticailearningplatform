import { isAbsolute, relative, resolve, sep } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { readFile, realpath } from "node:fs/promises";
import { parseEnv } from "node:util";
import { z } from "zod";

const production = "socratic-ai-a7765";
const directory = ".mindguide-staging";
const attestation = z.object({
  classification:z.literal("non-production"), projectId:z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/),
  database:z.literal("(default)"), verificationId:z.string().uuid(), verifiedBy:z.string().trim().min(1),
  evidenceReference:z.string().trim().min(1), expiresAt:z.string().datetime(), origin:z.url(),
});
export type Target = z.infer<typeof attestation>;
export function validateTarget(input:unknown, applicationIds:string[], selected:string|undefined, env:Record<string,string|undefined>) {
  const target = attestation.parse(input);
  if (!applicationIds.length || [production,...applicationIds].includes(target.projectId) || target.projectId.startsWith("demo-"))
    throw new Error("Staging must be isolated from every configured application project.");
  if (selected !== target.projectId || Date.parse(target.expiresAt) <= Date.now()) throw new Error("Missing, expired or mismatched staging verification.");
  const url = new URL(target.origin);
  if (url.protocol !== "https:" || url.origin !== target.origin || url.hostname.includes(production)) throw new Error("Invalid verified staging origin.");
  if (Object.keys(env).some(k => k.endsWith("_EMULATOR_HOST") && env[k])) throw new Error("Staging forbids emulator overrides.");
  return target;
}
export async function loadTarget() {
  let raw;
  try { raw = await readFile(directory + "/verification.json","utf8"); }
  catch { throw new Error("Missing verified staging configuration in .mindguide-staging/verification.json. No Firebase connection attempted."); }
  const names = [".env",".env.local",...["development","test","production"].flatMap(mode=>[".env."+mode,".env."+mode+".local"])];
  const files = await Promise.all(names.map(async p => {
    try { return parseEnv(await readFile(p,"utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}; throw e; }
  }));
  const keys = ["FIREBASE_PROJECT_ID","VITE_FIREBASE_PROJECT_ID","NEXT_PUBLIC_FIREBASE_PROJECT_ID"];
  const ids = [...files,process.env].flatMap(file => keys.map(k => file[k]).filter((id):id is string => !!id));
  return validateTarget(JSON.parse(raw),ids,process.env.MINDGUIDE_STAGING_PROJECT_ID,process.env);
}
export function validateKey(key:Record<string,any>, target:Target) {
  if (key.type !== "service_account" || key.project_id !== target.projectId ||
    typeof key.client_email !== "string" || !key.client_email.endsWith("@"+target.projectId+".iam.gserviceaccount.com") ||
    !key.private_key) throw new Error("A service account belonging to the verified staging project is required.");
}
export function assertMarker(data:Record<string,any>|undefined, target:Target) {
  if (Date.parse(target.expiresAt) <= Date.now() || !data || data.classification !== "non-production" ||
      data.projectId !== target.projectId || data.database !== target.database ||
      data.verificationId !== target.verificationId || data.origin !== target.origin)
    throw new Error("Staging database verification marker is missing, revoked or mismatched.");
}

export async function stagingApp(target:Target) {
  const suppliedKey = process.env.MINDGUIDE_STAGING_CREDENTIAL_FILE;
  if (!suppliedKey || !isAbsolute(suppliedKey)) throw new Error("Supply an absolute MINDGUIDE_STAGING_CREDENTIAL_FILE outside the repository.");
  const keyPath = await realpath(suppliedKey);
  const relativeKey = relative(await realpath(resolve(".")),keyPath);
  if (!relativeKey.startsWith(".."+sep) && !isAbsolute(relativeKey)) throw new Error("Keep staging credentials outside the repository.");
  const key = JSON.parse(await readFile(keyPath,"utf8"));
  validateKey(key,target);
  return initializeApp({projectId:target.projectId,credential:cert(key)},"mindguide-staging-operator");
}
