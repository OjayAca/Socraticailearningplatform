import { collection, doc, getDoc, getDocs, query, where, runTransaction, serverTimestamp, writeBatch, setDoc, type DocumentData, type Transaction } from "firebase/firestore";
import type { Difficulty, ReportKind } from "@mindguide/contracts";
import { currentUser, database, requireAdmin, millis } from "./firestore-client";
import { validateManagedContent, findForbiddenPublicKeys, recordProblemValidationSchema, parseInput, validateOperation } from "./learning/validation";
import { scoringReference } from "./learning/scoring-reference";
import { contentHash } from "./learning/content-hash";
import { aggregateReport, toCsv } from "./learning/reporting";

const consoleMessage = "Manage this Firebase Authentication operation in Firebase Console → Authentication → Users. No account was changed by this request.";
const managedCollections = ["subjects", "topics", "problems", "formula_theorem_references", "socratic_prompt_bank", "misconception_categories", "difficulty_policies"];

// Conservatively retain records referenced anywhere in saved managed/session material.
function references(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some(item => references(item, id));
  return !!value && typeof value === "object" && Object.values(value).some(item => references(item, id));
}

async function audit(name: string, target: string, reason = "") {
  await setDoc(doc(collection(database(), "audit_logs")), { actorId: currentUser().uid, action: name, target, reason, createdAt: serverTimestamp() });
}

function transactionAudit(tx: Transaction, action: string, target: string, details: object = {}) {
  tx.set(doc(collection(database(), "audit_logs")), { actorId: currentUser().uid, action, target, details, createdAt: serverTimestamp() });
}

