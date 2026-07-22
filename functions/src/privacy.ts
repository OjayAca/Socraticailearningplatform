import { createHash } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { adminAuth, database, FieldValue, REGION, Timestamp } from "./runtime.js";

const DAY_MS = 86_400_000;

export const enforceRetention = onSchedule(
  { schedule: "every day 02:00", region: REGION, timeZone: "Asia/Manila", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    const now = Timestamp.now();
    const privacy = await database.doc("system_settings/privacy").get();
    await Promise.all([
      deleteExpired("ai_failure_logs", now),
      deleteExpired("idempotency", now),
      deleteExpired("rate_limits", now),
      deleteExpired("evaluation_locks", now),
      deleteExpiredCollectionGroup("private_ai", now),
      expireInactiveSessions(Number(privacy.get("sessionInactivityHours") ?? 24), now),
    ]);

    const studyClosedAt = privacy.get("studyClosedAt") as Timestamp | undefined;
    if (!studyClosedAt) {
      console.info("Retention anonymization skipped: studyClosedAt is not configured.");
      return;
    }
    const retentionMonths = Number(privacy.get("identifiableRetentionMonths") ?? 12);
    const anonymizeAfter = studyClosedAt.toMillis() + retentionMonths * 30.4375 * DAY_MS;
    if (Date.now() < anonymizeAfter) return;

    const users = await database.collection("users").where("status", "in", ["active", "suspended", "deactivated"]).get();
    for (const user of users.docs) {
      if (user.get("role") === "admin") continue;
      const lastActivity = user.get("lastActivityAt") as Timestamp | undefined;
      if (lastActivity && lastActivity.toMillis() > anonymizeAfter) continue;
      await anonymizeUser(user.id);
    }

    const auditCutoff = Timestamp.fromMillis(anonymizeAfter);
    const audits = await database.collection("audit_logs").where("createdAt", "<=", auditCutoff).limit(500).get();
    const writer = database.bulkWriter();
    audits.docs.forEach((document) => writer.delete(document.ref));
    await writer.close();
  }
);

async function deleteExpired(collection: string, now: Timestamp): Promise<void> {
  const snapshot = await database.collection(collection).where("expiresAt", "<=", now).limit(500).get();
  const writer = database.bulkWriter();
  snapshot.docs.forEach((document) => writer.delete(document.ref));
  await writer.close();
}

async function deleteExpiredCollectionGroup(group: string, now: Timestamp): Promise<void> {
  const snapshot = await database.collectionGroup(group).where("expiresAt", "<=", now).limit(500).get();
  const writer = database.bulkWriter();
  snapshot.docs.forEach((document) => writer.delete(document.ref));
  await writer.close();
}

async function expireInactiveSessions(inactivityHours: number, now: Timestamp): Promise<void> {
  const boundedHours = Math.min(Math.max(inactivityHours, 1), 24 * 30);
  const cutoff = Timestamp.fromMillis(now.toMillis() - boundedHours * 3_600_000);
  const snapshot = await database
    .collection("sessions")
    .where("status", "in", ["in_progress", "ready_for_submission"])
    .where("lastActivityAt", "<=", cutoff)
    .limit(500)
    .get();
  const writer = database.bulkWriter();
  snapshot.docs.forEach((document) => writer.update(document.ref, {
    status: "expired",
    revision: FieldValue.increment(1),
    expiredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));
  await writer.close();
}

async function anonymizeUser(uid: string): Promise<void> {
  const alias = `Learner-${createHash("sha256").update(uid).digest("hex").slice(0, 12)}`;
  const sessions = await database.collection("sessions").where("studentId", "==", uid).get();
  const writer = database.bulkWriter();
  writer.set(database.doc(`users/${uid}`), {
    displayName: alias,
    email: null,
    status: "deactivated",
    anonymizationState: "processing",
    anonymizationStartedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  sessions.docs.forEach((session) => writer.update(session.ref, { studentName: alias, studentEmail: null, anonymizedAt: FieldValue.serverTimestamp() }));
  await writer.close();
  try {
    await adminAuth.deleteUser(uid);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
    if (code !== "auth/user-not-found") {
      await database.doc(`users/${uid}`).update({
        anonymizationState: "failed",
        anonymizationError: "auth_identity_deletion_failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await database.collection("audit_logs").add({
        actorId: "retention-scheduler",
        action: "account_anonymization_failed",
        target: `users/${uid}`,
        details: { failure: "auth_identity_deletion_failed" },
        createdAt: FieldValue.serverTimestamp(),
      });
      console.error("Auth identity deletion failed", { uid, error });
      return;
    }
  }
  const completion = database.batch();
  completion.update(database.doc(`users/${uid}`), {
    status: "anonymized",
    anonymizationState: "complete",
    anonymizationError: null,
    anonymizedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  completion.create(database.collection("audit_logs").doc(), {
    actorId: "retention-scheduler",
    action: "account_anonymized",
    target: `users/${uid}`,
    details: { retainedAggregateRecords: sessions.size },
    createdAt: FieldValue.serverTimestamp(),
  });
  await completion.commit();
}
