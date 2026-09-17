import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("These tests require the Firestore emulator.");
if (!getApps().length) initializeApp({ projectId: "mindguide-test" });
const db = getFirestore();
const { adminAuth } = await import("../../functions/src/runtime");
const { requirePilotAccess } = await import("../../functions/src/pilot");
const { beginIdempotentRequest, completeIdempotentRequest, releaseIdempotentRequest } = await import("../../functions/src/security");
const { processInactiveSessions, purgeParticipantIdentity } = await import("../../functions/src/privacy");
const { queryReportPage } = await import("../../functions/src/reporting");

beforeAll(() => { vi.stubEnv("RELEASE_ARTIFACT_HASH", "fixture-release"); vi.stubEnv("GCLOUD_PROJECT", "mindguide-test"); vi.spyOn(adminAuth,"getUser").mockImplementation(async uid => ({uid,emailVerified:true,disabled:false} as Awaited<ReturnType<typeof adminAuth.getUser>>)); });
beforeEach(async () => { for (const collection of await db.listCollections()) await db.recursiveDelete(collection); });
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("pilot transaction integration", () => {
  it("enforces closed admission, cohort and drain independently of the browser", async () => {
    await expect(requirePilotAccess("student", {newSession:true})).rejects.toThrow();
    await db.doc("system_settings/pilot").set({state:"open", enabledTopicIds:["topic"]});
    await expect(requirePilotAccess("student", {newSession:true})).rejects.toThrow();
    await db.doc("pilot_roster/student").set({uid:"student",status:"admitted"});
    await expect(requirePilotAccess("student", {newSession:true,topicId:"topic"})).rejects.toThrow(/release/);
    await db.doc("release_artifacts/fixture-release").set({status:"approved",artifactHash:"fixture-release",projectId:"mindguide-test",enabledTopicIds:["topic"]});
    await db.doc("system_settings/pilot").update({releaseArtifactId:"fixture-release"});
    await expect(requirePilotAccess("student", {newSession:true,topicId:"topic"})).resolves.toBeUndefined();
    await db.doc("system_settings/pilot").update({state:"drain"});
    await expect(requirePilotAccess("student", {newSession:true})).rejects.toThrow();
    await expect(requirePilotAccess("student")).resolves.toBeUndefined();
    await db.doc("system_settings/pilot").update({state:"write-freeze"});
    await expect(requirePilotAccess("student")).rejects.toThrow();
  });
  it("replays completed operations, rejects changed input, and retains input binding after failure", async () => {
    const id = randomUUID();
    const op = await beginIdempotentRequest("student","start",id,{topic:"a"});
    await expect(beginIdempotentRequest("student","start",id,{topic:"b"})).rejects.toThrow();
    await releaseIdempotentRequest(op.ref);
    const retried = await beginIdempotentRequest("student","start",id,{topic:"a"});
    await db.runTransaction(async tx => { completeIdempotentRequest(tx,retried.ref,{sessionId:"one"}); });
    expect((await beginIdempotentRequest("student","start",id,{topic:"a"})).cached).toEqual({sessionId:"one"});
  });
  it("prevents an expired worker from committing business writes after lease takeover", async () => {
    const id = randomUUID();
    const stale = await beginIdempotentRequest("student","start",id,{topic:"a"});
    await stale.ref.update({leaseExpiresAt:Timestamp.fromMillis(1)});
    const recovered = await beginIdempotentRequest("student","start",id,{topic:"a"});
    await expect(db.runTransaction(async tx => {
      tx.set(db.doc("sessions/stale-worker"),{status:"in_progress"});
      completeIdempotentRequest(tx,stale.ref,{sessionId:"stale-worker"});
    }, {maxAttempts:1})).rejects.toThrow();
    expect((await db.doc("sessions/stale-worker").get()).exists).toBe(false);
    await db.runTransaction(async tx => { completeIdempotentRequest(tx,recovered.ref,{sessionId:"recovered"}); });
    expect((await beginIdempotentRequest("student","start",id,{topic:"a"})).cached).toEqual({sessionId:"recovered"});
  });
  it("rechecks activity in the expiry transaction after the scheduler selects a candidate", async () => {
    const now = Timestamp.now(), ref = db.doc("sessions/resumed");
    await ref.set({studentId:"student",status:"in_progress",revision:1,lastActivityAt:Timestamp.fromMillis(now.toMillis()-48*3600000)});
    const original = db.runTransaction.bind(db);
    const spy = vi.spyOn(db,"runTransaction").mockImplementationOnce(async (callback: any) => {
      await ref.update({status:"submitted", revision:2, lastActivityAt:now});
      return original(callback);
    });
    await processInactiveSessions(24,now); spy.mockRestore();
    expect((await ref.get()).get("status")).toBe("submitted");
    expect((await ref.get()).get("revision")).toBe(2);
  });
  it("removes academic identifiers and free text while retaining explicitly pseudonymous numerical records", async () => {
    await db.doc("users/student").set({academicProfile:{studentNumber:"SECRET-STUDENT-NUMBER"},displayName:"Alice",email:"alice@example.test",role:"student",status:"deactivated"});
    await db.doc("sessions/one").set({studentId:"student",studentName:"Alice",originalQuestion:"My name is Alice",draft:{reflection:"Alice"},ctScore:50});
    await db.doc("sessions/one/responses/one").set({response:{plainText:"Alice"}});
    await db.doc("notifications/one").set({recipientId:"student",message:"Alice"});
    expect(await purgeParticipantIdentity("student")).toBe(1);
    expect(JSON.stringify((await db.doc("users/student").get()).data())).not.toContain("SECRET");
    expect((await db.doc("sessions/one").get()).get("privacyClassification")).toBe("pseudonymous");
    expect((await db.collection("sessions/one/responses").get()).empty).toBe(true);
    expect((await db.collection("notifications").get()).empty).toBe(true);
  });
  it("resumes privacy cleanup after a permanent nested-write failure across multiple pages", async () => {
    await db.doc("users/student").set({status:"active",role:"student",email:"secret@example.test"});
    const batch = db.batch();
    for (let index = 0; index < 105; index++) {
      batch.set(db.doc(`sessions/privacy-${String(index).padStart(3,"0")}`),{studentId:"student",studentName:"Private Name"});
    }
    batch.set(db.doc("sessions/privacy-000/responses/raw"),{text:"Private Name"});
    for (let index = 0; index < 300; index++) batch.set(db.doc(`notifications/privacy-${index}`),{recipientId:"student",message:"Private Name"});
    batch.set(db.doc("assignment_reservations/student-request"),{uid:"student"});
    await batch.commit();
    const failure = vi.spyOn(db,"recursiveDelete").mockRejectedValueOnce(new Error("permanent nested delete failure"));
    await expect(purgeParticipantIdentity("student")).rejects.toThrow("permanent nested delete failure");
    failure.mockRestore();
    expect((await db.doc("users/student").get()).get("status")).toBe("deactivated");
    expect(await purgeParticipantIdentity("student")).toBe(105);
    expect((await db.collection("sessions").where("studentId","==","student").get()).empty).toBe(true);
    expect((await db.collection("sessions/privacy-000/responses").get()).empty).toBe(true);
    expect((await db.collection("notifications").get()).empty).toBe(true);
    expect((await db.collection("assignment_reservations").get()).empty).toBe(true);
  },60000);
  it("reports the entire filtered population beyond the former limit and preserves page completeness", async () => {
    for(let page=0;page<3;page++) {
      const batch = db.batch();
      for(let i=0;i<400;i++) batch.set(db.doc(`sessions/report-${page*400+i}`),{studentId:"student",subject:"Quantitative Methods",topic:"Mean",createdAt:Timestamp.fromMillis(1000),submittedAt:Timestamp.fromMillis(2000),statsCommittedAt:Timestamp.fromMillis(2000),responseCount:7,phaseResponses:[],scorecard:{total:50},diagnosisSummary:["invalid_logic","invalid_logic"]});
      await batch.commit();
    }
    const first = await queryReportPage({kind:"usage",includeIdentity:false,limit:1000,topic:"Mean",from:0,to:1500});
    expect(first.totalRows).toBe(1200); expect(first.complete).toBe(false); expect(first.rows[0].responses).toBe(7);
    const next = await queryReportPage({kind:"usage",includeIdentity:false,limit:1000,topic:"Mean",from:0,to:1500,cursor:first.nextCursor!});
    expect(next.rows).toHaveLength(200); expect(next.complete).toBe(true);
    const progress = await queryReportPage({kind:"learning_progress",includeIdentity:false,limit:10,topic:"Mean",from:1501,to:2500});
    expect(progress.rows[0].sessionsCompleted).toBe(1200);
    expect(progress.rows[0].averageCTScore).toBeNull();
    expect(progress.rows[0].excludedUncalibratedSessions).toBe(1200);
    await db.doc("sessions/report-0").update({scorecard:{total:80,calibrationStatus:"calibrated"}});
    const calibrated = await queryReportPage({kind:"learning_progress",includeIdentity:false,limit:10,topic:"Mean",from:1501,to:2500});
    expect(calibrated.rows[0].averageCTScore).toBe(80);
    expect(calibrated.rows[0].calibratedSessions).toBe(1);
    expect(calibrated.rows[0].excludedUncalibratedSessions).toBe(1199);
    const diagnoses = await queryReportPage({kind:"misconceptions",includeIdentity:false,limit:10});
    expect(diagnoses.rows[0].affectedSessions).toBe(1200);
  }, 60000);
});
