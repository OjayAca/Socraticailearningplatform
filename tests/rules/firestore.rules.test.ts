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
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "mindguide-test";
const STUDENT = "student-one";
const OTHER_STUDENT = "student-two";
const ADMIN = "system-admin";
const SESSION = "secure-session";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8086").split(":");
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve("firestore.rules"), "utf8"),
      host,
      port: Number(portText),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, "users", STUDENT), profile("student", "Student One")),
      setDoc(doc(database, "users", OTHER_STUDENT), profile("student", "Student Two")),
      setDoc(doc(database, "users", ADMIN), profile("admin", "System Admin")),
      setDoc(doc(database, "users", STUDENT, "consents", "privacy-2026-07-18"), {
        version: "privacy-2026-07-18",
        acknowledgedAt: Timestamp.now(),
      }),
      setDoc(doc(database, "sessions", SESSION), secureSession()),
      setDoc(doc(database, "sessions", SESSION, "private", "reference"), {
        finalAnswer: "private answer",
        solutionSteps: ["private step"],
      }),
      setDoc(doc(database, "sessions", SESSION, "responses", "response-one"), {
        phase: "problem_understanding",
        response: { plainText: "The problem asks for the mean." },
      }),
      setDoc(doc(database, "problems", "approved-problem"), {
        status: "approved",
        problemText: "Public prompt",
      }),
      setDoc(doc(database, "problems", "approved-problem", "private", "solution"), {
        finalAnswer: "42",
      }),
      setDoc(doc(database, "problems", "draft-problem"), {
        status: "draft",
        problemText: "Draft prompt",
      }),
      setDoc(doc(database, "notifications", "notice"), {
        recipientId: STUDENT,
        read: false,
      }),
      setDoc(doc(database, "audit_logs", "audit"), {
        actorId: ADMIN,
        action: "content_upsert",
        createdAt: Timestamp.now(),
      }),
      setDoc(doc(database, "content_validation_records", "validation-one"), {
        problemId: "approved-problem",
        decision: "approved",
        validatorName: "Faculty Validator",
      }),
    ]);
  });
});

afterAll(async () => environment.cleanup());

describe("schema-v4 authority boundary", () => {
  it("denies client profile creation and role escalation but permits bounded preference changes", async () => {
    const database = studentDb();
    await assertFails(setDoc(doc(database, "users", "new-user"), profile("student", "New User")));
    await assertFails(updateDoc(doc(database, "users", STUDENT), { role: "admin", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(database, "users", STUDENT), {
      preferences: { liveAlertPopups: false, theme: "system", reducedMotion: false },
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(database, "users", STUDENT), {
      academicProfile: {
        studentNumber: "forged",
        course: "forged",
        yearLevel: "4",
        section: "A",
      },
      academicProfileComplete: true,
      updatedAt: serverTimestamp(),
    }));
  });

  it("allows an owner to read the public session projection and responses", async () => {
    const database = studentDb();
    await assertSucceeds(getDoc(doc(database, "sessions", SESSION)));
    await assertSucceeds(getDocs(collection(database, "sessions", SESSION, "responses")));
    await assertSucceeds(getDoc(doc(database, "users", STUDENT, "consents", "privacy-2026-07-18")));
  });

  it("denies all student session creates and authoritative updates", async () => {
    const database = studentDb();
    await assertFails(setDoc(doc(database, "sessions", "forged"), secureSession()));
    await assertFails(updateDoc(doc(database, "sessions", SESSION), {
      currentPhase: "critical_thinking_scorecard",
      scorecard: { total: 100 },
      revision: 99,
    }));
  });

  it("denies cross-student public reads and all student private reads", async () => {
    const other = environment.authenticatedContext(OTHER_STUDENT).firestore();
    await assertFails(getDoc(doc(other, "sessions", SESSION)));
    await assertFails(getDoc(doc(studentDb(), "sessions", SESSION, "private", "reference")));
    await assertFails(getDoc(doc(studentDb(), "problems", "approved-problem", "private", "solution")));
  });

  it("uses custom claims for administrator reads", async () => {
    const admin = adminDb();
    await assertSucceeds(getDoc(doc(admin, "sessions", SESSION)));
    await assertSucceeds(getDoc(doc(admin, "sessions", SESSION, "private", "reference")));
    await assertSucceeds(getDoc(doc(admin, "problems", "approved-problem", "private", "solution")));
    await assertSucceeds(getDoc(doc(admin, "audit_logs", "audit")));
    await assertSucceeds(getDoc(doc(admin, "content_validation_records", "validation-one")));
    await assertFails(getDoc(doc(studentDb(), "content_validation_records", "validation-one")));

    const profileOnlyAdmin = environment.authenticatedContext("profile-only-admin").firestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "profile-only-admin"), profile("admin", "Profile Only"));
    });
    await assertFails(getDoc(doc(profileOnlyAdmin, "audit_logs", "audit")));

    const staleClaimAdmin = environment.authenticatedContext("stale-claim-admin", { role: "admin" }).firestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "stale-claim-admin"), profile("student", "Stale Claim"));
    });
    await assertFails(getDoc(doc(staleClaimAdmin, "audit_logs", "audit")));
  });

  it("blocks inactive accounts from protected data while allowing their own profile read", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "users", STUDENT), { status: "suspended" });
    });
    const database = studentDb();
    await assertSucceeds(getDoc(doc(database, "users", STUDENT)));
    await assertFails(getDoc(doc(database, "sessions", SESSION)));
    await assertFails(getDocs(query(collection(database, "problems"), where("status", "==", "approved"))));
  });

  it("exposes only approved public content to students", async () => {
    const database = studentDb();
    await assertSucceeds(getDoc(doc(database, "problems", "approved-problem")));
    await assertFails(getDoc(doc(database, "problems", "draft-problem")));
    await assertSucceeds(getDocs(query(collection(database, "problems"), where("status", "==", "approved"))));
  });

  it("allows recipients to mark notifications read but forbids notification creation", async () => {
    const database = studentDb();
    await assertSucceeds(updateDoc(doc(database, "notifications", "notice"), { read: true }));
    await assertFails(setDoc(doc(database, "notifications", "forged"), { recipientId: STUDENT, read: false }));
  });
});

function studentDb() {
  return environment.authenticatedContext(STUDENT).firestore();
}

function adminDb() {
  return environment.authenticatedContext(ADMIN, { role: "admin" }).firestore();
}

function profile(role: "student" | "admin", displayName: string) {
  return {
    schemaVersion: 4,
    displayName,
    email: `${displayName.toLowerCase().replace(/\s/g, ".")}@example.test`,
    role,
    status: "active",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    preferences: { liveAlertPopups: true, theme: "system", reducedMotion: false },
  };
}

function secureSession() {
  return {
    schemaVersion: 4,
    workflowVersion: 4,
    revision: 0,
    studentId: STUDENT,
    studentName: "Student One",
    subject: "Quantitative Methods",
    topic: "Measures of Central Tendency",
    difficulty: "Basic",
    problemId: "approved-problem",
    originalQuestion: "Find the mean.",
    status: "ready_for_submission",
    currentPhase: "critical_thinking_scorecard",
    gateStates: {},
    gateEvaluations: {},
    allowedSupport: [],
    scorecard: { total: 100, criteria: {} },
    releasedSolution: {
      method: "mean = sum / n",
      justification: "The problem supplies a complete numeric data set.",
      steps: ["Add the values.", "Divide by the count."],
      answer: "10",
      verification: "Substitute the result into the calculation.",
      interpretation: "The average is 10.",
      releasedAt: Date.now(),
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}
