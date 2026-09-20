import { collection, doc, getDoc, getDocs, query, where, runTransaction, serverTimestamp, writeBatch, updateDoc, setDoc, deleteDoc, type DocumentData, type Transaction } from "firebase/firestore";
import type { Difficulty, ReportKind } from "@mindguide/contracts";
import { currentUser, database, requireAdmin, millis } from "./firestore-client";
import { validateManagedContent, findForbiddenPublicKeys, recordProblemValidationSchema, parseInput } from "./learning/validation";
import { scoringReference } from "./learning/scoring-reference";
import { contentHash } from "./learning/content-hash";
import { aggregateReport, toCsv } from "./learning/reporting";

const consoleMessage = "Manage this Firebase Authentication operation in Firebase Console → Authentication → Users. No account was changed by this request.";

async function audit(name: string, target: string, reason = "") {
  await setDoc(doc(collection(database(), "audit_logs")), { actorId: currentUser().uid, action: name, target, reason, createdAt: serverTimestamp() });
}

function transactionAudit(tx: Transaction, action: string, target: string, details: object = {}) {
  tx.set(doc(collection(database(), "audit_logs")), { actorId: currentUser().uid, action, target, details, createdAt: serverTimestamp() });
}

async function validateLinks(name: string, value: Record<string, any>) {
  if (!["topics", "problems"].includes(name)) return;
  const subject = await getDoc(doc(database(), "subjects", value.subjectId));
  if (!subject.exists()) throw new Error("Choose an existing subject.");
  if (value.subject && value.subject !== subject.get("name")) throw new Error("The subject name does not match the selected subject.");
  if (name === "topics") return;
  const topic = await getDoc(doc(database(), "topics", value.topicId));
  if (!topic.exists() || topic.get("subjectId") !== value.subjectId || topic.get("name") !== value.topic) throw new Error("Choose a matching topic in this subject.");
  for (const id of value.formulaTheoremReferenceIds ?? []) {
    if (!(await getDoc(doc(database(), "formula_theorem_references", id))).exists()) throw new Error(`Instructional reference ${id} is unavailable.`);
  }
}

async function upsert(input: any) {
  if (findForbiddenPublicKeys(input.value, input.collection === "problems").length) throw new Error("Private fields must be stored in the protected solution, not public content.");
  const value = validateManagedContent(input.collection, input.id, input.value);
  await validateLinks(input.collection, value);
  if (input.collection === "problems" && value.status === "approved") throw new Error("Approve questions through the recorded validation workflow.");
  const ref = doc(database(), input.collection, input.id);
  return runTransaction(database(), async tx => {
    const existing = await tx.get(ref);
    const version = Number(existing.get("version") ?? 0) + 1;
    const { privateSolution, ...publicValue } = value;
    tx.set(ref, { ...publicValue, version, createdAt: existing.get("createdAt") ?? serverTimestamp(), createdBy: existing.get("createdBy") ?? currentUser().uid, updatedAt: serverTimestamp(), updatedBy: currentUser().uid });
    if (input.collection === "problems") {
      tx.delete(doc(database(), "problem_scoring", input.id));
      if (privateSolution) tx.set(doc(database(), "problems", input.id, "private", "solution"), { ...privateSolution as object, version, updatedAt: serverTimestamp() });
    }
    transactionAudit(tx, "content_upsert", ref.path, { version });
    return { id: input.id, collection: input.collection, version };
  });
}

