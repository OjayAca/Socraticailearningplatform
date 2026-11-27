import "server-only";
import type { Auth as AdminAuth } from "firebase-admin/auth";
import {
  FieldValue,
  type DocumentReference,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "./firebase";
import { ServiceError } from "./platform";

const AUTH_GET_USERS_BATCH_SIZE = 100;
const FIRESTORE_BATCH_LIMIT = 400;

/** Result returned after syncing the signed-in user's email verification state. */
export interface SelfVerificationSyncResult {
  readonly synced: boolean;
  readonly emailVerified: boolean;
}

/** Summary returned after an administrator bulk-syncs user verification states. */
export interface AdminVerificationSyncResult {
  readonly checked: number;
  readonly updated: number;
  readonly alreadySynced: number;
  readonly verified: number;
  readonly unverified: number;
  readonly missingInAuth: number;
  readonly statuses: Readonly<Record<string, boolean>>;
}

interface PendingVerificationUpdate {
  readonly ref: DocumentReference;
  readonly emailVerified: boolean;
}

function isAuthPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    code === "auth/insufficient-permission" ||
    code === "PERMISSION_DENIED" ||
    candidate.status === 403 ||
    /insufficient permission|permission_denied|firebaseauth\.users\.get/i.test(message)
  );
}

/**
 * Syncs a single authenticated user's Firebase Auth `emailVerified` status onto their
 * Firestore `users/{uid}` document via the Admin SDK, skipping redundant writes.
 *
 * @param uid - The verified user's UID.
 * @param emailVerified - The `email_verified` boolean from the verified ID token.
 * @param firestore - Optional Admin Firestore instance for testing.
 * @returns Whether the Firestore document was updated and the persisted verification state.
 */
export async function syncSingleUserEmailVerification(
  uid: string,
  emailVerified: boolean,
  firestore: AdminFirestore = getAdminFirestore(),
): Promise<SelfVerificationSyncResult> {
  try {
    const userRef = firestore.doc(`users/${uid}`);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
      return { synced: false, emailVerified };
    }
    if (snapshot.get("emailVerified") === emailVerified) {
      return { synced: false, emailVerified };
    }
    await userRef.update({
      emailVerified,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { synced: true, emailVerified };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      503,
      "database-unavailable",
      "Account verification status could not be synced right now.",
    );
  }
}

/**
 * Syncs `emailVerified` from Firebase Auth onto all Firestore `users/{uid}` documents
 * on behalf of an active administrator, recording an audit log entry.
 *
 * @param actorUid - Authenticated administrator UID requesting the sync.
 * @param deps - Optional Firebase Admin Auth and Firestore instances for testing.
 * @returns Aggregate counts and per-UID verification statuses.
 */
export async function syncAllUsersEmailVerification(
  actorUid: string,
  deps?: { auth?: AdminAuth; firestore?: AdminFirestore },
): Promise<AdminVerificationSyncResult> {
  const firestore = deps?.firestore ?? getAdminFirestore();
  const adminAuth = deps?.auth ?? getAdminAuth();

  let actorSnap;
  try {
    actorSnap = await firestore.doc(`users/${actorUid}`).get();
  } catch {
    throw new ServiceError(
      503,
      "database-unavailable",
      "Administrator profile could not be verified right now.",
    );
  }

  const actorData = actorSnap.data();
  if (!actorSnap.exists || actorData?.role !== "admin" || actorData?.status !== "active") {
    throw new ServiceError(403, "forbidden", "Active administrator access is required.");
  }

  let usersSnapshot;
  try {
    usersSnapshot = await firestore.collection("users").get();
  } catch {
    throw new ServiceError(
      503,
      "database-unavailable",
      "User records could not be loaded for verification sync.",
    );
  }

  const docs = usersSnapshot.docs;
  const authVerifiedByUid = new Map<string, boolean>();

  for (let offset = 0; offset < docs.length; offset += AUTH_GET_USERS_BATCH_SIZE) {
    const chunk = docs.slice(offset, offset + AUTH_GET_USERS_BATCH_SIZE);
    try {
      const response = await adminAuth.getUsers(chunk.map((item) => ({ uid: item.id })));
      for (const userRecord of response.users) {
        authVerifiedByUid.set(userRecord.uid, userRecord.emailVerified === true);
      }
    } catch (error) {
      if (isAuthPermissionError(error)) {
        throw new ServiceError(
          503,
          "auth-admin-permission-required",
          "Bulk verification sync requires Firebase Auth Viewer (firebaseauth.users.get) permission on the backend service account. Individual learners still sync automatically when they sign in or verify their email.",
        );
      }
      throw new ServiceError(
        503,
        "auth-unavailable",
        "Firebase Authentication lookup is temporarily unavailable.",
      );
    }
  }

  const statuses: Record<string, boolean> = {};
  const pendingUpdates: PendingVerificationUpdate[] = [];
  let alreadySynced = 0;
  let verified = 0;
  let unverified = 0;
  let missingInAuth = 0;

  for (const userDoc of docs) {
    const authVerified = authVerifiedByUid.get(userDoc.id);
    if (authVerified === undefined) {
      missingInAuth += 1;
      continue;
    }
    statuses[userDoc.id] = authVerified;
    if (authVerified) {
      verified += 1;
    } else {
      unverified += 1;
    }
    if (userDoc.get("emailVerified") !== authVerified) {
      pendingUpdates.push({ ref: userDoc.ref, emailVerified: authVerified });
    } else {
      alreadySynced += 1;
    }
  }

  try {
    for (let offset = 0; offset < pendingUpdates.length; offset += FIRESTORE_BATCH_LIMIT) {
      const batch = firestore.batch();
      const slice = pendingUpdates.slice(offset, offset + FIRESTORE_BATCH_LIMIT);
      for (const updateItem of slice) {
        batch.update(updateItem.ref, {
          emailVerified: updateItem.emailVerified,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    const summary: AdminVerificationSyncResult = {
      checked: docs.length,
      updated: pendingUpdates.length,
      alreadySynced,
      verified,
      unverified,
      missingInAuth,
      statuses,
    };

    await firestore.collection("audit_logs").doc().set({
      actorId: actorUid,
      action: "adminSyncEmailVerification",
      target: "users",
      details: {
        checked: summary.checked,
        updated: summary.updated,
        alreadySynced: summary.alreadySynced,
        verified: summary.verified,
        unverified: summary.unverified,
        missingInAuth: summary.missingInAuth,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    return summary;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      503,
      "database-unavailable",
      "Account verification updates could not be saved right now.",
    );
  }
}
