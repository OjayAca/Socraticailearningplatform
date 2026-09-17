import { onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { callableOptions, database, adminAuth, FieldValue, Timestamp } from "./runtime.js";
import { requireAdmin, requireActor } from "./security.js";
import { buildCatalogReadiness } from "./configuration.js";
import { callableError } from "./errors.js";

export async function requirePilotTransaction(transaction: FirebaseFirestore.Transaction, uid: string, newSession = false): Promise<void> {
  const [pilot, roster, profile] = await Promise.all([
    transaction.get(database.doc("system_settings/pilot")), transaction.get(database.doc(`pilot_roster/${uid}`)), transaction.get(database.doc(`users/${uid}`)),
  ]);
  const state = pilot.get("state") ?? "closed";
  if ((state !== "open" && !(state === "drain" && !newSession)) || roster.get("status") !== "admitted" || profile.get("status") !== "active") throw callableError("failed-precondition", "pilot_access_changed", "Participant access changed. Reload before continuing.");
  if (newSession) {
    const privacy = await transaction.get(database.doc("system_settings/privacy"));
    const version = privacy.get("currentConsentVersion");
    if (typeof version !== "string" || !version || !(await transaction.get(database.doc(`users/${uid}/consents/${version}`))).exists) throw callableError("failed-precondition", "current_consent_required", "Accept the current participant notice before starting new learning.");
  }
}
export async function requirePilotAccess(uid: string, options: { newSession?: boolean; topicId?: string } = {}): Promise<void> {
  const [release, cohort, identity] = await Promise.all([
    database.doc("system_settings/pilot").get(), database.doc(`pilot_roster/${uid}`).get(), adminAuth.getUser(uid),
  ]);
  const state = release.get("state") ?? "closed";
  if (state !== "open" && !(state === "drain" && !options.newSession)) {
    throw callableError("failed-precondition", "pilot_closed", "Participant learning is currently closed. Your saved work is preserved.");
  }
  if (cohort.get("status") !== "admitted" || cohort.get("uid") !== uid || !identity.emailVerified || identity.disabled) {
    throw callableError("permission-denied", "cohort_required", "A verified account and admission to the pilot cohort are required.");
  }
  if (options.newSession) {
    const artifactId = release.get("releaseArtifactId");
    const artifact = typeof artifactId === "string" && artifactId && !artifactId.includes("/")
      ? await database.doc(`release_artifacts/${artifactId}`).get() : null;
    if (!artifact || artifact.get("status") !== "approved" || !process.env.RELEASE_ARTIFACT_HASH
      || artifact.get("artifactHash") !== process.env.RELEASE_ARTIFACT_HASH
      || artifact.get("projectId") !== (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT)
      || JSON.stringify(artifact.get("enabledTopicIds")) !== JSON.stringify(release.get("enabledTopicIds") ?? [])) {
      throw callableError("failed-precondition", "release_evidence_changed", "The running release does not match approved participant evidence. New sessions are closed.");
    }
  }
  const topics = release.get("enabledTopicIds");
  if (options.topicId && (!Array.isArray(topics) || !topics.includes(options.topicId))) {
    throw callableError("failed-precondition", "topic_disabled", "This topic is not enabled for the pilot.");
  }
}

export async function requireContentWrites(): Promise<void> {
  const settings = await database.doc("system_settings/pilot").get();
  if (settings.get("state") === "write-freeze") throw callableError("failed-precondition", "write_freeze", "Content changes are frozen for maintenance.");
}

export async function aiLogExpiry(): Promise<Timestamp> {
  const settings = await database.doc("system_settings/privacy").get();
  const days = Number(settings.get("aiLogRetentionDays") ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw callableError("failed-precondition", "invalid_retention", "Configure a valid AI log retention period.");
  return Timestamp.fromMillis(Date.now() + days * 86_400_000);
}

export const adminPilotRoster = onCall(callableOptions, async request => {
  const actor = await requireAdmin(request);
  const data = z.object({ uid: z.string().min(1).max(128), status: z.enum(["admitted", "revoked"]) }).strict().parse(request.data);
  const identity = await adminAuth.getUser(data.uid);
  if (data.status === "admitted" && (!identity.emailVerified || identity.disabled)) throw callableError("failed-precondition", "verified_identity_required", "The participant must verify their authentication email before admission.");
  await database.runTransaction(async transaction => {
    transaction.set(database.doc(`pilot_roster/${data.uid}`), { ...data, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(database.collection("audit_logs").doc(), { actorId: actor.uid, action: "pilot_roster_updated", target: data.uid, details: { status: data.status }, createdAt: FieldValue.serverTimestamp() });
  });
  return { status: data.status };
});

export const getPilotStatus = onCall(callableOptions, async request => {
  const actor = await requireActor(request);
  const [settings, roster] = await Promise.all([database.doc("system_settings/pilot").get(), database.doc(`pilot_roster/${actor.uid}`).get()]);
  return { state: settings.get("state") ?? "closed", enabledTopicIds: settings.get("enabledTopicIds") ?? [], admitted: roster.get("status") === "admitted", releaseArtifactId: actor.role === "admin" ? settings.get("releaseArtifactId") ?? null : null };
});

export const adminSetPilot = onCall(callableOptions, async request => {
  const actor = await requireAdmin(request);
  const data = z.object({ state: z.enum(["closed", "open", "drain", "write-freeze"]), enabledTopicIds: z.array(z.string().min(1).max(160)).max(11), maxDailyAiCalls: z.number().int().min(1).max(100000).default(5000), maxDailySessionStarts: z.number().int().min(1).max(10000).default(500), releaseArtifactId: z.string().max(160).optional() }).strict().parse(request.data);
  if (new Set(data.enabledTopicIds).size !== data.enabledTopicIds.length) throw callableError("invalid-argument", "duplicate_topics", "Select each topic only once.");
  const ref = database.doc("system_settings/pilot");
  if (data.state === "open") {
    const current = await ref.get();
    if (JSON.stringify(data.enabledTopicIds) !== JSON.stringify(current.get("enabledTopicIds") ?? [])) throw callableError("failed-precondition", "configure_closed_first", "Configure the topic selection while closed, then verify readiness.");
    const readiness = await buildCatalogReadiness();
    if (!readiness.ready) throw callableError("failed-precondition", "pilot_not_ready", readiness.issues.join(" "));
    const artifact = data.releaseArtifactId ? await database.doc(`release_artifacts/${data.releaseArtifactId}`).get() : null;
    if (!artifact || artifact.get("status") !== "approved" || !process.env.RELEASE_ARTIFACT_HASH || artifact.get("artifactHash") !== process.env.RELEASE_ARTIFACT_HASH
      || artifact.get("projectId") !== (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT)
      || JSON.stringify(artifact.get("enabledTopicIds")) !== JSON.stringify(data.enabledTopicIds)) throw callableError("failed-precondition", "release_evidence_missing", "A matching approved release artifact and owner evidence are required before participant access opens.");
    const privacy = await database.doc("system_settings/privacy").get();
    if (!privacy.get("studyClosedAt") || !privacy.get("policyEvidenceReference") || !privacy.get("currentConsentVersion") || !Number.isFinite(privacy.get("identifiableRetentionMonths"))) throw callableError("failed-precondition", "privacy_approval_missing", "Approved privacy dates, policy evidence and consent version are required.");
  }
  if (data.state === "drain") {
    const previous = await ref.get();
    if (!["open", "drain"].includes(previous.get("state"))) throw callableError("failed-precondition", "drain_unavailable", "Drain is available only for a currently open pilot.");
    data.enabledTopicIds = previous.get("enabledTopicIds") ?? [];
  }
  await database.runTransaction(async transaction => {
    transaction.set(ref, { ...data, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(database.collection("audit_logs").doc(), { actorId: actor.uid, action: "pilot_release_state", target: ref.path, details: data, createdAt: FieldValue.serverTimestamp() });
  });
  return { state: data.state, enabledTopicIds: data.enabledTopicIds };
});

export const adminReviewPilotRubric = onCall(callableOptions, async request => {
  const actor = await requireAdmin(request);
  await requireContentWrites();
  const data = z.object({ decision: z.enum(["approved", "rejected"]), facultyEvidence: z.string().min(10).max(1000), evidenceHash: z.string().regex(/^[a-f0-9]{64}$/), calibrationEvidence: z.string().min(10).max(1000), expectedVersion: z.number().int().positive() }).strict().parse(request.data);
  await database.runTransaction(async transaction => {
    const ref = database.doc("rubrics/pilot-v5"), current = await transaction.get(ref);
    if (!current.exists || current.get("version") !== data.expectedVersion) throw callableError("aborted", "rubric_version_changed", "Reload the rubric before recording its faculty review.");
    transaction.update(ref, { status: data.decision, facultyEvidence: data.facultyEvidence, evidenceHash: data.evidenceHash, calibrationEvidence: data.calibrationEvidence, calibrationStatus: data.decision === "approved" ? "calibrated" : "pending", version: data.expectedVersion + 1, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(database.collection("audit_logs").doc(), { actorId: actor.uid, action: "rubric_review_recorded", target: ref.path, details: data, createdAt: FieldValue.serverTimestamp() });
  });
  return { status: data.decision };
});
