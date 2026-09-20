import { beforeEach, describe, expect, it, vi } from "vitest";
import { adaptiveDifficulty, selectUnanswered } from "@/lib/learning/adaptive";
import { scoringReference } from "@/lib/learning/scoring-reference";
import { REASONING_PHASES } from "@mindguide/contracts";

const memory = vi.hoisted(() => ({ records: new Map<string, any>(), uid: "alice", failCommit: false, queue: Promise.resolve() }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { get currentUser() { return { uid: memory.uid, email: `${memory.uid}@test.invalid` }; } }, firebaseSetupMessage: "Firebase is not configured." }));
vi.mock("firebase/firestore", async importOriginal => {
  const original = await importOriginal<typeof import("firebase/firestore")>();
  const snapshot = (path: string) => ({ id: path.split("/").at(-1)!, exists: () => memory.records.has(path), data: () => memory.records.get(path), get: (field: string) => field.split(".").reduce((value, key) => value?.[key], memory.records.get(path)) });
  return {
    ...original,
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/"), id: parts.at(-1) }),
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/"), id: parts.at(-1) }),
    where: (field: string, _operator: string, value: unknown) => ({ field, value }),
    query: (ref: any, ...filters: any[]) => ({ ...ref, filters }),
    getDoc: async (ref: any) => snapshot(ref.path),
    getDocs: async (ref: any) => {
      const docs = [...memory.records.keys()].filter(path => path.startsWith(ref.path + "/") && path.split("/").length === ref.path.split("/").length + 1)
        .map(snapshot).filter(item => (ref.filters ?? []).every((filter: any) => item.get(filter.field) === filter.value));
      return { docs, size: docs.length };
    },
    serverTimestamp: () => original.Timestamp.now(),
    runTransaction: (_db: unknown, operation: any) => {
      const result = memory.queue.then(async () => {
        const writes: Array<() => void> = [];
        const tx = {
          get: async (ref: any) => { if (writes.length) throw new Error("Transaction read after write"); return snapshot(ref.path); },
          set: (ref: any, value: any, options?: any) => writes.push(() => memory.records.set(ref.path, options?.merge ? { ...memory.records.get(ref.path), ...value } : value)),
          update: (ref: any, value: any) => writes.push(() => memory.records.set(ref.path, { ...memory.records.get(ref.path), ...value })),
        };
        const value = await operation(tx);
        if (memory.failCommit) { memory.failCommit = false; throw new Error("Connection interrupted before commit"); }
        writes.forEach(write => write());
        return value;
      });
      memory.queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
});
import { learningOperation } from "@/lib/learning-service";

const reference = { answerSpecification: { kind: "number", value: 8 }, expectedConcepts: ["mean"], requiredFormula: "mean", solutionSteps: ["Add and divide."], finalAnswer: "8", interpretation: "The mean is 8." };
function seed() {
  memory.records.set("users/alice", { role: "student", status: "active", displayName: "Alice" });
  memory.records.set("system_settings/privacy", { currentConsentVersion: "notice" });
  memory.records.set("policy_documents/notice", { status: "active" });
  memory.records.set("users/alice/consents/notice", { version: "notice" });
  memory.records.set("subjects/math", { name: "Quantitative Methods", status: "approved" });
  memory.records.set("topics/mean", { name: "Measures of Central Tendency", subject: "Quantitative Methods", subjectId: "math", status: "approved" });
  memory.records.set("problems/first", { topicId: "mean", difficulty: "Basic", status: "approved", version: 1, validationRecordId: "approval", problemText: "Find the mean of 4, 8, and 12." });
  memory.records.set("problem_scoring/first", { ...reference, problemVersion: 1, validationRecordId: "approval" });
}
beforeEach(() => { memory.records.clear(); memory.uid = "alice"; memory.failCommit = false; memory.queue = Promise.resolve(); seed(); });

describe("Spark assignment and persistence", () => {
  it("reads approved topics without requiring three variants or pilot admission", async () => {
    memory.records.set("topics/draft", { status: "draft" });
    const catalog = await learningOperation("getLearningCatalog", {});
    expect(catalog.topics.map((item: any) => item.id)).toEqual(["mean"]);
    expect((await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" })).session.problemId).toBe("first");
  });
  it("resumes one assignment when two tabs start concurrently", async () => {
    const results = await Promise.all(["one", "two"].map(requestId => learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId })));
    expect(results[0].session.id).toBe(results[1].session.id);
    expect([...memory.records.keys()].filter(path => /^sessions\/[^/]+$/.test(path))).toHaveLength(1);
  });
  it("excludes historical answers even when responseCount is missing", async () => {
    memory.records.set("sessions/old", { studentId: "alice", topicId: "mean", problemId: "first", status: "abandoned" });
    memory.records.set("sessions/old/responses/answer", { phase: "problem_understanding" });
    await expect(learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" })).rejects.toThrow("No available questions");
  });
  it("distinguishes missing scoring material from an exhausted pool", async () => {
    memory.records.delete("problem_scoring/first");
    await expect(learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" })).rejects.toThrow("Validated scoring material is unavailable");
  });
  it("persists a single attempt when the same request is retried", async () => {
    const { session } = await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" });
    const input = { sessionId: session.id, requestId: "answer", revision: 0, expectedPhase: "problem_understanding", response: { plainText: "I need to determine the mean of the given values." } };
    await learningOperation("evaluatePhaseResponse", input);
    await learningOperation("evaluatePhaseResponse", input);
    expect(memory.records.get(`sessions/${session.id}`).responseCount).toBe(1);
    expect(memory.records.get(`learning_progress/alice/assignment_state/mean`).answeredProblemIds).toEqual(["first"]);
  });
  it("retries an interrupted write without leaving partial responses", async () => {
    const { session } = await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" });
    const input = { sessionId: session.id, requestId: "answer", revision: 0, expectedPhase: "problem_understanding", response: { plainText: "I need to determine the mean of these given values." } };
    memory.failCommit = true;
    await expect(learningOperation("evaluatePhaseResponse", input)).rejects.toThrow("Connection interrupted");
    expect(memory.records.has(`sessions/${session.id}/responses/answer`)).toBe(false);
    await learningOperation("evaluatePhaseResponse", input);
    expect(memory.records.get(`sessions/${session.id}`).responseCount).toBe(1);
  });
  it("releases an unanswered abandoned assignment but never an answered question", async () => {
    let { session } = await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" });
    await learningOperation("abandonLearningSession", { sessionId: session.id, requestId: "abandon" });
    ({ session } = await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "again" }));
    expect(session.problemId).toBe("first");
    await learningOperation("evaluatePhaseResponse", { sessionId: session.id, requestId: "answer", revision: 0, expectedPhase: "problem_understanding", response: { plainText: "I need to determine the mean of these given values." } });
    await learningOperation("abandonLearningSession", { sessionId: session.id, requestId: "abandon-after-answer" });
    await expect(learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "third" })).rejects.toThrow("No available questions");
  });
  it("keeps an incorrect first answer as adaptive evidence after a successful retry", async () => {
    let { session } = await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" });
    const record = memory.records.get(`sessions/${session.id}`);
    memory.records.set(`sessions/${session.id}`, { ...record, currentPhase: "guided_computation_or_proof" });
    ({ session } = await learningOperation("evaluatePhaseResponse", { sessionId: session.id, requestId: "wrong", revision: 0, expectedPhase: "guided_computation_or_proof", response: { plainText: "9" } }));
    expect(session.currentPhase).toBe("guided_computation_or_proof");
    ({ session } = await learningOperation("evaluatePhaseResponse", { sessionId: session.id, requestId: "correct", revision: session.revision, expectedPhase: "guided_computation_or_proof", response: { plainText: "8" } }));
    expect(session.currentPhase).toBe("verification_and_checking");
    expect(memory.records.get(`sessions/${session.id}`).firstAnswerCorrect).toBe(false);
  });
  it("does not let another signed-in account mutate the previous account's session", async () => {
    const { session } = await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" });
    memory.uid = "bob";
    await expect(learningOperation("abandonLearningSession", { sessionId: session.id, requestId: "abandon" })).rejects.toThrow("unavailable");
  });
  it("finishes the guided workflow and commits progress exactly once", async () => {
    let { session } = await learningOperation("startLearningSession", { mode: "curated", topicId: "mean", requestId: "start" });
    const answers = ["I need to determine the mean of the given values.", "The given values are 4, 8, and 12; the mean is unknown.", "The mean formula applies to this dataset.", "The mean formula applies because the given numeric data satisfy its conditions.", "8", "I verify by recalculating the sum and dividing by three.", "The mean represents the average value of this given dataset in context."];
    for (let index = 0; index < REASONING_PHASES.length; index++) {
      const result = await learningOperation("evaluatePhaseResponse", { sessionId: session.id, requestId: `answer-${index}`, revision: session.revision, expectedPhase: REASONING_PHASES[index], response: { plainText: answers[index] } });
      expect(result.evaluation.status).toBe("accepted");
      session = result.session;
    }
    ({ session } = await learningOperation("saveSessionDraft", { sessionId: session.id, requestId: "draft", revision: session.revision, draft: { answer: { plainText: "8" }, methodology: "I calculate the mean by adding the three values then dividing by three.", reflection: "The mean describes the average of these values and matches the independent verification." } }));
    ({ session } = await learningOperation("finalizeScorecard", { sessionId: session.id, requestId: "score", revision: session.revision }));
    expect(session.scorecard.total).toBe(100);
    expect(session.scorecard.rubricVersion).toBe("spark-practice-v1");
    const submit = { sessionId: session.id, requestId: "submit", revision: session.revision };
    await learningOperation("submitLearningSession", submit);
    await learningOperation("submitLearningSession", submit);
    const progress = memory.records.get("learning_progress/alice");
    expect(progress.sessionsCompleted).toBe(1);
    expect(progress.accuracyEvidence.mean[0].correct).toBe(true);
    expect(progress.topicRecommendations.measures_of_central_tendency.recommendedDifficulty).toBe("Intermediate");
    expect(progress.achievements.first_step).toBeDefined();
  });
});

