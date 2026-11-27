import "server-only";
import { getAdminAuth } from "./firebase";
import { ensure, ServiceError, type Env } from "./platform";

/** Verified Firebase Auth identity extracted from a request Bearer ID token. */
export interface AuthenticatedIdentity {
  readonly uid: string;
  readonly emailVerified: boolean;
  readonly isAdminClaim: boolean;
  readonly isOperator: boolean;
}

/**
 * Verifies the request's Firebase ID token and extracts identity metadata without
 * rejecting unverified email/password accounts.
 *
 * @param request - Incoming HTTP request containing an Authorization Bearer token.
 * @param env - Server environment configuration.
 * @returns The verified user identity and verification/role flags.
 */
export async function authenticateIdentity(
  request: Request,
  env: Env,
): Promise<AuthenticatedIdentity> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  ensure(token && token.length < 16000, "Sign in again to continue.", 401);
  // SDK verification validates the signature, expiry, audience and issuer.
  const auth = getAdminAuth();
  try {
    const checkRevoked = env.AUTH_CHECK_REVOKED === "true";
    const claims = await auth.verifyIdToken(token, checkRevoked);
    ensure(
      claims.aud === env.FIREBASE_PROJECT_ID
        && claims.iss === `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
        && /^[A-Za-z0-9:_-]{1,128}$/.test(claims.uid),
      "Invalid sign-in token.",
      401,
    );
    const isAdminClaim = claims.role === "admin";
    const isOperator =
      typeof env.OPERATOR_UID === "string" &&
      env.OPERATOR_UID.length > 0 &&
      claims.uid === env.OPERATOR_UID;
    return {
      uid: claims.uid,
      emailVerified: claims.email_verified === true,
      isAdminClaim,
      isOperator,
    };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const code = (error as { code?: string }).code;
    if (code && ["auth/id-token-expired", "auth/invalid-id-token", "auth/argument-error", "auth/id-token-revoked", "auth/user-disabled"].includes(code)) {
      throw new ServiceError(401, "unauthenticated", "Your sign-in could not be verified. Sign in again.");
    }
    throw new ServiceError(503, "auth-unavailable", "Sign-in verification is temporarily unavailable.");
  }
}

/**
 * Authenticates an incoming request and enforces email verification for non-operator/non-admin users.
 *
 * @param request - Incoming HTTP request containing an Authorization Bearer token.
 * @param env - Server environment configuration.
 * @returns The authenticated user UID.
 */
export async function authenticate(request: Request, env: Env): Promise<string> {
  const identity = await authenticateIdentity(request, env);
  if (!identity.emailVerified && !identity.isAdminClaim && !identity.isOperator) {
    throw new ServiceError(
      403,
      "email-unverified",
      "Verify your email address before continuing.",
    );
  }
  return identity.uid;
}
