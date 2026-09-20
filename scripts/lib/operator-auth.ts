import { createRequire } from "node:module";

/** Reuse Firebase CLI's supported ADC export; credentials never enter application files or logs. */
export async function loadOperatorCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const require = createRequire(import.meta.url);
  const { getProjectDefaultAccount } = require("firebase-tools/lib/auth");
  const { getCredentialPathAsync } = require("firebase-tools/lib/defaultCredentials");
  const account = getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error("Sign in with firebase login, or configure GOOGLE_APPLICATION_CREDENTIALS for this project's operator.");
  const credentialPath = await getCredentialPathAsync(account);
  if (!credentialPath) throw new Error("Firebase CLI credentials are unavailable. Run firebase login --reauth.");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
}
