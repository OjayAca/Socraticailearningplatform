import { authenticateIdentity } from "../../../../server/auth";
import { verifyAppCheckIfEnforced } from "../../../../server/app-check";
import { getServerEnv } from "../../../../server/config";
import { syncSingleUserEmailVerification } from "../../../../server/email-verification-sync";
import { API_SECURITY_HEADERS } from "../../../../server/http-security";
import { ServiceError } from "../../../../server/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Syncs the authenticated user's verified Firebase ID token `email_verified` claim
 * into their Firestore `users/{uid}` document.
 *
 * @param request - Incoming HTTP POST request with a Firebase ID token.
 * @returns JSON response containing `{ synced, emailVerified }`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    const identity = await authenticateIdentity(request, env);
    await verifyAppCheckIfEnforced(request, env);
    const result = await syncSingleUserEmailVerification(
      identity.uid,
      identity.emailVerified,
    );
    return Response.json(result, { headers: API_SECURITY_HEADERS });
  } catch (error) {
    const known = error instanceof ServiceError;
    const status = known ? error.status : 503;
    console.warn(
      JSON.stringify({
        event: "auth_verification_sync_failed",
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
            : "Account verification status could not be synced right now.",
          retryable: status === 429 || status >= 500,
          retryAfter: known ? error.retryAfter : 0,
        },
      },
      { status, headers: API_SECURITY_HEADERS },
    );
  }
}
