#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  normalizeProfileV2,
  normalizeSessionV2,
  recalculateStats,
} from "./migration-v2-core.mjs";

const apply = process.argv.includes("--apply");
await loadLocalEnvironment();
const projectId =
  readArgument("--project") ??
  process.env.FIREBASE_PROJECT_ID ??
  process.env.GCLOUD_PROJECT ??
  process.env.VITE_FIREBASE_PROJECT_ID;

if (!projectId) {
  fail(
    "Missing Firebase project ID. Set VITE_FIREBASE_PROJECT_ID/FIREBASE_PROJECT_ID or pass --project=<id>."
  );
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}

const database = getFirestore();
database.settings({ ignoreUndefinedProperties: true });

console.log(`MINDGUIDE schema-v2 migration (${apply ? "APPLY" : "DRY RUN"})`);
console.log(`Firebase project: ${projectId}`);

const [usersSnapshot, sessionsSnapshot, notificationsSnapshot] =
  await Promise.all([
    database.collection("users").get(),
    database.collection("sessions").get(),
    database.collection("notifications").get(),
  ]);

const rawUsers = usersSnapshot.docs.map(toBackupRecord);
const rawSessions = sessionsSnapshot.docs.map(toBackupRecord);
const rawNotifications = notificationsSnapshot.docs.map(toBackupRecord);
const backupPath = await writeBackup({
  projectId,
  mode: apply ? "apply" : "dry-run",
  users: rawUsers,
  sessions: rawSessions,
  notifications: rawNotifications,
});

const normalizedSessions = new Map(
  sessionsSnapshot.docs.map((snapshot) => {
    const normalized = normalizeSessionV2(snapshot.id, snapshot.data());
    return [snapshot.id, normalized.data];
  })
);
const sessionsByStudent = new Map();
for (const session of normalizedSessions.values()) {
  const current = sessionsByStudent.get(session.studentId) ?? [];
  current.push(session);
  sessionsByStudent.set(session.studentId, current);
}

const sessionWrites = sessionsSnapshot.docs.flatMap((snapshot) => {
  const normalized = normalizeSessionV2(snapshot.id, snapshot.data());
  const existingCanonical = selectKeys(snapshot.data(), Object.keys(normalized.data));
  const hasLegacyFields = normalized.removeFields.some((field) =>
    Object.prototype.hasOwnProperty.call(snapshot.data(), field)
  );
  return hasLegacyFields || !sameData(existingCanonical, normalized.data)
    ? [{ ref: snapshot.ref, data: normalized.data }]
    : [];
});

const userWrites = usersSnapshot.docs.flatMap((snapshot) => {
  const current = snapshot.data();
  const profile = normalizeProfileV2(current);
  const stats = recalculateStats(sessionsByStudent.get(snapshot.id) ?? []);
  const patch = { ...profile, stats };
  return sameData(selectKeys(current, Object.keys(patch)), patch)
    ? []
    : [{ ref: snapshot.ref, data: patch }];
});

const notificationPlan = buildNotificationPlan(
  notificationsSnapshot.docs,
  normalizedSessions,
  database
);

console.log(`Backup: ${backupPath}`);
console.log(`User profiles to update: ${userWrites.length}`);
console.log(`Sessions to migrate: ${sessionWrites.length}`);
console.log(`Notifications to rewrite: ${notificationPlan.writes.length}`);
console.log(`Unmappable notifications left untouched: ${notificationPlan.skipped}`);

if (!apply) {
  console.log("Dry run complete. Re-run with --apply after reviewing the backup and counts.");
  process.exit(0);
}

const writer = database.bulkWriter();
writer.onWriteError((error) => {
  console.error(
    `Write failed for ${error.documentRef.path} (attempt ${error.failedAttempts}): ${error.message}`
  );
  return error.failedAttempts < 3;
});

for (const write of sessionWrites) {
  writer.set(write.ref, write.data);
}
for (const write of userWrites) {
  writer.set(write.ref, write.data, { merge: true });
}
for (const write of notificationPlan.writes) {
  writer.set(write.ref, write.data);
  if (write.previousRef && write.previousRef.path !== write.ref.path) {
    writer.delete(write.previousRef);
  }
}

