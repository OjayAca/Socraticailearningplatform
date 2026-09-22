import { readFile } from "node:fs/promises";
import { applicationDefault } from "firebase-admin/app";
import { loadOperatorCredentials } from "./lib/operator-auth.ts";

// Firebase Rules simulator only: no Firestore documents are created or changed.
await loadOperatorCredentials();
const env = await readFile(".env", "utf8");
const project = env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!project || project.startsWith("demo-")) throw new Error("Use the existing configured project.");
const root = "/databases/(default)/documents/";
const profile = { status: "active", role: "student" };
const getMock = (path: string, data: unknown, name = "get") => ({ function: name, args: [{ exactValue: root + path }], result: { value: { data } } });
const cases: Array<{ name: string; test: any }> = [];
function scenario(name: string, expectation: "ALLOW" | "DENY", path: string, method: string, data: any, options: any = {}) {
  cases.push({ name, test: {
    expectation, request: { auth: { uid: "rules-alice", token: { role: "student", email: "rules-alice@test.invalid" } }, path: root + path, method, ...options.request },
    resource: { data }, functionMocks: [{ function: "exists", args: [{ anyValue: {} }], result: { value: true } }, getMock("users/rules-alice", profile), ...(options.mocks ?? [])], expressionReportLevel: "VISITED",
  } });
}
scenario("approved topics", "ALLOW", "topics/topic", "get", { status: "approved" });
scenario("draft topics", "DENY", "topics/topic", "get", { status: "draft" });
scenario("approved questions", "ALLOW", "problems/question", "get", { status: "approved" });
scenario("draft questions", "DENY", "problems/question", "get", { status: "draft" });
scenario("learner cannot edit questions", "DENY", "problems/question", "update", { status: "approved" }, { request: { resource: { data: { status: "draft" } } } });
scenario("own progress", "ALLOW", "learning_progress/rules-alice", "get", {});
scenario("other progress", "DENY", "learning_progress/rules-bob", "get", {});
scenario("own session", "ALLOW", "sessions/session", "get", { studentId: "rules-alice" });
scenario("other session", "DENY", "sessions/session", "get", { studentId: "rules-bob" });
scenario("private solution stays private", "DENY", "problems/question/private/solution", "get", {});
scenario("own response history", "ALLOW", "sessions/session/responses/answer", "get", {}, { mocks: [getMock("sessions/session", { studentId: "rules-alice" })] });
scenario("other response history", "DENY", "sessions/session/responses/answer", "get", {}, { mocks: [getMock("sessions/session", { studentId: "rules-bob" })] });
scenario("responses are append-only", "DENY", "sessions/session/responses/answer", "update", {}, { mocks: [getMock("sessions/session", { studentId: "rules-alice" })] });
scenario("self promotion", "DENY", "users/rules-alice", "update", profile, { request: { resource: { data: { ...profile, role: "admin" } } } });
scenario("admin profile bootstrap forbidden", "DENY", "users/rules-alice", "create", {}, { request: { resource: { data: { ...profile, role: "admin" } } } });
scenario("unauthenticated topics", "DENY", "topics/topic", "get", { status: "approved" }, { request: { auth: null } });
const time = "2026-09-20T00:00:00Z";
const newProfile = { schemaVersion: 5, displayName: "Rules Alice", email: "rules-alice@test.invalid", role: "student", status: "active", preferences: {}, academicProfile: null, academicProfileComplete: false, createdAt: time, updatedAt: time };
scenario("student profile creation", "ALLOW", "users/rules-alice", "create", {}, { request: { time, resource: { data: newProfile } } });
const session = { schemaVersion: 5, workflowVersion: 5, studentId: "rules-alice", subjectId: "math", topicId: "topic", subject: "Math", topic: "Topic", difficulty: "Basic", problemMode: "curated", problemId: "question", originalQuestion: "What is the answer?", scoringSource: "client_practice", revision: 0, status: "in_progress", responseCount: 0, statsCommittedAt: null, scorecard: null, firstAnswerCorrect: null, currentPhase: "problem_understanding", gateStates: {}, gateEvaluations: {}, createdAt: time, updatedAt: time, lastActivityAt: time };
const topicMock = getMock("topics/topic", { status: "approved", subjectId: "math" });
const questionMock = getMock("problems/question", { status: "approved", validationRecordId: "record", topicId: "topic", difficulty: "Basic" });
scenario("create own learning session", "DENY", "sessions/new", "create", {}, { request: { time, resource: { data: session } }, mocks: [topicMock, questionMock] });
scenario("cannot create another learner session", "DENY", "sessions/new", "create", {}, { request: { time, resource: { data: { ...session, studentId: "rules-bob" } } }, mocks: [topicMock, questionMock] });
const afterSession = { ...session, revision: 1, responseCount: 1 };
const response = { phase: "problem_understanding", response: { plainText: "Determine the requested quantity." }, evaluation: { phase: "problem_understanding", status: "accepted" }, diagnosis: {}, studentId: "rules-alice", createdAt: time };
scenario("append own response with matching session update", "DENY", "sessions/session/responses/answer", "create", {}, { request: { time, resource: { data: response } }, mocks: [getMock("sessions/session", session), getMock("sessions/session", afterSession, "getAfter")] });
scenario("cannot append another learner response", "DENY", "sessions/session/responses/answer", "create", {}, { request: { time, resource: { data: response } }, mocks: [getMock("sessions/session", { ...session, studentId: "rules-bob" }), getMock("sessions/session", afterSession, "getAfter")] });
scenario("update own session", "DENY", "sessions/session", "update", session, { request: { time, resource: { data: afterSession } }, mocks: [getMock("sessions/session", session)] });
scenario("cannot change session owner", "DENY", "sessions/session", "update", session, { request: { time, resource: { data: { ...afterSession, studentId: "rules-bob" } } }, mocks: [getMock("sessions/session", session)] });
const progress = { userId: "rules-alice", sessionsCompleted: 1, averageCTScore: 75, updatedAt: time };
scenario("save own progress", "DENY", "learning_progress/rules-alice", "create", {}, { request: { time, resource: { data: progress } } });
scenario("cannot save other progress", "DENY", "learning_progress/rules-bob", "create", {}, { request: { time, resource: { data: { ...progress, userId: "rules-bob" } } } });
scenario("write assignment state", "DENY", "learning_progress/rules-alice/assignment_state/topic", "create", {}, { request: { time, resource: { data: { activeSessionId: "session", answeredProblemIds: [], updatedAt: time } } }, mocks: [getMock("sessions/session", session, "getAfter")] });
scenario("record own consent", "ALLOW", "users/rules-alice/consents/notice", "create", {}, { request: { time, resource: { data: { version: "notice", acknowledgedAt: time, source: "web" } } }, mocks: [getMock("users/rules-alice", profile, "getAfter"), getMock("policy_documents/notice", { status: "active" }), getMock("system_settings/privacy", { currentConsentVersion: "notice" })] });
const adminOptions = { request: { auth: { uid: "rules-admin", token: { role: "admin" } } }, mocks: [getMock("users/rules-admin", { role: "admin", status: "active" })] };
scenario("admin lists users", "ALLOW", "users/student", "list", { role: "student" }, adminOptions);
scenario("admin reads private solutions", "ALLOW", "problems/question/private/solution", "get", {}, adminOptions);
scenario("admin creates audit records", "ALLOW", "audit_logs/event", "create", {}, { ...adminOptions, request: { ...adminOptions.request, resource: { data: { actorId: "rules-admin", action: "test" } } } });
scenario("admin cannot rewrite audit records", "DENY", "audit_logs/event", "update", {}, { ...adminOptions, request: { ...adminOptions.request, resource: { data: { action: "changed" } } } });
scenario("admin cannot delete faculty evidence", "DENY", "content_validation_records/evidence", "delete", {}, adminOptions);
scenario("student cannot read audit records", "DENY", "audit_logs/event", "get", {});
scenario("student cannot change privacy settings", "DENY", "system_settings/privacy", "update", {}, { request: { resource: { data: { currentConsentVersion: "other" } } } });
scenario("claim alone cannot grant admin access", "DENY", "audit_logs/event", "get", {}, { request: { auth: { uid: "rules-alice", token: { role: "admin" } } } });

