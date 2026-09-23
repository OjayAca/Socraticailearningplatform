import { beforeEach, describe, expect, it, vi } from "vitest";
const memory = vi.hoisted(() => ({ records: new Map<string, any>(), uid: "alice", failCommit: false, queue: Promise.resolve(), serial: 0, commits: 0, failAt: 0, denied: "" }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { get currentUser() { return { uid: memory.uid, email: `${memory.uid}@test.invalid`, getIdTokenResult: async () => ({ claims: { role: "admin" } }) }; } }, firebaseSetupMessage: "Firebase is not configured." }));
vi.mock("firebase/firestore", async importOriginal => {
  const original = await importOriginal<typeof import("firebase/firestore")>();
  const snapshot = (path: string) => ({ ref: { path }, id: path.split("/").at(-1)!, exists: () => memory.records.has(path), data: () => memory.records.get(path), get: (field: string) => field.split(".").reduce((value, key) => value?.[key], memory.records.get(path)) });
  return {
    ...original,
    doc: (base: any, ...parts: string[]) => { const path = base.path ? base.path + "/" + (parts.join("/") || `auto-${++memory.serial}`) : parts.join("/"); return { path, id: path.split("/").at(-1) }; },
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/"), id: parts.at(-1) }),
    where: (field: string, _operator: string, value: unknown) => ({ field, value }),
    query: (ref: any, ...filters: any[]) => ({ ...ref, filters }),
    getDoc: async (ref: any) => snapshot(ref.path),
    getDocs: async (ref: any) => {
      if (ref.path === memory.denied) throw new Error("Read denied");
      const docs = [...memory.records.keys()].filter(path => path.startsWith(ref.path + "/") && path.split("/").length === ref.path.split("/").length + 1)
        .map(snapshot).filter(item => (ref.filters ?? []).every((filter: any) => item.get(filter.field) === filter.value));
      return { docs, size: docs.length };
    },
    setDoc: async (ref: any, value: any) => { if (memory.failCommit) throw new Error("Write failed"); memory.records.set(ref.path, value); },
    serverTimestamp: () => original.Timestamp.now(),
    runTransaction: (_db: unknown, operation: any) => {
      const result = memory.queue.then(async () => {
        const writes: Array<() => void> = [];
        const tx = {
          get: async (ref: any) => { if (writes.length) throw new Error("Transaction read after write"); return snapshot(ref.path); },
          delete: (ref: any) => writes.push(() => memory.records.delete(ref.path)),
          set: (ref: any, value: any, options?: any) => writes.push(() => memory.records.set(ref.path, options?.merge ? { ...memory.records.get(ref.path), ...value } : value)),
          update: (ref: any, value: any) => writes.push(() => memory.records.set(ref.path, { ...memory.records.get(ref.path), ...value })),
        };
        const value = await operation(tx);
        memory.commits++;
        if (memory.commits === memory.failAt) throw new Error("Batch connection interrupted");
        if (memory.failCommit) { memory.failCommit = false; throw new Error("Connection interrupted before commit"); }
        writes.forEach(write => write());
        return value;
      });
      memory.queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
});
import { adminOperation } from "@/lib/admin-service";
const requestId = "11111111-1111-4111-8111-111111111111";
const reason = "Verified administrator operation";
const invoke = (name: string, value: object) => adminOperation(name, { requestId, ...value });
const audits = () => [...memory.records.entries()].filter(([path]) => path.startsWith("audit_logs/"));
beforeEach(() => {
  memory.records.clear(); memory.uid = "admin"; memory.failCommit = false; memory.queue = Promise.resolve(); memory.serial = 0; memory.commits = 0; memory.failAt = 0; memory.denied = "";
  memory.records.set("users/admin", { role: "admin", status: "active" });
  memory.records.set("users/student", { role: "student", status: "active" });
});
describe("actual administrator service with in-memory Firestore", () => {
  it.each([
    ["subjects", { name: "Quantitative Methods", description: "Approved scope description", status: "draft" }],
    ["topics", { subjectId: "subject", subject: "Quantitative Methods", name: "Mean", status: "draft" }],
    ["formula_theorem_references", { kind: "formula", statement: "sum / count", domain: "Quantitative Methods", status: "draft" }],
    ["socratic_prompt_bank", { problemId: "question", phase: "problem_understanding", prompt: "What is requested?", status: "draft" }],
    ["misconception_categories", { name: "Calculation", correctivePrompt: "Check the calculation.", status: "draft" }],
    ["difficulty_policies", { minimumCompletedSessions: 2, increaseScoreThreshold: 80, decreaseScoreThreshold: 50, maxHintsForIncrease: 1, arithmeticErrorAloneLowersDifficulty: false, status: "draft" }],
    ["problems", { subjectId: "subject", topicId: "topic", subject: "Quantitative Methods", topic: "Mean", difficulty: "Basic", variant: 1, problemText: "Find the mean of the given values.", supportedResponseFormats: ["text"], formulaTheoremReferenceIds: ["formula"], status: "draft", privateSolution: { expectedConcepts: ["mean"], workedSteps: ["Sum then divide."], finalAnswer: "8", interpretation: "The mean is 8.", answerSpecification: { kind: "number", value: 8 } } }],
  ])("creates and updates %s with versioning and audit, then archives", async (collection, value) => {
    memory.records.set("subjects/subject", { name: "Quantitative Methods", status: "approved" });
    memory.records.set("topics/topic", { name: "Mean", subjectId: "subject", status: "approved" });
    memory.records.set("formula_theorem_references/formula", { status: "approved" });
    memory.records.set("problems/question", { status: "draft" });
    await invoke("adminUpsertContent", { collection, id: "created", value });
    expect(memory.records.get(`${collection}/created`).version).toBe(1);
    await invoke("adminUpsertContent", { collection, id: "created", value });
    expect(memory.records.get(`${collection}/created`).version).toBe(2);
    await invoke("adminArchiveContent", { collection, id: "created" });
    expect(memory.records.get(`${collection}/created`).status).toBe("archived");
    expect(audits()).toHaveLength(3);
  });
  it("requires an active administrator before any operation", async () => {
    memory.records.get("users/admin").role = "student";
    await expect(invoke("adminManageUser", { userId: "student", action: "suspend", reason })).rejects.toThrow("Administrator access");
    expect(audits()).toHaveLength(0);
  });
  it("commits account status and audit together, and rolls both back on failure", async () => {
    memory.failCommit = true;
    await expect(invoke("adminManageUser", { userId: "student", action: "suspend", reason })).rejects.toThrow("Connection");
    expect(memory.records.get("users/student").status).toBe("active"); expect(audits()).toHaveLength(0);
    await invoke("adminManageUser", { userId: "student", action: "suspend", reason });
    expect(memory.records.get("users/student").status).toBe("suspended"); expect(audits()).toHaveLength(1);
  });
  it("rejects arbitrary collections and invalid content transitions", async () => {
    await expect(invoke("adminDeleteContent", { collection: "users", id: "student", reason })).rejects.toThrow();
    memory.records.set("problems/question", { status: "approved" });
    await expect(invoke("adminSubmitProblemValidation", { problemId: "question" })).rejects.toThrow("Only draft");
    await expect(invoke("adminDeleteContent", { collection: "problems", id: "question", reason })).rejects.toThrow("Only unused");
  });
  it("deletes only unused draft records and their private/scoring material atomically", async () => {
    memory.records.set("problems/question", { status: "draft" });
    memory.records.set("problems/question/private/solution", { finalAnswer: "8" });
    memory.records.set("problem_scoring/question", { finalAnswer: "8" });
    memory.failCommit = true;
    await expect(invoke("adminDeleteContent", { collection: "problems", id: "question", reason })).rejects.toThrow();
    expect(memory.records.has("problems/question/private/solution")).toBe(true);
    await invoke("adminDeleteContent", { collection: "problems", id: "question", reason });
    expect(memory.records.has("problems/question")).toBe(false); expect(memory.records.has("problems/question/private/solution")).toBe(false); expect(memory.records.has("problem_scoring/question")).toBe(false); expect(audits()).toHaveLength(1);
  });
  it.each(["topics/child", "sessions/history", "problems/other/private/solution"])("blocks a dependency in %s", async path => {
    memory.records.set("subjects/math", { status: "draft" });
    memory.records.set("problems/other", { status: "draft" });
    memory.records.set(path, { subjectId: "math" });
    await expect(invoke("adminDeleteContent", { collection: "subjects", id: "math", reason })).rejects.toThrow("referenced");
    expect(memory.records.has("subjects/math")).toBe(true);
  });
  it("fails closed when dependency reads fail", async () => {
    memory.records.set("subjects/math", { status: "draft" }); memory.denied = "sessions";
    await expect(invoke("adminDeleteContent", { collection: "subjects", id: "math", reason })).rejects.toThrow("Read denied");
    expect(memory.records.has("subjects/math")).toBe(true);
  });
  it("validates an active consent policy before changing privacy settings", async () => {
    await expect(invoke("adminUpsertContent", { collection: "system_settings", id: "privacy", value: { currentConsentVersion: "notice" } })).rejects.toThrow("active consent");
    memory.records.set("policy_documents/notice", { status: "active" });
    await invoke("adminUpsertContent", { collection: "system_settings", id: "privacy", value: { currentConsentVersion: "notice", sessionInactivityHours: 48 } });
    expect(memory.records.get("system_settings/privacy").sessionInactivityHours).toBe(48); expect(audits()).toHaveLength(1);
  });
  it("returns partial delivery and resumes without overwriting read notifications", async () => {
    for (let i = 0; i < 401; i++) memory.records.set(`users/student-${i}`, { role: "student", status: "active" });
    memory.failAt = 3;
    const input = { title: "Notice", message: "Meaningful update", reason };
    const partial = await invoke("adminPublishAnnouncement", input);
    expect(partial).toMatchObject({ complete: false, delivered: 400, total: 402 });
    const notification = [...memory.records.keys()].find(path => path.startsWith("notifications/"))!;
    memory.records.get(notification).read = true;
    memory.failAt = 0;
    expect(await invoke("adminPublishAnnouncement", input)).toMatchObject({ complete: true, delivered: 402 });
    expect(memory.records.get(notification).read).toBe(true);
    await invoke("adminPublishAnnouncement", input);
    expect([...memory.records.keys()].filter(path => path.startsWith("notifications/"))).toHaveLength(402);
    expect(audits()).toHaveLength(3);
  });
  it("reviews submitted work once per request without rescoring or resetting notification read state", async () => {
    memory.records.set("sessions/work", { studentId: "student", statsCommittedAt: 200, revision: 1, scorecard: { total: 72 } });
    const input = { sessionId: "work", outcome: "reviewed", comment: "Reasoning reviewed." };
    await invoke("adminReviewSession", input);
    memory.records.get(`notifications/review_${requestId}`).read = true;
    await invoke("adminReviewSession", input);
    expect(memory.records.get("sessions/work").revision).toBe(2);
    expect(memory.records.get("sessions/work").scorecard.total).toBe(72);
    expect(memory.records.get(`notifications/review_${requestId}`).read).toBe(true);
    expect(audits()).toHaveLength(1);
  });
  it("records validation and publishes scoring atomically from explicit evidence", async () => {
    memory.records.set("subjects/math", { status: "approved" });
    memory.records.set("topics/mean", { status: "approved", subjectId: "math" });
    memory.records.set("formula_theorem_references/formula", { status: "approved" });
    memory.records.set("problems/question", { status: "pending_validation", version: 1, subjectId: "math", topicId: "mean", formulaTheoremReferenceIds: ["formula"] });
    memory.records.set("problems/question/private/solution", { answerSpecification: { kind: "number", value: 8 }, expectedConcepts: ["mean"], solutionSteps: ["Sum and divide"], finalAnswer: "8", interpretation: "Mean is 8" });
    const input = { problemId: "question", syllabusReference: "unit-test-only", contentMatrixItem: "unit-test-only", validatorName: "Test validator", validatorRole: "Test", validationDate: 1, evidenceReference: "in-memory-only", evidenceHash: "0123456789abcdef", decision: "approved" };
    memory.failCommit = true;
    await expect(invoke("adminRecordProblemValidation", input)).rejects.toThrow();
    expect(memory.records.has("problem_scoring/question")).toBe(false);
    await invoke("adminRecordProblemValidation", input);
    expect(memory.records.get("problem_scoring/question").problemVersion).toBe(1);
    await invoke("adminRecordProblemValidation", input);
    expect(audits()).toHaveLength(1);
  });
  it("reports all matching rows, preserves score provenance, and exports beyond a page", async () => {
    for (let i = 0; i < 260; i++) memory.records.set(`sessions/${i}`, { studentId: "student", studentName: "Private Name", createdAt: 100, submittedAt: 200, statsCommittedAt: 200, scoringSource: "client_practice", scorecard: { total: 75, rubricVersion: "spark-practice-v1" } });
    const page = await invoke("adminQueryReport", { kind: "scorecards", limit: 250, from: 200, to: 200 });
    expect(page.rows).toHaveLength(250); expect(page.totalRows).toBe(260); expect(page.rows[0].scoreSource).toBe("client_practice"); expect(JSON.stringify(page)).not.toContain("Private Name");
    const next = await invoke("adminQueryReport", { kind: "scorecards", cursor: page.nextCursor }); expect(next.rows).toHaveLength(10);
    const exported = await invoke("adminExportReport", { kind: "scorecards", output: "csv", exportReason: reason, limit: 1 });
    expect(exported.rows).toHaveLength(260); expect(exported.csv.split("\r\n")).toHaveLength(261);
    await expect(invoke("adminQueryReport", { kind: "usage", from: 300, to: 200 })).rejects.toThrow("start date");
  });
  it.each(["learning_progress", "scorecards", "misconceptions", "activity", "usage"])("supports %s empty reports", async kind => {
    expect((await invoke("adminQueryReport", { kind })).rows).toEqual([]);
  });
});
