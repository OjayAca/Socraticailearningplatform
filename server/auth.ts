import "server-only";
import { getAdminAuth } from "./firebase";
import { ensure, ServiceError, type Env } from "./platform";

export async function authenticate(request: Request, env: Env): Promise<string> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  ensure(token && token.length < 16000, "Sign in again to continue.", 401);
  // SDK verification validates the signature, expiry, audience and issuer.
  const auth = getAdminAuth();
  try {
    const checkRevoked = env.AUTH_CHECK_REVOKED === "true";
    const claims = await auth.verifyIdToken(token, checkRevoked);
    ensure(claims.aud === env.FIREBASE_PROJECT_ID
      && claims.iss === `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
      && /^[A-Za-z0-9:_-]{1,128}$/.test(claims.uid), "Invalid sign-in token.", 401);
    const isOperatorOrAdmin =
      claims.role === "admin" ||
      (typeof env.OPERATOR_UID === "string" &&
        env.OPERATOR_UID.length > 0 &&
        claims.uid === env.OPERATOR_UID);
    if (claims.email_verified !== true && !isOperatorOrAdmin) {
      throw new ServiceError(
        403,
        "email-unverified",
        "Verify your email address before continuing."
      );
    }
    return claims.uid;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const code = (error as { code?: string }).code;
    if (code && ["auth/id-token-expired", "auth/invalid-id-token", "auth/argument-error", "auth/id-token-revoked", "auth/user-disabled"].includes(code)) {
      throw new ServiceError(401, "unauthenticated", "Your sign-in could not be verified. Sign in again.");
    }
    throw new ServiceError(503, "auth-unavailable", "Sign-in verification is temporarily unavailable.");
  }
}