async function validateProblem(raw: any) {
  const input = parseInput(recordProblemValidationSchema, raw);
  const ref = doc(database(), "problems", input.problemId);
  return runTransaction(database(), async tx => {
    const [problem, solution, existing] = await Promise.all([tx.get(ref), tx.get(doc(database(), "problems", input.problemId, "private", "solution")), tx.get(doc(database(), "content_validation_records", input.requestId))]);
    if (existing.exists()) return { status: existing.get("decision"), validationRecordId: existing.id };
    if (!problem.exists() || problem.get("status") !== "pending_validation") throw new Error("Submit the question for validation first.");
    const validation: Record<string, any> = { ...input, problemVersion: problem.get("version"), createdBy: currentUser().uid, createdAt: serverTimestamp() };
    delete validation.requestId;
    const approved = { ...problem.data(), id: problem.id, status: input.decision, validationRecordId: input.requestId };
    const reference = input.decision === "approved" ? scoringReference(solution.data() ?? {}, approved, validation) : null;
    if (reference) validation.scoringSnapshotHash = await contentHash(reference);
    tx.set(doc(database(), "content_validation_records", input.requestId), validation);
    tx.update(ref, { status: input.decision, validationRecordId: input.requestId, validatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (reference) tx.set(doc(database(), "problem_scoring", input.problemId), reference);
    else tx.delete(doc(database(), "problem_scoring", input.problemId));
    transactionAudit(tx, "problem_validation_decision", ref.path, { decision: input.decision, validationRecordId: input.requestId });
    return { status: input.decision, validationRecordId: input.requestId };
  });
}

async function readiness() {
  const [topics, problems, references] = await Promise.all(["topics", "problems", "problem_scoring"].map(name => getDocs(collection(database(), name))));
  const scoring = new Map(references.docs.map(item => [item.id, item.data()]));
  const approved = problems.docs.filter(item => item.get("status") === "approved" && item.get("validationRecordId") && scoring.get(item.id)?.problemVersion === item.get("version"));
  const cells = topics.docs.filter(item => item.get("status") === "approved").flatMap(topic => (["Basic", "Intermediate", "Advanced"] as Difficulty[]).map(difficulty => {
    const count = approved.filter(item => item.get("topicId") === topic.id && item.get("difficulty") === difficulty).length;
    return { topicId: topic.id, difficulty, approvedVariants: count, ready: count > 0 };
  }));
  return { ready: approved.length > 0, expectedProblemCount: cells.length, approvedProblemCount: approved.length, cells, issues: cells.filter(cell => !cell.ready).map(cell => `${cell.topicId} / ${cell.difficulty}: no available validated question.`), generatedAt: Date.now() };
}

async function report(input: any) {
  const snapshot = await getDocs(collection(database(), "sessions"));
  const eventField = ["activity", "usage"].includes(input.kind) ? "createdAt" : "submittedAt";
  const records = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as DocumentData)).filter(item =>
    (eventField === "createdAt" || item.statsCommittedAt) && (!input.subject || item.subject === input.subject) && (!input.topic || item.topic === input.topic)
    && (input.from === undefined || millis(item[eventField]) >= input.from) && (input.to === undefined || millis(item[eventField]) <= input.to));
  if (!input.includeIdentity) for (const record of records) record.studentId = (await contentHash(record.studentId)).slice(0, 12);
  const rows = aggregateReport(records, { kind: input.kind as ReportKind, includeIdentity: Boolean(input.includeIdentity) });
  const offset = Number(input.cursor ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid report cursor.");
  const page = rows.slice(offset, offset + (input.limit ?? 100));
  return { kind: input.kind, rows: page, totalRows: rows.length, populationCount: records.length, eventField, generatedAt: Date.now(), pseudonymized: !input.includeIdentity, complete: offset + page.length >= rows.length, nextCursor: offset + page.length < rows.length ? String(offset + page.length) : null };
}

export async function adminOperation(name: string, input: any): Promise<any> {
  await requireAdmin();
  const db = database();
  if (name === "adminUpsertContent") return upsert(input);
  if (name === "adminRecordProblemValidation") return validateProblem(input);
  if (name === "adminCatalogReadiness") return readiness();
  if (name === "adminQueryReport") return report(input);
  if (name === "adminExportReport") {
    if (!input.exportReason?.trim()) throw new Error("Record the reason for this export.");
    // One immutable browser snapshot per export avoids inconsistent pages while learners submit.
    const result = await report({ ...input, cursor: undefined, limit: Number.MAX_SAFE_INTEGER });
    await audit(name, input.kind, input.exportReason);
    return input.output === "csv" ? { ...result, output: "csv", csv: toCsv(result.rows), filename: `mindguide-${input.kind}.csv` } : { ...result, output: "print" };
  }
  if (name === "adminDeleteUser") throw new Error(consoleMessage);
  if (name === "adminManageUser") {
    if (["promote", "demote", "anonymize", "reset_access"].includes(input.action)) throw new Error(consoleMessage);
    const statuses: Record<string, string> = { suspend: "suspended", activate: "active", deactivate: "deactivated" };
    const status = statuses[input.action];
    if (!status || !input.reason?.trim()) throw new Error("Choose an account action and record a reason.");
    const ref = doc(db, "users", input.userId);
    await runTransaction(db, async tx => {
      const target = await tx.get(ref);
      if (target.get("role") === "admin") throw new Error("Manage administrator accounts through Firebase Console.");
      tx.update(ref, { status, updatedAt: serverTimestamp() });
    });
    await audit(name, input.userId, input.reason);
    return { userId: input.userId, status };
  }
  if (name === "adminSubmitProblemValidation" || name === "adminArchiveContent") {
    const collectionName = name === "adminSubmitProblemValidation" ? "problems" : input.collection;
    const id = input.problemId ?? input.id;
    const batch = writeBatch(db);
    batch.update(doc(db, collectionName, id), { status: name === "adminSubmitProblemValidation" ? "pending_validation" : "archived", updatedAt: serverTimestamp() });
    if (collectionName === "problems") batch.delete(doc(db, "problem_scoring", id));
    await batch.commit();
    return { id };
  }
  if (name === "adminBulkImportProblems") {
    const ids = new Set<string>();
    for (const item of input.problems) {
      if (ids.has(item.id)) throw new Error("Duplicate question IDs in import.");
      ids.add(item.id);
      const value = validateManagedContent("problems", item.id, { ...item, status: "draft" });
      await validateLinks("problems", value);
    }
    if (!input.dryRun) for (const item of input.problems) await upsert({ collection: "problems", id: item.id, value: { ...item, status: "draft" } });
    return { dryRun: input.dryRun, imported: input.dryRun ? 0 : ids.size, checked: ids.size, validated: ids.size, issues: [] };
  }
  if (name === "adminDeleteContent") {
    // Historical links must survive. Referenced records can be archived instead.
    const sessions = await getDocs(collection(db, "sessions"));
    const keys: Record<string, string> = { problems: "problemId", topics: "topicId", subjects: "subjectId" };
    const key = keys[input.collection];
    if (key && sessions.docs.some(item => item.get(key) === input.id)) throw new Error("This content is used in learning history. Archive it instead.");
    await deleteDoc(doc(db, input.collection, input.id));
    if (input.collection === "problems") await deleteDoc(doc(db, "problem_scoring", input.id));
    return { deleted: true, id: input.id };
  }
  if (name === "adminReviewSession") {
    if (!input.comment?.trim() || !["reviewed", "returned"].includes(input.outcome)) throw new Error("Choose a review outcome and add a comment.");
    const ref = doc(db, "sessions", input.sessionId);
    await runTransaction(db, async tx => {
      const session = await tx.get(ref);
      if (!session.get("statsCommittedAt")) throw new Error("Only submitted work can be reviewed.");
      tx.update(ref, { status: input.outcome, adminReview: { outcome: input.outcome, comment: input.comment, reviewerId: currentUser().uid }, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), revision: session.get("revision") + 1 });
      tx.set(doc(db, "notifications", `review_${input.requestId}`), { recipientId: session.get("studentId"), eventType: input.outcome === "reviewed" ? "session_reviewed" : "session_returned", title: "Session reviewed", message: input.comment, actionUrl: `/session/${input.sessionId}/learn`, read: false, createdAt: serverTimestamp() });
    });
    return { sessionId: input.sessionId, outcome: input.outcome };
  }
  if (name === "adminOverrideSessionSupport") {
    if (!input.reason?.trim()) throw new Error("Record the reason for the support override.");
    const ref = doc(db, "sessions", input.sessionId);
    const snapshot = await getDoc(ref);
    await updateDoc(ref, { allowedSupport: [...new Set([...(snapshot.get("allowedSupport") ?? []), input.level])], revision: snapshot.get("revision") + 1, updatedAt: serverTimestamp() });
    await audit(name, input.sessionId, input.reason);
    return { sessionId: input.sessionId };
  }
  if (name === "adminPublishAnnouncement") {
    if (!input.title?.trim() || !input.message?.trim() || !input.reason?.trim()) throw new Error("Complete the announcement and reason.");
    const recipients = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("status", "==", "active")));
    for (let offset = 0; offset < recipients.size; offset += 400) {
      const batch = writeBatch(db);
      for (const recipient of recipients.docs.slice(offset, offset + 400)) batch.set(doc(db, "notifications", `announcement_${input.requestId}_${recipient.id}`), { recipientId: recipient.id, eventType: "announcement", title: input.title, message: input.message, read: false, createdAt: serverTimestamp() });
      await batch.commit();
    }
    await setDoc(doc(db, "announcements", input.requestId), { title: input.title, message: input.message, deliveryCount: recipients.size, status: "published", createdAt: serverTimestamp() });
    return { announcementId: input.requestId, delivered: recipients.size };
  }
  if (name === "adminPilotRoster") {
    await setDoc(doc(db, "pilot_roster", input.uid), { status: input.status, updatedAt: serverTimestamp() });
    return { status: input.status };
  }
  if (name === "adminSetPilot") await setDoc(doc(db, "system_settings", "pilot"), { ...input, updatedAt: serverTimestamp() }, { merge: true });
  if (name === "adminSetPilot" || name === "getPilotStatus") {
    const settings = await getDoc(doc(db, "system_settings", "pilot"));
    return { state: settings.get("state") ?? "closed", enabledTopicIds: settings.get("enabledTopicIds") ?? [], admitted: true, releaseArtifactId: settings.get("releaseArtifactId") ?? null };
  }
  throw new Error(`Unsupported administrator operation: ${name}`);
}
