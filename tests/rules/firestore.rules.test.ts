import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  collection,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "mindguide-test";
const STUDENT_ONE = "student-one";
const STUDENT_TWO = "student-two";
const ADMIN = "system-admin";
const SESSION_ID = "session-one";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve("firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, "users", STUDENT_ONE), userProfile("student", "Student One")),
      setDoc(doc(database, "users", STUDENT_TWO), userProfile("student", "Student Two")),
      setDoc(doc(database, "users", ADMIN), userProfile("admin", "System Admin")),
    ]);
  });
});

afterAll(async () => {
  await environment?.cleanup();
});

describe("MINDGUIDE Firestore authorization", () => {
  it("denies role escalation while allowing a profile preference update", async () => {
    const database = environment.authenticatedContext(STUDENT_ONE).firestore();
    await assertFails(updateDoc(doc(database, "users", STUDENT_ONE), { role: "admin" }));
    await assertSucceeds(
      updateDoc(doc(database, "users", STUDENT_ONE), {
        "preferences.liveAlertPopups": false,
      })
    );
  });

  it("denies cross-student session reads and writes", async () => {
    await seedSession(SESSION_ID, STUDENT_TWO, "in_progress");
    const database = environment.authenticatedContext(STUDENT_ONE).firestore();

    await assertFails(getDoc(doc(database, "sessions", SESSION_ID)));
    await assertFails(
      updateDoc(doc(database, "sessions", SESSION_ID), {
        currentStep: "draft",
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allows owner-scoped queries and administrator reads", async () => {
    await seedSession(SESSION_ID, STUDENT_ONE, "submitted");
    const studentDb = environment.authenticatedContext(STUDENT_ONE).firestore();
    const adminDb = environment.authenticatedContext(ADMIN).firestore();

    await assertSucceeds(
      getDocs(
        query(
          collection(studentDb, "sessions"),
          where("studentId", "==", STUDENT_ONE)
        )
      )
    );
    await assertSucceeds(getDoc(doc(adminDb, "sessions", SESSION_ID)));
  });

  it("allows one submission transition with its deterministic admin notification", async () => {
    await seedSession(SESSION_ID, STUDENT_ONE, "in_progress");
    const database = environment.authenticatedContext(STUDENT_ONE).firestore();
    const sessionRef = doc(database, "sessions", SESSION_ID);
    const notificationId = `session_submitted__${SESSION_ID}__${ADMIN}`;

    await assertSucceeds(
      runTransaction(database, async (transaction) => {
        transaction.update(sessionRef, {
          status: "submitted",
          currentStep: "confirmation",
          currentPhase: "scorecard",
          submittedAt: serverTimestamp(),
          statsCommittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(doc(database, "notifications", notificationId), {
          eventType: "session_submitted",
          senderId: STUDENT_ONE,
          recipientId: ADMIN,
          sessionId: SESSION_ID,
          title: "New learner session",
          message: "Student One submitted a session.",
          actionUrl: `/admin/review/${SESSION_ID}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      })
    );

    await assertFails(
      updateDoc(sessionRef, {
        status: "submitted",
        submittedAt: serverTimestamp(),
        statsCommittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("rejects arbitrary notification IDs and recipients", async () => {
    await seedSession(SESSION_ID, STUDENT_ONE, "in_progress");
    const database = environment.authenticatedContext(STUDENT_ONE).firestore();

    await assertFails(
      runTransaction(database, async (transaction) => {
        transaction.update(doc(database, "sessions", SESSION_ID), {
          status: "submitted",
          currentStep: "confirmation",
          currentPhase: "scorecard",
          submittedAt: serverTimestamp(),
          statsCommittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(doc(database, "notifications", "arbitrary-id"), {
          eventType: "session_submitted",
          senderId: STUDENT_ONE,
          recipientId: STUDENT_TWO,
          sessionId: SESSION_ID,
          title: "Invalid",
          message: "Invalid recipient",
          actionUrl: "/student/history",
          read: false,
          createdAt: serverTimestamp(),
        });
      })
    );
  });

  it("records administrator identity once and rejects conflicting review actions", async () => {
    await seedSession(SESSION_ID, STUDENT_ONE, "submitted");
    const database = environment.authenticatedContext(ADMIN).firestore();
    const sessionRef = doc(database, "sessions", SESSION_ID);

    await assertFails(
      updateDoc(sessionRef, {
        status: "reviewed",
        updatedAt: serverTimestamp(),
        reviewedAt: serverTimestamp(),
        reviewedBy: "another-admin",
        adminReview: {
          comment: "Looks good.",
          outcome: "reviewed",
          reviewedBy: "another-admin",
          reviewedAt: serverTimestamp(),
        },
      })
    );

    await assertSucceeds(
      updateDoc(sessionRef, {
        status: "returned",
        updatedAt: serverTimestamp(),
        reviewedAt: serverTimestamp(),
        reviewedBy: ADMIN,
        adminReview: {
          comment: "Explain the final implication.",
          outcome: "returned",
          reviewedBy: ADMIN,
          reviewedAt: serverTimestamp(),
        },
      })
    );

    await assertFails(
      updateDoc(sessionRef, {
        status: "reviewed",
        updatedAt: serverTimestamp(),
        reviewedAt: serverTimestamp(),
        reviewedBy: ADMIN,
        adminReview: {
          comment: "Changed outcome.",
          outcome: "reviewed",
          reviewedBy: ADMIN,
          reviewedAt: serverTimestamp(),
        },
      })
    );
  });
});

async function seedSession(
  id: string,
  studentId: string,
  status: "in_progress" | "submitted"
) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "sessions", id),
      sessionDocument(studentId, status)
    );
  });
}

function userProfile(role: "student" | "admin", displayName: string) {
  return {
    displayName,
    email: `${displayName.toLowerCase().replace(/\s/g, ".")}@example.test`,
    role,
    createdAt: Timestamp.now(),
    preferences: { liveAlertPopups: true },
    stats: {
      sessionsCompleted: 0,
      averageCTScore: 0,
      currentStreak: 0,
      lastSessionDate: null,
      topicPerformance: [],
    },
  };
}

function sessionDocument(
  studentId: string,
  status: "in_progress" | "submitted"
) {
  const submittedAt = status === "submitted" ? Timestamp.now() : null;
  return {
    schemaVersion: 2,
    studentId,
    studentName: studentId === STUDENT_ONE ? "Student One" : "Student Two",
    studentEmail: `${studentId}@example.test`,
    subject: "Discrete Mathematics",
    topic: "Logic and Propositions",
    problemMode: "curated",
    problemContext: {
      mode: "curated",
      problemId: "dm-logic-basic-1",
      promptSnapshot: {
        subject: "Discrete Mathematics",
        topic: "Logic and Propositions",
        difficulty: "Basic",
        problemText: "Determine whether p implies q.",
      },
    },
    difficulty: "Basic",
    selectedProblemId: "dm-logic-basic-1",
    originalQuestion: "Determine whether p implies q.",
    status,
    currentStep: status === "submitted" ? "confirmation" : "questioning",
    currentPhase: status === "submitted" ? "scorecard" : "problem_understanding",
    completedPhases: [],
    ctScore: status === "submitted" ? 75 : 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    submittedAt,
    reviewedAt: null,
    reviewedBy: null,
    adminReview: null,
    statsCommittedAt: submittedAt,
    messages: [],
    phaseResponses: [],
    correctivePrompts: [],
    logicMap: [],
    draft: status === "submitted"
      ? { answer: "p implies q", methodology: "truth conditions", reflection: "The implication is false only when p is true and q is false." }
      : null,
    aiSummary: null,
    hints: [],
    hintsUsed: 0,
    diagnosisResult: null,
    detectedMisconception: null,
    unlockLevel: 0,
    mindGuideScorecard: null,
    scorecard: null,
    aiFallbackEvents: [],
    parentSessionId: null,
    followUpSessionId: null,
  };
}