describe("adaptive difficulty", () => {
  const evidence = (answers: boolean[]) => answers.map((correct, index) => ({ sessionId: String(index), correct, completedAt: index }));
  it.each([[4, "Advanced"], [3, "Intermediate"], [2, "Basic"]] as const)("uses the latest five questions at %i correct", (correct, expected) => {
    expect(adaptiveDifficulty("Intermediate", evidence(Array.from({ length: 5 }, (_, index) => index < correct))).recommendedDifficulty).toBe(expected);
  });
  it("maintains difficulty at exactly 50 percent", () => expect(adaptiveDifficulty("Intermediate", evidence([true, false])).recommendedDifficulty).toBe("Intermediate"));
  it("starts at Basic and clamps both boundaries", () => {
    expect(adaptiveDifficulty("Advanced", []).recommendedDifficulty).toBe("Basic");
    expect(adaptiveDifficulty("Advanced", evidence([true])).recommendedDifficulty).toBe("Advanced");
    expect(adaptiveDifficulty("Basic", evidence([false])).recommendedDifficulty).toBe("Basic");
  });
  it("drops older evidence and selects only unanswered candidates", () => {
    expect(adaptiveDifficulty("Intermediate", evidence([true, true, false, false, false, false, false])).recommendedDifficulty).toBe("Basic");
    expect(selectUnanswered([{ id: "one" }, { id: "two" }], new Set(["one"]), () => 0)?.id).toBe("two");
    expect(selectUnanswered([{ id: "one" }], new Set(["one"]))).toBeNull();
  });
});

it("publishes only validated scoring fields, excluding private metadata", () => {
  const problem = { id: "first", version: 1, status: "approved", validationRecordId: "approval" };
  const validation = { decision: "approved", problemId: "first", problemVersion: 1 };
  expect(scoringReference({ ...reference, rawOutput: "private", reviewerEmail: "private" }, problem, validation)).not.toHaveProperty("rawOutput");
  expect(() => scoringReference(reference, problem, { ...validation, decision: "rejected" })).toThrow("matching recorded approval");
});
