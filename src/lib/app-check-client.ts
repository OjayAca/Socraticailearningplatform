import { getToken, type AppCheck } from "firebase/app-check";

let appCheckInstance: AppCheck | null = null;

/**
 * Registers the browser Firebase App Check instance used for optional token attachment.
 *
 * @param instance - Initialized Firebase App Check instance, or `null` when unconfigured.
 */
export function setClientAppCheck(instance: AppCheck | null): void {
  appCheckInstance = instance;
}

/**
 * Retrieves the current Firebase App Check token when App Check is configured in the browser.
 *
 * @returns The App Check token string, or `null` when unconfigured or unavailable.
 */
export async function getOptionalAppCheckToken(): Promise<string | null> {
  if (!appCheckInstance) return null;
  try {
    const result = await getToken(appCheckInstance, false);
    return result.token || null;
  } catch {
    return null;
  }
}