await writer.close();
console.log("Migration applied successfully. Re-running in dry-run mode should report zero changes.");

function buildNotificationPlan(snapshots, sessions, db) {
  const writes = [];
  let skipped = 0;

  for (const snapshot of snapshots) {
    const source = snapshot.data();
    const session = sessions.get(source.sessionId);
    const recipientId = source.recipientId ?? source.userId;
    if (!session || !recipientId) {
      skipped += 1;
      continue;
    }

    const eventType = inferEventType(source, session, recipientId);
    const senderId =
      source.senderId ??
      (eventType === "session_reviewed" || eventType === "session_returned"
        ? session.reviewedBy
        : session.studentId);
    if (!eventType || !senderId) {
      skipped += 1;
      continue;
    }

    const id = `${eventType}__${source.sessionId}__${recipientId}`;
    const data = {
      eventType,
      senderId,
      recipientId,
      sessionId: source.sessionId,
      title: stringValue(source.title, defaultNotificationTitle(eventType)).slice(
        0,
        160
      ),
      message: stringValue(
        source.message,
        defaultNotificationMessage(eventType)
      ).slice(0, 1_000),
      read: source.read === true,
      actionUrl:
        eventType === "session_submitted"
          ? `/admin/review/${source.sessionId}`
          : `/session/${source.sessionId}/log`,
      createdAt:
        source.createdAt ??
        (eventType === "session_submitted"
          ? session.submittedAt
          : session.reviewedAt ?? session.updatedAt),
    };

    if (snapshot.id === id && sameData(snapshot.data(), data)) continue;
    writes.push({
      ref: db.collection("notifications").doc(id),
      previousRef: snapshot.ref,
      data,
    });
  }

  return { writes, skipped };
}

function inferEventType(source, session, recipientId) {
  if (
    [
      "session_submitted",
      "session_reviewed",
      "session_returned",
      "follow_up_started",
    ].includes(source.eventType)
  ) {
    return source.eventType;
  }
  const legacyType = String(source.type ?? "").toLowerCase();
  if (legacyType.includes("return") || session.status === "returned") {
    return recipientId === session.studentId ? "session_returned" : null;
  }
  if (legacyType.includes("review") || session.status === "reviewed") {
    return recipientId === session.studentId ? "session_reviewed" : null;
  }
  if (session.parentSessionId && recipientId !== session.studentId) {
    return "follow_up_started";
  }
  return recipientId !== session.studentId ? "session_submitted" : null;
}

function defaultNotificationTitle(eventType) {
  return {
    session_submitted: "New learner session",
    session_reviewed: "Session reviewed",
    session_returned: "Session returned",
    follow_up_started: "Follow-up attempt started",
  }[eventType];
}

function defaultNotificationMessage(eventType) {
  return {
    session_submitted: "A learner session is ready for administrator review.",
    session_reviewed: "Your administrator review is ready.",
    session_returned: "Your session was returned with guidance.",
    follow_up_started: "A learner started a linked follow-up attempt.",
  }[eventType];
}

async function writeBackup(contents) {
  const directory = path.resolve(".local-backups");
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = path.join(directory, `migration-v2-${stamp}.json`);
  await writeFile(
    filename,
    JSON.stringify({ createdAt: new Date().toISOString(), ...contents }, null, 2),
    "utf8"
  );
  return filename;
}

async function loadLocalEnvironment() {
  for (const filename of [".env", ".env.local"]) {
    try {
      const contents = await readFile(path.resolve(filename), "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function readArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toBackupRecord(snapshot) {
  return { id: snapshot.id, data: snapshot.data() };
}

function selectKeys(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

function sameData(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value) {
  return JSON.stringify(normalizeForComparison(value));
}

function normalizeForComparison(value) {
  if (value?.toMillis) return { __timestamp: value.toMillis() };
  if (Array.isArray(value)) return value.map(normalizeForComparison);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForComparison(value[key])])
    );
  }
  return value === undefined ? null : value;
}

function stringValue(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
