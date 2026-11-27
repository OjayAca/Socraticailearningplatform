import { authenticate } from "../../../../server/auth";
import { verifyAppCheckIfEnforced } from "../../../../server/app-check";
import { getServerEnv } from "../../../../server/config";
import { syncAllUsersEmailVerification } from "../../../../server/email-verification-sync";
import { API_SECURITY_HEADERS } from "../../../../server/http-security";
import { ServiceError } from "../../../../server/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Triggers an administrator-initiated bulk sync of `emailVerified` from Firebase Auth
 * onto all Firestore `users/{uid}` documents.
 *
 * @param request - Incoming HTTP POST request from an authenticated administrator.
 * @returns JSON response containing sync counts and per-UID verification statuses.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    const uid = await authenticate(request, env);
    await verifyAppCheckIfEnforced(request, env);
    const result = await syncAllUsersEmailVerification(uid);
    return Response.json(result, { headers: API_SECURITY_HEADERS });
  } catch (error) {
    const known = error instanceof ServiceError;
    const status = known ? error.status : 503;
    console.warn(
      JSON.stringify({
        event: "admin_verification_sync_failed",
        status,
        code: known ? error.code : "unavailable",
      }),
    );
    return Response.json(
      {
        error: {
          code: known ? error.code : "unavailable",
          message: known
            ? error.message
            : "Account verification statuses could not be synced right now.",
          retryable: status === 429 || status >= 500,
          retryAfter: known ? error.retryAfter : 0,
        },
      },
      { status, headers: API_SECURITY_HEADERS },
    );
  }
}