scenario("cannot read published answer references", "DENY", "problem_scoring/question", "get", {});
scenario("cannot read pinned legacy answer references", "DENY", "sessions/session/practice_reference/reference", "get", {}, { mocks: [getMock("sessions/session", session)] });
scenario("cannot read private AI references", "DENY", "sessions/session/private/reference", "get", {}, { mocks: [getMock("sessions/session", session)] });
scenario("cannot write tutor messages", "DENY", "sessions/session/messages/message", "create", {}, {request:{resource:{data:{text:"spoof"}}},mocks:[getMock("sessions/session",session)]});
scenario("cannot fabricate scorecard", "DENY", "sessions/session/scorecards/score", "create", {}, {request:{resource:{data:{total:100}}},mocks:[getMock("sessions/session",session)]});
scenario("cannot update quota", "DENY", "ai_usage/shared", "update", {}, {request:{resource:{data:{daily:0}}}});
scenario("own tutor history", "ALLOW", "sessions/session/messages/message", "get", {}, {mocks:[getMock("sessions/session",session)]});
scenario("other tutor history", "DENY", "sessions/session/messages/message", "get", {}, {mocks:[getMock("sessions/session",{...session,studentId:"rules-bob"})]});
const aiDraftSession={...session,workflowVersion:6,currentPhase:"controlled_solution_release"};
scenario("save final draft only", "ALLOW", "sessions/session", "update", aiDraftSession, {request:{time,resource:{data:{...aiDraftSession,revision:1,draft:{answer:{plainText:"8"},methodology:"Explanation",reflection:"Interpretation"}}}},mocks:[getMock("sessions/session",aiDraftSession)]});
scenario("cannot smuggle gate change with draft", "DENY", "sessions/session", "update", aiDraftSession, {request:{time,resource:{data:{...aiDraftSession,revision:1,gateStates:{accepted:true},draft:{answer:{plainText:"8"},methodology:"Explanation",reflection:"Interpretation"}}}},mocks:[getMock("sessions/session",aiDraftSession)]});

const token = await applicationDefault().getAccessToken();
const result = await fetch(`https://firebaserules.googleapis.com/v1/projects/${project}:test`, {
  method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: await readFile("firestore.rules", "utf8") }] }, testSuite: { testCases: cases.map(item => item.test) } }),
});
const report = await result.json();
if (!result.ok) throw new Error(`Rules simulator returned ${result.status}: ${JSON.stringify(report.error?.message)}`);
if (report.issues?.length) console.log(JSON.stringify(report.issues, null, 2));
const failures: string[] = [];
for (const [index, test] of (report.testResults ?? []).entries()) {
  console.log(`${test.state}: ${cases[index]?.name}`);
  if (test.state !== "SUCCESS") { failures.push(cases[index]?.name); console.log(JSON.stringify(test.debugMessages ?? test, null, 2)); }
}
if (report.issues?.some((issue: any) => issue.severity === "ERROR") || failures.length || report.testResults?.length !== cases.length) throw new Error("Rules simulator checks failed.");
console.log(`Rules compiled; ${cases.length} access checks passed without database writes.`);
