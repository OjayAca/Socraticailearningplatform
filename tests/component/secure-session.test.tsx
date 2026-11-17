import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { SecureSession } from "@/app/components/SecureSession";

const mocks = vi.hoisted(() => ({
  firebaseUser: { uid: "student-1" },
  getDoc: vi.fn(),
  finalizeScorecard: vi.fn(),
  submitLearningSession: vi.fn(),
  evaluatePhaseResponse: vi.fn(),
  getDocs: vi.fn(),
  requestSessionSupport: vi.fn(),
  resumeTutorOpening: vi.fn(),
  abandonLearningSession: vi.fn(),
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
  abandonLearningSession: mocks.abandonLearningSession,
  evaluatePhaseResponse: mocks.evaluatePhaseResponse,
  finalizeScorecard: mocks.finalizeScorecard,
  requestSessionSupport: mocks.requestSessionSupport,
  resumeTutorOpening: mocks.resumeTutorOpening,
  submitLearningSession: mocks.submitLearningSession,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    firebaseUser: mocks.firebaseUser,
  }),
}));

vi.mock("@/app/components/MathInput", () => ({
  MathInput: ({ label = "Your reasoning", value, onChange, notationOnly, disabled }: { label?: string; value: {plainText:string; latex?:string}; onChange: (value:{plainText:string; latex?:string})=>void; notationOnly?: boolean; disabled?: boolean }) => notationOnly
    ? <input aria-label="Mathematical expression editor" disabled={disabled} value={value.latex ?? ""} onChange={event=>onChange({...value,latex:event.target.value})} />
    : <label>{label}<textarea aria-label={label} value={value.plainText} onChange={event=>onChange({...value,plainText:event.target.value})} /></label>,
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

function projectedSession(overrides: Record<string, unknown> = {}) {
  return {
    ...sessionSnapshot("new-session").data(),
    id: "new-session", currentStage: "problem_understanding", needsOpening: false,
    stageProgress: Object.fromEntries(["problem_understanding", "method_selection", "computation", "interpretation"].map(stage => [stage, { stage, status: stage === "problem_understanding" ? "active" : "locked", acceptedGates: 0, totalGates: stage === "interpretation" ? 1 : 2 }])),
    ...overrides,
  };
}

function messageSnapshot(text: string) {
  return { docs: [{ id: "reply", data: () => ({ role: "assistant", phase: "problem_understanding", text }), get: () => ({ toMillis: () => 2 }) }] };
}

function renderSession(id = "new-session") {
  return render(
    <MemoryRouter initialEntries={[`/session/${id}/learn`]}>
      <Routes>
        <Route path="/session/:sessionId/learn" element={<SecureSession />} />
        <Route path="/student/history" element={<h1>Learning history</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SecureSession AI workflow v6 workflow", () => {
  beforeEach(() => {
    mocks.getDoc.mockReset();
    mocks.finalizeScorecard.mockReset();
    mocks.submitLearningSession.mockReset();
    mocks.evaluatePhaseResponse.mockReset();
    mocks.getDocs.mockReset().mockResolvedValue({docs:[]});
    mocks.requestSessionSupport.mockReset();
    mocks.resumeTutorOpening.mockReset();
    mocks.abandonLearningSession.mockReset();
    sessionStorage.clear();
  });

  afterEach(cleanup);

  it.each(["expired","abandoned","returned","submitted","reviewed"])("does not invent a saved scorecard for %s", async status => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session",{status,scorecard:null}));
    renderSession();
    expect(await screen.findByText(/No saved scorecard is available/)).toBeVisible();
    expect(screen.queryByText(/Your saved scorecard is available/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Critical Thinking Scorecard" })).not.toBeInTheDocument();
  });

  it("reports the scorecard persisted with an expired session", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session",{status:"expired",scorecard:{total:80,criteria:{},generatedAt:1}}));
    renderSession();
    expect(await screen.findByText(/Your saved scorecard is available/)).toBeVisible();
  });

  it("replaces the repeated form and retains the reveal request across retries and remounts", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", { currentPhase:"controlled_solution_release", revision:4, draft:{answer:{plainText:"legacy answer"},methodology:"saved",reflection:"saved"} }));
    mocks.finalizeScorecard.mockRejectedValue(new Error("Please retry generation."));
    const view = renderSession();
    const reveal = await screen.findByRole("button", {name:"View step-by-step solution"});
    expect(screen.queryByLabelText("Final answer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Methodology")).not.toBeInTheDocument();
    fireEvent.click(reveal);
    await screen.findByText("Please retry generation.");
    const first = mocks.finalizeScorecard.mock.calls[0];
    expect(first).toEqual(["new-session",4,expect.any(String)]);
    view.unmount();
    renderSession();
    fireEvent.click(await screen.findByRole("button", {name:"View step-by-step solution"}));
    await waitFor(()=>expect(mocks.finalizeScorecard).toHaveBeenCalledTimes(2));
    expect(mocks.finalizeScorecard.mock.calls[1]).toEqual(first);
    expect(mocks.submitLearningSession).not.toHaveBeenCalled();
  });

  it("disables the reveal button while generating", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", {currentPhase:"controlled_solution_release"}));
    let reject!: (error: Error) => void;
    mocks.finalizeScorecard.mockImplementation(()=>new Promise((_resolve, fail)=>{reject=fail;}));
    renderSession();
    fireEvent.click(await screen.findByRole("button", {name:"View step-by-step solution"}));
    const pending = screen.getByRole("button", {name:"Preparing solution..."});
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(mocks.finalizeScorecard).toHaveBeenCalledTimes(1);
    await act(async()=>reject(new Error("Retry later.")));
  });

  it("reloads saved conversation and sends a natural question without a message selector",async()=>{
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session"));
    mocks.getDocs.mockResolvedValue({docs:[{id:"opening",data:()=>({role:"assistant",phase:"problem_understanding",text:"Which quantity are you finding?"}),get:()=>({toMillis:()=>1})}]});
    mocks.evaluatePhaseResponse.mockRejectedValue(new Error("Free allowance paused; your work is saved."));
    renderSession();
    expect(await screen.findByText("Which quantity are you finding?")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Message your tutor"),{target:{value:"What does equally likely mean?"}});
    expect(screen.queryByLabelText("Message type")).not.toBeInTheDocument();
    expect(screen.queryByText("Restate the probability problem in your own words.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Send message"}));
    await waitFor(()=>expect(mocks.evaluatePhaseResponse).toHaveBeenCalledWith(expect.objectContaining({intent:"answer",revision:0,response:expect.objectContaining({plainText:"What does equally likely mean?"})})));
    expect(await screen.findByRole("alert")).toHaveTextContent("Free allowance paused");
    expect(screen.getByLabelText("Message your tutor")).toHaveValue("What does equally likely mean?");
    expect(JSON.parse(sessionStorage.getItem("mindguide.draft.student-1.new-session")!).response.plainText).toBe("What does equally likely mean?");
  });

  it.each(["new-session", "follow-up-session"])(
    "opens the current AI workflow v6 learner workflow for %s",
    async (sessionId) => {
      mocks.getDoc.mockResolvedValue(sessionSnapshot(sessionId, {
        parentSessionId: sessionId === "follow-up-session" ? "returned-session" : null,
      }));

      renderSession(sessionId);

      await screen.findByRole("heading", { name: "Socratic Session: Quantitative Methods" });
      expect(screen.getByText("What is the probability of rolling an even number?")).toBeVisible();
      expect(screen.getByText("Restate the probability problem in your own words.")).toBeVisible();
      expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    },
  );

  it("handles keyboard input and blocks duplicate sends while a reply is pending", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session"));
    let reject!: (cause: Error) => void;
    mocks.evaluatePhaseResponse.mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    renderSession();
    const composer = await screen.findByLabelText("Message your tutor");
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(mocks.evaluatePhaseResponse).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: "I need help understanding the problem." } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
    expect(mocks.evaluatePhaseResponse).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(mocks.evaluatePhaseResponse).toHaveBeenCalledTimes(1);
    expect(composer).toHaveValue("");
    expect(screen.getByText("I need help understanding the problem.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Your tutor is thinking");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await act(async () => reject(new Error("Try again shortly.")));
    expect(composer).toHaveValue("I need help understanding the problem.");
    expect(composer).toHaveFocus();
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(mocks.evaluatePhaseResponse.mock.calls[1][0].requestId).toBe(mocks.evaluatePhaseResponse.mock.calls[0][0].requestId);
    await act(async () => reject(new Error("Try again shortly.")));
  });

  it("restores a saved equation draft and sends it from the single composer", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session"));
    sessionStorage.setItem("mindguide.draft.student-1.new-session", JSON.stringify({ revision: 0, draft: { answer: { plainText: "" }, methodology: "", reflection: "" }, response: { plainText: "", latex: "x^2" } }));
    mocks.evaluatePhaseResponse.mockRejectedValue(new Error("Offline"));
    renderSession();
    await screen.findByLabelText("Message your tutor");
    expect(screen.queryByLabelText("Mathematical expression editor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Edit equation/ }));
    expect(screen.getByLabelText("Mathematical expression editor")).toHaveValue("x^2");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("alert");
    expect(mocks.evaluatePhaseResponse).toHaveBeenCalledWith(expect.objectContaining({ response: { plainText: "", latex: "x^2" } }));
  });

  it("requests the strongest allowed hint and shows the saved reply once", async () => {
    const session = projectedSession({ allowedSupport: ["socratic_prompt", "targeted_hint"] });
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", { allowedSupport: session.allowedSupport }));
    mocks.requestSessionSupport.mockResolvedValue({ session: { ...session, revision: 1 }, level: "targeted_hint", title: "Hint", content: ["Look at the possible outcomes."] });
    renderSession();
    await screen.findByLabelText("Message your tutor");
    mocks.getDocs.mockResolvedValue(messageSnapshot("Look at the possible outcomes."));
    fireEvent.click(screen.getByRole("button", { name: "I need a hint" }));
    await waitFor(() => expect(mocks.requestSessionSupport).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "new-session", revision: 0, requestedLevel: "targeted_hint", requestId: expect.any(String) })));
    expect(await screen.findByText("Look at the possible outcomes.")).toBeVisible();
    expect(screen.getAllByText("Look at the possible outcomes.")).toHaveLength(1);
    expect(mocks.evaluatePhaseResponse).not.toHaveBeenCalled();
  });

  it("retries the tutor opening before enabling the composer", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", { needsOpening: true }));
    mocks.resumeTutorOpening.mockResolvedValue({ session: projectedSession({ needsOpening: false }) });
    renderSession();
    expect(await screen.findByLabelText("Message your tutor")).toBeDisabled();
    expect(screen.getByRole("button", { name: "I need a hint" })).toBeDisabled();
    mocks.getDocs.mockResolvedValue(messageSnapshot("What do you notice first?"));
    fireEvent.click(screen.getByRole("button", { name: "Start AI conversation" }));
    expect(await screen.findByText("What do you notice first?")).toBeVisible();
    expect(screen.getByLabelText("Message your tutor")).toBeEnabled();
    expect(mocks.resumeTutorOpening).toHaveBeenCalledWith("new-session", 0);
  });

  it("keeps a confirmed reply when the history refresh fails and does not resend it", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session"));
    mocks.evaluatePhaseResponse.mockResolvedValue({ session: projectedSession({ revision: 1 }), nextPrompt: "Which outcomes count?", tutorMessage: { id: "reply", role: "assistant", text: "Which outcomes count?", phase: "problem_understanding", createdAt: 2 } });
    renderSession();
    const composer = await screen.findByLabelText("Message your tutor");
    mocks.getDocs.mockRejectedValue(new Error("History is temporarily unavailable."));
    fireEvent.change(composer, { target: { value: "I am finding the chance of an even result." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("History is temporarily unavailable");
    expect(screen.getByText("Which outcomes count?")).toBeVisible();
    expect(screen.getByText("I am finding the chance of an even result.")).toBeVisible();
    expect(composer).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("preserves the reading position and provides a jump to the latest message", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session"));
    mocks.requestSessionSupport.mockResolvedValue({ session: projectedSession({ revision: 1 }), level: "socratic_prompt", title: "Hint", content: ["Which outcomes count?"] });
    renderSession();
    await screen.findByLabelText("Message your tutor");
    const viewport = screen.getByRole("log").parentElement!.parentElement!;
    Object.defineProperties(viewport, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 400 } });
    viewport.scrollTop = 100;
    fireEvent.scroll(viewport);
    mocks.getDocs.mockResolvedValue(messageSnapshot("Which outcomes count?"));
    fireEvent.click(screen.getByRole("button", { name: "I need a hint" }));
    await screen.findByText("Which outcomes count?");
    expect(viewport.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(viewport.scrollTop).toBe(2000);
    expect(screen.queryByRole("button", { name: "Jump to latest" })).not.toBeInTheDocument();
  });

  it("closes to history without abandoning and disables unavailable hints", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", { allowedSupport: [] }));
    renderSession();
    await screen.findByLabelText("Message your tutor");
    expect(screen.getByRole("button", { name: "I need a hint" })).toBeDisabled();
    fireEvent.click(screen.getByRole("link", { name: "Close session and return to history" }));
    expect(await screen.findByRole("heading", { name: "Learning history" })).toBeVisible();
    expect(mocks.abandonLearningSession).not.toHaveBeenCalled();
  });

  it("shows actual completed-stage progress in the compact header", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", {
      currentPhase: "method_selection",
      gateStates: {
        problem_understanding: { status: "accepted" },
        relevant_information_identification: { status: "accepted" },
        method_selection: { status: "pending" },
      },
    }));
    renderSession();
    expect(await screen.findByRole("progressbar", { name: "Learning progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.queryByText("Session details")).not.toBeInTheDocument();
    expect(screen.queryByText(/reasoning checks/)).not.toBeInTheDocument();
  });

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
      name: /finish session/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mocks.submitLearningSession).toHaveBeenCalledWith("scored-session", 8);
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session submitted" })).toBeVisible();
    });
    const scorecardRegion = screen.getByRole("region", { name: "Critical Thinking Scorecard" });
    expect(scorecardRegion).toBeVisible();
    expect(within(scorecardRegion).getByText("84/100")).toBeVisible();
    expect(within(scorecardRegion).getByText("Your reasoning is strong and your verification can be clearer.")).toBeVisible();
  });

  it("keeps internal lastDiagnosis metadata out of the student conversation UI", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", {
      currentPhase: "method_selection",
      lastDiagnosis: {
        category: "weak_justification",
        evidence: ["Only named mean."],
        confidence: "medium",
        severity: "moderate",
        targetPhase: "method_selection",
        correctivePrompt: "Why does the arithmetic mean apply here?",
        resolutionStatus: "open",
        source: "ai",
        incorrectStep: "mean",
        explanation: "Naming a formula alone does not establish its conditions.",
        recommendedAction: "Link equal observation weights to the givens.",
      },
    }));
    const firstRender = renderSession();
    await screen.findByLabelText("Message your tutor");
    expect(screen.queryByRole("region", { name: "Reasoning diagnosis" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Possible misconception detected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reviewed step:/i)).not.toBeInTheDocument();
    firstRender.unmount();

    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session-high", {
      currentPhase: "method_selection",
      lastDiagnosis: {
        category: "weak_justification",
        evidence: ["Only named mean."],
        confidence: "high",
        severity: "moderate",
        targetPhase: "method_selection",
        correctivePrompt: "Why does the arithmetic mean apply here?",
        resolutionStatus: "open",
        source: "ai",
        incorrectStep: "mean",
        explanation: "Naming a formula alone does not establish its conditions.",
        recommendedAction: "Link equal observation weights to the givens.",
      },
    }));
    renderSession("new-session-high");
    await screen.findByLabelText("Message your tutor");
    expect(screen.queryByRole("region", { name: "Reasoning diagnosis" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Diagnostic Feedback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Next step:/i)).not.toBeInTheDocument();
  });

  it("progresses hints sequentially through allowedSupport and renders supportSummary and nextPracticeRecommendation on the scorecard", async () => {
    const session = projectedSession({
      allowedSupport: ["socratic_prompt", "targeted_hint", "stronger_hint", "partial_step"],
      supportHistory: [],
    });
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session", {
      allowedSupport: session.allowedSupport,
      supportHistory: [],
    }));
    mocks.requestSessionSupport.mockResolvedValueOnce({
      session: {
        ...session,
        revision: 1,
        supportHistory: [{ phase: "problem_understanding", level: "targeted_hint", title: "Reasoning support", content: ["Hint 1"], requestedAt: 1 }],
      },
      level: "targeted_hint",
      title: "Reasoning support",
      content: ["Hint 1"],
    });
    const view = renderSession();
    await screen.findByLabelText("Message your tutor");
    expect(screen.getByText(/Level 1 · Conceptual hint unlocked/i)).toBeVisible();
    mocks.getDocs.mockResolvedValue(messageSnapshot("Hint 1"));
    fireEvent.click(screen.getByRole("button", { name: "I need a hint" }));
    await waitFor(() =>
      expect(mocks.requestSessionSupport).toHaveBeenCalledWith(
        expect.objectContaining({ requestedLevel: "targeted_hint" }),
      ),
    );
    expect(await screen.findByText(/Level 2 · Strategic hint unlocked/i)).toBeVisible();
    view.unmount();
  });

  it("separates local tab draft feedback from confirmed account saving and keeps requestId on Retry sending", async () => {
    mocks.getDoc.mockResolvedValue(sessionSnapshot("new-session"));
    mocks.evaluatePhaseResponse
      .mockRejectedValueOnce(new Error("Temporary network issue."))
      .mockResolvedValueOnce({
        session: projectedSession({ revision: 1 }),
        nextPrompt: "Explain your chosen method.",
        tutorMessage: {
          id: "tutor-1",
          role: "assistant",
          text: "Explain your chosen method.",
          phase: "problem_understanding",
          createdAt: 2,
        },
      });

    renderSession();
    const composer = await screen.findByLabelText("Message your tutor");
    fireEvent.change(composer, { target: { value: "Given: a fair six-sided die." } });
    expect(screen.getByText("Draft saved in this tab.")).toBeVisible();
    expect(screen.queryByText("Saved to your account.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Unable to save. Try again.")).toBeVisible();
    expect(composer).toHaveValue("Given: a fair six-sided die.");

    const retryButton = screen.getByRole("button", { name: "Retry sending" });
    fireEvent.click(retryButton);
    await waitFor(() => expect(mocks.evaluatePhaseResponse).toHaveBeenCalledTimes(2));
    expect(mocks.evaluatePhaseResponse.mock.calls[1][0].requestId).toBe(
      mocks.evaluatePhaseResponse.mock.calls[0][0].requestId,
    );
    expect(await screen.findByText("Saved to your account.")).toBeVisible();
  });

  it("maps verification_and_checking to Stage 4 Check and Interpret at 75% progress", async () => {
    mocks.getDoc.mockResolvedValue(
      sessionSnapshot("new-session", {
        currentPhase: "verification_and_checking",
        gateStates: {
          problem_understanding: { status: "accepted", attemptCount: 1, correctiveCycleCount: 0 },
          relevant_information_identification: { status: "accepted", attemptCount: 1, correctiveCycleCount: 0 },
          method_selection: { status: "accepted", attemptCount: 1, correctiveCycleCount: 0 },
          formula_theorem_justification: { status: "accepted", attemptCount: 1, correctiveCycleCount: 0 },
          guided_computation_or_proof: { status: "accepted", attemptCount: 1, correctiveCycleCount: 0 },
          verification_and_checking: { status: "pending", attemptCount: 0, correctiveCycleCount: 0 },
          result_interpretation: { status: "locked", attemptCount: 0, correctiveCycleCount: 0 },
        },
      }),
    );

    renderSession();
    await screen.findByLabelText("Message your tutor");
    expect(screen.getByRole("progressbar", { name: "Learning progress" })).toHaveAttribute(
      "aria-valuenow",
      "75",
    );
    expect(screen.getByText("Stage 4 · Check and Interpret")).toBeVisible();
  });

  it("toggles Current problem and shows submitted turns without leaking lastDiagnosis in Previous reasoning", async () => {
    mocks.getDoc.mockResolvedValue(
      sessionSnapshot("new-session", {
        currentPhase: "method_selection",
        lastDiagnosis: {
          category: "weak_justification",
          evidence: ["SECRET_DIAGNOSIS_EVIDENCE"],
          confidence: "high",
          severity: "moderate",
          targetPhase: "method_selection",
          correctivePrompt: "Why does it apply?",
          resolutionStatus: "open",
          source: "ai",
          explanation: "HIDDEN_AI_REASONING_NOTE",
        },
      }),
    );
    mocks.getDocs.mockResolvedValue({
      docs: [
        {
          id: "t1",
          data: () => ({ role: "student", phase: "problem_understanding", text: "Even sides are 2, 4, 6." }),
          get: () => ({ toMillis: () => 1 }),
        },
        {
          id: "t2",
          data: () => ({ role: "assistant", phase: "method_selection", text: "Which formula counts favourable outcomes?" }),
          get: () => ({ toMillis: () => 2 }),
        },
      ],
    });

    renderSession();
    await screen.findByLabelText("Message your tutor");

    const problemToggle = screen.getByRole("button", { name: /current problem/i });
    expect(problemToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(problemToggle);
    expect(problemToggle).toHaveAttribute("aria-expanded", "false");

    expect(screen.queryByText("Session details")).not.toBeInTheDocument();
    expect(screen.queryByText(/SECRET_DIAGNOSIS_EVIDENCE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HIDDEN_AI_REASONING_NOTE/)).not.toBeInTheDocument();
  });
});