async function validateLinks(name: string, value: Record<string, any>) {
  if (name === "socratic_prompt_bank") {
    if (!(await getDoc(doc(database(), "problems", value.problemId))).exists()) throw new Error("Choose an existing problem for this prompt.");
    return;
  }
  if (name === "difficulty_policies") {
    if (value.decreaseScoreThreshold > value.increaseScoreThreshold) throw new Error("The decrease threshold must not exceed the increase threshold.");
    if (value.subjectId && !(await getDoc(doc(database(), "subjects", value.subjectId))).exists()) throw new Error("Choose an existing subject.");
    if (value.topicId) {
      const topic = await getDoc(doc(database(), "topics", value.topicId));
      if (!topic.exists() || (value.subjectId && topic.get("subjectId") !== value.subjectId)) throw new Error("Choose a matching topic.");
    }
    return;
  }
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
    if (input.collection === "system_settings" && input.id === "privacy") {
      const policy = await tx.get(doc(database(), "policy_documents", String(value.currentConsentVersion)));
      if (!policy.exists() || policy.get("status") !== "active") throw new Error("Choose an existing active consent policy before saving settings.");
    }
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
    let formulaTheoremConditions: string[] = [];
    if (input.decision === "approved") {
      const [subject, topic, ...references] = await Promise.all([
        tx.get(doc(database(), "subjects", problem.get("subjectId"))),
        tx.get(doc(database(), "topics", problem.get("topicId"))),
        ...(problem.get("formulaTheoremReferenceIds") ?? []).map((id: string) => tx.get(doc(database(), "formula_theorem_references", id))),
      ]);
      if (subject.get("status") !== "approved" || topic.get("status") !== "approved" || topic.get("subjectId") !== problem.get("subjectId") || !references.length || references.some(item => item.get("status") !== "approved")) throw new Error("Approve the matching subject, topic, and instructional references before recording problem approval.");
      formulaTheoremConditions = references.flatMap(item => item.get("conditions") ?? []);
    }
    const validation: Record<string, any> = { ...input, problemVersion: problem.get("version"), createdBy: currentUser().uid, createdAt: serverTimestamp() };
    delete validation.requestId;
    const approved = { ...problem.data(), id: problem.id, status: input.decision, validationRecordId: input.requestId };
    const reference = input.decision === "approved" ? scoringReference({ ...solution.data(), formulaTheoremConditions }, approved, validation) : null;
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
  if (input.from !== undefined && input.to !== undefined && input.from > input.to) throw new Error("The report start date must not follow its end date.");
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
  input = validateOperation(name, input);
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
      transactionAudit(tx, name, input.userId, { reason: input.reason, status });
    });
    return { userId: input.userId, status };
  }
  if (name === "adminSubmitProblemValidation" || name === "adminArchiveContent") {
    const collectionName = name === "adminSubmitProblemValidation" ? "problems" : input.collection;
    const id = input.problemId ?? input.id;
    if (!managedCollections.includes(collectionName)) throw new Error("Unsupported content collection.");
    await runTransaction(db, async tx => {
      const ref = doc(db, collectionName, id);
      const existing = await tx.get(ref);
      if (!existing.exists()) throw new Error("Content no longer exists.");
      if (name === "adminSubmitProblemValidation" && !["draft", "rejected"].includes(existing.get("status"))) throw new Error("Only draft or rejected questions can be submitted for validation.");
      tx.update(ref, { status: name === "adminSubmitProblemValidation" ? "pending_validation" : "archived", updatedAt: serverTimestamp() });
      if (collectionName === "problems") tx.delete(doc(db, "problem_scoring", id));
      transactionAudit(tx, name, ref.path);
    });
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
    const ref = doc(db, input.collection, input.id);
    const sources = await Promise.all([...managedCollections, "sessions", "content_validation_records"].map(async name => ({ name, snapshot: await getDocs(collection(db, name)) })));
    for (const source of sources) for (const item of source.snapshot.docs) {
      if (source.name === input.collection && item.id === input.id) continue;
      if (references(item.data(), input.id)) throw new Error("This content is referenced by managed content or learning history. Archive it instead.");
      // References may also be pinned in protected material.
      if (["problems", "sessions"].includes(source.name)) {
        const privateRecords = await getDocs(collection(db, source.name, item.id, "private"));
        if (privateRecords.docs.some(record => references(record.data(), input.id))) throw new Error("This content is referenced by protected learning material. Archive it instead.");
      }
    }
    const privateRecords = input.collection === "problems" ? await getDocs(collection(db, "problems", input.id, "private")) : null;
    if ((privateRecords?.size ?? 0) > 450) throw new Error("Operator review is required for this record.");
    await runTransaction(db, async tx => {
      const existing = await tx.get(ref);
      if (!existing.exists() || !["draft", "rejected"].includes(existing.get("status"))) throw new Error("Only unused draft or rejected content can be deleted.");
      tx.delete(ref);
      if (input.collection === "problems") {
        tx.delete(doc(db, "problem_scoring", input.id));
        for (const record of privateRecords?.docs ?? []) tx.delete(record.ref);
      }
      transactionAudit(tx, name, ref.path, { reason: input.reason });
    });
    return { deleted: true, id: input.id };
  }
  if (name === "adminReviewSession") {
    if (!input.comment?.trim() || !["reviewed", "returned"].includes(input.outcome)) throw new Error("Choose a review outcome and add a comment.");
    const ref = doc(db, "sessions", input.sessionId);
    await runTransaction(db, async tx => {
      const session = await tx.get(ref);
      if (!session.get("statsCommittedAt")) throw new Error("Only submitted work can be reviewed.");
      const auditRef = doc(db, "audit_logs", `review_${input.requestId}`);
      const previous = await tx.get(auditRef);
      if (previous.exists()) {
        if (previous.get("target") !== ref.path) throw new Error("This request already belongs to another review.");
        return;
      }
      tx.update(ref, { status: input.outcome, adminReview: { outcome: input.outcome, comment: input.comment, reviewerId: currentUser().uid }, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), revision: session.get("revision") + 1 });
      tx.set(auditRef, { actorId: currentUser().uid, action: name, target: ref.path, details: { outcome: input.outcome, comment: input.comment }, createdAt: serverTimestamp() });
      tx.set(doc(db, "notifications", `review_${input.requestId}`), { recipientId: session.get("studentId"), eventType: input.outcome === "reviewed" ? "session_reviewed" : "session_returned", title: "Session reviewed", message: input.comment, actionUrl: `/session/${input.sessionId}/learn`, read: false, createdAt: serverTimestamp() });
    });
    return { sessionId: input.sessionId, outcome: input.outcome };
  }
  if (name === "adminOverrideSessionSupport") {
    if (!input.reason?.trim()) throw new Error("Record the reason for the support override.");
    const ref = doc(db, "sessions", input.sessionId);
    await runTransaction(db, async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists() || !snapshot.get("scorecard")) throw new Error("Score the session before authorizing additional support.");
      tx.update(ref, { allowedSupport: [...new Set([...(snapshot.get("allowedSupport") ?? []), input.level])], revision: snapshot.get("revision") + 1, updatedAt: serverTimestamp() });
      transactionAudit(tx, name, ref.path, { reason: input.reason, level: input.level });
    });
    return { sessionId: input.sessionId };
  }
  if (name === "adminPublishAnnouncement") {
    if (!input.title?.trim() || !input.message?.trim() || !input.reason?.trim()) throw new Error("Complete the announcement and reason.");
    const ref = doc(db, "announcements", input.requestId);
    const prior = await getDoc(ref);
    if (!prior.exists()) {
      const recipients = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("status", "==", "active")));
      if (recipients.size > 10000) throw new Error("This audience requires operator-managed delivery.");
      await runTransaction(db, async tx => {
        const existing = await tx.get(ref);
        if (existing.exists()) return;
        tx.set(ref, { title: input.title, message: input.message, reason: input.reason, recipientIds: recipients.docs.map(item => item.id), deliveryCount: 0, status: "delivering", createdAt: serverTimestamp() });
        transactionAudit(tx, name, ref.path, { reason: input.reason, audienceCount: recipients.size });
      });
    }
    let delivered = 0;
    let total = 0;
    try {
      let complete = false;
      while (!complete) {
        const result = await runTransaction(db, async tx => {
          const saved = await tx.get(ref);
          if (saved.get("title") !== input.title || saved.get("message") !== input.message || saved.get("reason") !== input.reason) throw new Error("Retry the original announcement without changing its contents.");
          const ids: string[] = saved.get("recipientIds");
          const offset = Number(saved.get("deliveryCount"));
          const page = ids.slice(offset, offset + 400);
          for (const id of page) tx.set(doc(db, "notifications", `announcement_${input.requestId}_${id}`), { recipientId: id, eventType: "announcement", title: input.title, message: input.message, read: false, createdAt: serverTimestamp() });
          const count = offset + page.length;
          if (saved.get("status") !== "published") {
            tx.update(ref, { deliveryCount: count, status: count === ids.length ? "published" : "delivering", updatedAt: serverTimestamp() });
            transactionAudit(tx, "announcement_delivery_batch", ref.path, { from: offset, delivered: page.length, totalDelivered: count });
          }
          return { delivered: count, total: ids.length, complete: count === ids.length };
        });
        ({ delivered, total, complete } = result);
      }
      return { announcementId: input.requestId, delivered, total, complete: true };
    } catch (error) {
      const saved = await getDoc(ref);
      return { announcementId: input.requestId, delivered: saved.get("deliveryCount") ?? delivered, total: saved.get("recipientIds")?.length ?? total, complete: false, error: error instanceof Error ? error.message : "Delivery interrupted." };
    }
  }
  if (name === "adminPilotRoster") {
    if (!input.uid?.trim() || input.uid.includes("/") || !["admitted", "revoked"].includes(input.status)) throw new Error("Choose a valid participant and cohort status.");
    await runTransaction(db, async tx => {
      const user = await tx.get(doc(db, "users", input.uid));
      if (!user.exists() || user.get("role") !== "student") throw new Error("Choose an existing student.");
      tx.set(doc(db, "pilot_roster", input.uid), { status: input.status, updatedAt: serverTimestamp() });
      transactionAudit(tx, name, input.uid, { status: input.status });
    });
    return { status: input.status };
  }
  if (name === "adminSetPilot") {
    if (!["closed", "open", "drain", "write-freeze"].includes(input.state) || !Array.isArray(input.enabledTopicIds) || input.enabledTopicIds.some((id: unknown) => typeof id !== "string" || !id || id.includes("/"))) throw new Error("Invalid cohort settings.");
    const batch = writeBatch(db);
    batch.set(doc(db, "system_settings", "pilot"), { state: input.state, enabledTopicIds: input.enabledTopicIds, releaseArtifactId: input.releaseArtifactId ?? null, updatedAt: serverTimestamp() }, { merge: true });
    batch.set(doc(collection(db, "audit_logs")), { actorId: currentUser().uid, action: name, target: "system_settings/pilot", createdAt: serverTimestamp() });
    await batch.commit();
  }
  if (name === "adminSetPilot" || name === "getPilotStatus") {
    const settings = await getDoc(doc(db, "system_settings", "pilot"));
    return { state: settings.get("state") ?? "closed", enabledTopicIds: settings.get("enabledTopicIds") ?? [], admitted: true, releaseArtifactId: settings.get("releaseArtifactId") ?? null };
  }
  throw new Error(`Unsupported administrator operation: ${name}`);
}
