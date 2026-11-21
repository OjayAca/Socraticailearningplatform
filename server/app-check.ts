import "server-only";
import { getAdminAppCheck } from "./firebase";
import { ServiceError, type Env } from "./platform";

/**
 * Verifies the `X-Firebase-AppCheck` header when `APP_CHECK_ENFORCED === "true"`.
 *
 * @param request - Incoming API request carrying the optional App Check token header.
 * @param env - Verified server environment configuration.
 * @returns Resolves when App Check is disabled or the token verifies cleanly.
 */
export async function verifyAppCheckIfEnforced(request: Request, env: Env): Promise<void> {
  if (env.APP_CHECK_ENFORCED !== "true") {
    return;
  }

  const token = request.headers.get("X-Firebase-AppCheck")?.trim();
  if (!token || token.length > 16_000) {
    throw new ServiceError(
      401,
      "app-check-failed",
      "App verification is required. Reload the page and try again.",
    );
  }

  try {
    await getAdminAppCheck().verifyToken(token);
  } catch {
    throw new ServiceError(
      401,
      "app-check-failed",
      "App verification failed. Reload the page and try again.",
    );
  }
}
