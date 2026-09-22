import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { SecureSession } from "@/app/components/SecureSession";

const mocks = vi.hoisted(() => ({
  firebaseUser: { uid: "student-1" },
  getDoc: vi.fn(),
  submitLearningSession: vi.fn(),
  evaluatePhaseResponse: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_database, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: mocks.getDoc,
  collection: vi.fn((_db, ...segments: string[]) => ({ path: segments.join("/") })),
  getDocs: mocks.getDocs,
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

vi.mock("@/lib/secure-api", () => ({
  checkLearningSessionActivity: vi.fn().mockResolvedValue(undefined),
  abandonLearningSession: vi.fn(),
  evaluatePhaseResponse: mocks.evaluatePhaseResponse,
  finalizeScorecard: vi.fn(),
  requestSessionSupport: vi.fn(),
  saveSessionDraft: vi.fn(),
  submitLearningSession: mocks.submitLearningSession,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    firebaseUser: mocks.firebaseUser,
  }),
}));

vi.mock("@/app/components/MathInput", () => ({
  MathInput: ({ label = "Your reasoning", value, onChange }: { label?: string; value: {plainText:string}; onChange: (value:{plainText:string})=>void }) => <label>{label}<textarea aria-label={label} value={value.plainText} onChange={event=>onChange({plainText:event.target.value})} /></label>,
}));

function sessionSnapshot(id: string, overrides: Record<string, unknown> = {}) {
  const data = {
    schemaVersion: 5,
    workflowVersion: 6,
    revision: 0,
    studentId: "student-1",
    subjectId: "quantitative-methods",
    topicId: "probability",
    subject: "Quantitative Methods",
    topic: "Probability",
    difficulty: "Basic",
    problemId: "probability-basic-1",
    originalQuestion: "What is the probability of rolling an even number?",
    status: "in_progress",
    currentPhase: "problem_understanding",
    currentPrompt: "Restate the probability problem in your own words.",
    gateStates: {
      problem_understanding: { status: "pending", attemptCount: 0, correctiveCycleCount: 0 },
      relevant_information_identification: { status: "locked", attemptCount: 0, correctiveCycleCount: 0 },
      method_selection: { status: "locked", attemptCount: 0, correctiveCycleCount: 0 },
      formula_theorem_justification: { status: "locked", attemptCount: 0, correctiveCycleCount: 0 },
      guided_computation_or_proof: { status: "locked", attemptCount: 0, correctiveCycleCount: 0 },
      verification_and_checking: { status: "locked", attemptCount: 0, correctiveCycleCount: 0 },
      result_interpretation: { status: "locked", attemptCount: 0, correctiveCycleCount: 0 },
    },
    gateEvaluations: {},
    allowedSupport: ["socratic_prompt"],
    draft: null,
    scorecard: null,
    releasedSolution: null,
    promptAdjustment: "maintain",
    ...overrides,
  };

  return {
    id,
    exists: () => true,
    data: () => data,
  };
}

function renderSession(id = "new-session") {
  return render(
    <MemoryRouter initialEntries={[`/session/${id}/learn`]}>
      <Routes>
        <Route path="/session/:sessionId/learn" element={<SecureSession />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SecureSession AI workflow v6 workflow", () => {
  beforeEach(() => {
    mocks.getDoc.mockReset();
    mocks.submitLearningSession.mockReset();
    mocks.evaluatePhaseResponse.mockReset();
    mocks.getDocs.mockResolvedValue({docs:[]});
    sessionStorage.clear();
  });

  afterEach(cleanup);

  it("reloads saved conversation and sends clarification with question intent",async()=>{
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session"));
    mocks.getDocs.mockResolvedValue({docs:[{id:"opening",data:()=>({role:"assistant",phase:"problem_understanding",text:"Which quantity are you finding?"}),get:()=>({toMillis:()=>1})}]});
    mocks.evaluatePhaseResponse.mockRejectedValue(new Error("Free allowance paused; your work is saved."));
    renderSession();
    expect(await screen.findByText("Which quantity are you finding?")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Your reasoning"),{target:{value:"What does equally likely mean?"}});
    fireEvent.change(screen.getByLabelText("Message type"),{target:{value:"question"}});
    fireEvent.click(screen.getByRole("button",{name:"Ask tutor"}));
    await waitFor(()=>expect(mocks.evaluatePhaseResponse).toHaveBeenCalledWith(expect.objectContaining({intent:"question",revision:0,response:expect.objectContaining({plainText:"What does equally likely mean?"})})));
    expect(await screen.findByRole("alert")).toHaveTextContent("Free allowance paused");
    expect(screen.getByLabelText("Your reasoning")).toHaveValue("What does equally likely mean?");
    expect(JSON.parse(sessionStorage.getItem("mindguide.draft.student-1.new-session")!).response.plainText).toBe("What does equally likely mean?");
  });

  it.each(["new-session", "follow-up-session"])(
    "opens the current AI workflow v6 learner workflow for %s",
    async (sessionId) => {
      mocks.getDoc.mockResolvedValue(sessionSnapshot(sessionId, {
        parentSessionId: sessionId === "follow-up-session" ? "returned-session" : null,
      }));

      renderSession(sessionId);

      expect(await screen.findByText("What is the probability of rolling an even number?")).toBeVisible();
      expect(screen.getByText("Restate the probability problem in your own words.")).toBeVisible();
      expect(screen.getByRole("button", { name: /submit reasoning/i })).toBeDisabled();
    },
  );

  it("keeps an incompatible schema-v3 session out of the current workflow", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("legacy-session", { schemaVersion: 3 }));

    renderSession("legacy-session");

    expect(await screen.findByText("Session unavailable")).toBeVisible();
    expect(screen.getByText(/incompatible legacy workflow/i)).toBeVisible();
  });

  it("reloads a scored session and continues to immutable submission", async () => {
    const scorecard = {
      total: 84,
      feedback: "Your reasoning is strong and your verification can be clearer.",
      generatedAt: 1,
      criteria: Object.fromEntries([
        ["accuracy", 22],
        ["logicalValidity", 20],
        ["methodSelection", 21],
        ["explanationQuality", 21],
      ].map(([category, score]) => [category, {
        category,
        score,
        evidence: [`${category} evidence`],
        reason: `${category} reason`,
        improvementAdvice: `${category} advice`,
        confidence: "high",
        source: "deterministic",
      }])),
    };
    mocks.getDoc.mockResolvedValue(sessionSnapshot("scored-session", {
      revision: 8,
      status: "ready_for_submission",
      currentPhase: "critical_thinking_scorecard",
      currentPrompt: "Review and submit your learning record.",
      scorecard,
      releasedSolution: {
        method: "Count the equally likely outcomes.",
        justification: "Three of six outcomes are even.",
        steps: ["List the outcomes", "Count the even outcomes"],
        answer: "1/2",
        verification: "3 divided by 6 simplifies to 1/2.",
        interpretation: "An even result occurs half of the time.",
        releasedAt: 1,
      },
    }));
    mocks.submitLearningSession.mockResolvedValue({
      session: {
        id: "scored-session",
        schemaVersion: 5,
        workflowVersion: 6,
        revision: 9,
        studentId: "student-1",
        subjectId: "quantitative-methods",
        topicId: "probability",
        subject: "Quantitative Methods",
        topic: "Probability",
        difficulty: "Basic",
        problemId: "probability-basic-1",
        originalQuestion: "What is the probability of rolling an even number?",
        status: "submitted",
        currentPhase: "critical_thinking_scorecard",
        currentStage: "interpretation",
        currentInternalGate: null,
        currentPrompt: "Review and submit your learning record.",
        stageProgress: Object.fromEntries([
          ["problem_understanding", 2],
          ["method_selection", 2],
          ["computation", 2],
          ["interpretation", 1],
        ].map(([stage, totalGates]) => [stage, {
          stage,
          status: "completed",
          acceptedGates: totalGates,
          totalGates,
        }])),
        gates: {},
        allowedSupport: [],
        draft: null,
        scorecard,
        releasedSolution: null,
        adaptiveRecommendation: null,
        configurationVersions: null,
        promptAdjustment: "maintain",
        createdAt: 1,
        updatedAt: 2,
        learningCompletedAt: 2,
      },
    });

    renderSession("scored-session");

    expect(await screen.findByText("84/100")).toBeVisible();
    const submit = screen.getByRole("button", {
      name: /submit immutable record for administrator review/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mocks.submitLearningSession).toHaveBeenCalledWith("scored-session", 8);
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session submitted" })).toBeVisible();
    });
  });
});
