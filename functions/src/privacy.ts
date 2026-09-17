import { observedWriter } from "./observed-writer.js";
import { createHash } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { adminAuth, database, FieldValue, REGION, Timestamp } from "./runtime.js";
import { inactivityReminderId, sessionLifecycleAction } from "./lifecycle.js";
import { effectiveCurrentStreak } from "./session-state.js";

const DAY_MS = 86_400_000;

export const enforceRetention = onSchedule(
  { schedule: "every day 02:00", region: REGION, timeZone: "Asia/Manila", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    if ((await database.doc("system_settings/pilot").get()).get("state") === "write-freeze") return;
    const now = Timestamp.now();
    const privacy = await database.doc("system_settings/privacy").get();
    const aiCutoff = Timestamp.fromMillis(now.toMillis() - Number(privacy.get("aiLogRetentionDays") ?? 90) * DAY_MS);
    await Promise.all([
      drainExpired(database.collection("ai_failure_logs").where("createdAt", "<=", aiCutoff), "ai_policy"),
      drainExpired(database.collectionGroup("private_ai").where("createdAt", "<=", aiCutoff), "private_ai_policy"),
      deleteExpired("ai_failure_logs", now),
      deleteExpired("idempotency", now),
      drainExpired(database.collection("assignment_reservations").where("createdAt", "<=", Timestamp.fromMillis(now.toMillis() - DAY_MS)), "assignment_reservations"),
      deleteExpired("rate_limits", now),
      deleteExpired("evaluation_locks", now),
      deleteExpiredCollectionGroup("private_ai", now),
      resetStaleStreaks(now),
    ]);

    const studyClosedAt = privacy.get("studyClosedAt") as Timestamp | undefined;
    if (!studyClosedAt) {
      console.info("Retention pseudonymization skipped: studyClosedAt is not configured.");
      return;
    }
    const retentionMonths = Number(privacy.get("identifiableRetentionMonths") ?? 12);
    const anonymizeAfter = studyClosedAt.toMillis() + retentionMonths * 30.4375 * DAY_MS;
    if (Date.now() < anonymizeAfter) return;

    const pending = await database.collection("privacy_jobs").where("status", "==", "processing").limit(100).get();
    for (const job of pending.docs) if (typeof job.get("targetUid") === "string") await anonymizeUser(job.get("targetUid"));
    let userCursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (let page = 0; page < 20; page++) {
      const query = database.collection("users").where("status", "in", ["active", "suspended", "deactivated"]).orderBy("__name__");
      const users = await (userCursor ? query.startAfter(userCursor) : query).limit(100).get();
      for (const user of users.docs) if (user.get("role") !== "admin") await anonymizeUser(user.id);
      if (users.size < 100) break;
      userCursor = users.docs.at(-1);
    }
    await drainExpired(database.collection("audit_logs").where("createdAt", "<=", Timestamp.fromMillis(anonymizeAfter)), "study_audits");
  }
);

export const enforceSessionLifecycle = onSchedule(
  { schedule: "every 60 minutes", region: REGION, timeZone: "Asia/Manila", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    if ((await database.doc("system_settings/pilot").get()).get("state") === "write-freeze") return;
    const now = Timestamp.now();
    const privacy = await database.doc("system_settings/privacy").get();
    await processInactiveSessions(Number(privacy.get("sessionInactivityHours") ?? 24), now);
  }
);

async function deleteExpired(collection: string, now: Timestamp): Promise<void> {
  await drainExpired(database.collection(collection).where("expiresAt", "<=", now), collection);
}

async function deleteExpiredCollectionGroup(group: string, now: Timestamp): Promise<void> {
  await drainExpired(database.collectionGroup(group).where("expiresAt", "<=", now), group);
}

export async function processInactiveSessions(inactivityHours: number, now: Timestamp): Promise<void> {
  const boundedHours = Math.min(Math.max(inactivityHours, 1), 24 * 30);
  const cutoff = Timestamp.fromMillis(now.toMillis() - boundedHours * 3_600_000 * 0.75);
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let page = 0; page < 20; page++) {
    let query = database.collection("sessions").where("status", "in", ["in_progress", "ready_for_submission"]).where("lastActivityAt", "<=", cutoff).orderBy("lastActivityAt").orderBy("__name__").limit(100);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const candidate of snapshot.docs) {
      await database.runTransaction(async transaction => {
        const fresh = await transaction.get(candidate.ref);
        if (!fresh.exists || !["in_progress", "ready_for_submission"].includes(fresh.get("status"))) return;
        const lastActivity = fresh.get("lastActivityAt") as Timestamp | undefined;
        if (!lastActivity || lastActivity.toMillis() > cutoff.toMillis()) return;
        const studentId = String(fresh.get("studentId") ?? "");
        const reminderRef = database.doc(`notifications/${inactivityReminderId(fresh.id, studentId)}`);
        const reminder = await transaction.get(reminderRef);
        const action = sessionLifecycleAction({ lastActivityAt: lastActivity.toMillis(), now: now.toMillis(), inactivityHours: boundedHours, reminderAlreadySent: reminder.exists });
        if (action === "expire") transaction.update(fresh.ref, { status: "expired", revision: FieldValue.increment(1), expiredAt: now, updatedAt: now });
        else if (action === "remind" && studentId && !reminder.exists) transaction.create(reminderRef, { eventType: "session_inactivity_reminder", senderId: "system", recipientId: studentId, sessionId: fresh.id, title: "Session expiring soon", message: "Resume this session before its inactivity window closes.", actionUrl: `/session/${fresh.id}/learn`, read: false, createdAt: now });
      });
    }
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < 100) break;
  }
}

