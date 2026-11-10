import { loadTarget } from "./lib/staging-target.ts";
export default async function verifyBrowserTarget() {
  const target = await loadTarget();
  if (process.env.MINDGUIDE_E2E_BASE_URL !== target.origin) throw new Error("Browser URL must exactly match the attested staging origin.");
  const response = await fetch(target.origin+"/api/staging-identity",{redirect:"error",signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error("Deployed staging identity unavailable.");
  const data = await response.json();
  if (data.projectId !== target.projectId || data.browserProjectId !== target.projectId ||
      data.database !== target.database || data.origin !== target.origin || data.verificationId !== target.verificationId)
    throw new Error("Deployed browser or backend is not bound to the verified staging database.");
}