async function resetStaleStreaks(now: Timestamp): Promise<void> {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let query = database.collection("learning_progress").orderBy("__name__").limit(250);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    const writer = observedWriter(database.bulkWriter());
    for (const doc of page.docs) {
      const date = typeof doc.get("lastSessionDate") === "string" ? doc.get("lastSessionDate") : null;
      if (Number(doc.get("currentStreak")) > 0 && effectiveCurrentStreak(Number(doc.get("currentStreak")), date, now.toDate()) === 0) writer.update(doc.ref, { currentStreak: 0, updatedAt: now });
    }
    await writer.close();
    if (page.size < 250) break;
    cursor = page.docs.at(-1);
  }
}

async function anonymizeUser(uid: string): Promise<void> {
  await purgeParticipantIdentity(uid);
  try { await adminAuth.deleteUser(uid); }
  catch (error) { if (!(typeof error === "object" && error && "code" in error && error.code === "auth/user-not-found")) throw error; }
  await database.recursiveDelete(database.doc(`users/${uid}`));
  await database.doc(`privacy_jobs/${createHash("sha256").update(uid).digest("hex")}`).set({ status: "complete", targetUid: FieldValue.delete(), classification: "pseudonymous", completedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Retain only a minimal pseudonymous numerical record; prose may contain identity. */
export async function purgeParticipantIdentity(uid: string): Promise<number> {
  const key = createHash("sha256").update(uid).digest("hex");
  const alias = `Learner-${key.slice(0, 12)}`;
  const job = database.doc(`privacy_jobs/${key}`);
  await job.set({ status: "processing", targetUid: uid, classification: "pseudonymous", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  // Close new writes before scanning; retries retain their completed page boundary.
  await database.doc(`pilot_roster/${uid}`).delete();
  const profile = database.doc(`users/${uid}`);
  if ((await profile.get()).exists) await profile.update({status:"deactivated"});
  const previous = await job.get();
  let cursor = previous.get("sessionCursor") as string | undefined;
  let processed = Number(previous.get("sessionsProcessed") ?? 0);
  while (true) {
    const query = database.collection("sessions").where("studentId", "in", [uid, alias]).orderBy("__name__");
    const sessions = await (cursor ? query.startAfter(cursor) : query).limit(100).get();
    if (sessions.empty) break;
    for (const session of sessions.docs) {
      const data = session.data();
      // Replace, never merge: raw question, draft, response text and identifiers are discarded.
      await session.ref.set({ studentId: alias, studentName: alias, schemaVersion: data.schemaVersion ?? 0, workflowVersion: data.workflowVersion ?? 0,
        status: "archived", subject: data.subject ?? null, topicId: data.topicId ?? null, topic: data.topic ?? null, difficulty: data.difficulty ?? null,
        submittedAt: data.submittedAt ?? null, createdAt: data.createdAt ?? null, ctScore: Number(data.ctScore ?? 0),
        responseCount: Number(data.responseCount ?? 0), pseudonymizedAt: FieldValue.serverTimestamp(), privacyClassification: "pseudonymous" });
      for (const collection of await session.ref.listCollections()) await database.recursiveDelete(collection);
    }
    cursor = sessions.docs.at(-1)!.id;
    processed += sessions.size;
    await job.update({sessionCursor:cursor,sessionsProcessed:processed,updatedAt:FieldValue.serverTimestamp()});
  }
  const purgeQuery = async (query: FirebaseFirestore.Query) => {
    for (let page = 0; page < 20; page++) {
      const docs = await query.limit(250).get();
      if (docs.empty) return;
      const writer = observedWriter(database.bulkWriter()); docs.docs.forEach(doc => writer.delete(doc.ref)); await writer.close();
    }
    if (!(await query.limit(1).get()).empty) throw new Error("Participant cleanup backlog remains; retry the durable job.");
  };
  for (const field of ["recipientId", "senderId"]) await purgeQuery(database.collection("notifications").where(field, "==", uid));
  for (const field of ["actorId", "target"]) await purgeQuery(database.collection("audit_logs").where(field, "in", [uid, `users/${uid}`]));
  for (const collection of ["idempotency", "ai_failure_logs", "rate_limits", "assignment_reservations"]) await purgeQuery(database.collection(collection).where("uid", "==", uid));
  await database.recursiveDelete(database.doc(`learning_progress/${uid}`));
  await database.doc(`pilot_roster/${uid}`).delete();
  if ((await profile.get()).exists) await profile.set({ role: "student", status: "deactivated", displayName: alias, privacyClassification: "pseudonymous" });
  const remaining = await database.collection("sessions").where("studentId", "==", uid).limit(1).get();
  if (!remaining.empty) throw new Error("Participant cleanup verification failed");
  return processed;
}

async function drainExpired(query: FirebaseFirestore.Query, name: string): Promise<void> {
  let deleted = 0;
  try {
    for (let page = 0; page < 20; page++) {
      const snapshot = await query.limit(250).get();
      if (snapshot.empty) break;
      const writer = observedWriter(database.bulkWriter());
      snapshot.docs.forEach(doc => writer.delete(doc.ref));
      await writer.close(); deleted += snapshot.size;
    }
    const backlog = !(await query.limit(1).get()).empty;
    await database.doc(`retention_jobs/${name}`).set({ status: backlog ? "backlog" : "complete", deleted, checkedAt: FieldValue.serverTimestamp() });
    if (backlog) console.error("Retention backlog remains", { collection: name });
  } catch (error) {
    await database.doc(`retention_jobs/${name}`).set({ status: "failed", deleted, checkedAt: FieldValue.serverTimestamp() });
    throw error;
  }
}
