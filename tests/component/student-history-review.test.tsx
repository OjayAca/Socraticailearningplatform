import { clearViews } from "@/lib/view-cache";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { SecureStudentHistory, SecureStudentReview } from "@/app/components/SecureStudent";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
  createFollowUpSession: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  onSnapshot: mocks.onSnapshot,
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("@/lib/secure-api", () => ({
  createFollowUpSession: mocks.createFollowUpSession,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ firebaseUser: { uid: "student-1" } }),
}));

vi.mock("@/app/components/StudentShell", () => ({
  StudentShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/app/components/ScorecardDetails", () => ({
  ScorecardDetails: ({ scorecard }: { scorecard: { total: number } }) => <p>Scorecard {scorecard.total}</p>,
}));

function docs(records: Array<Record<string, unknown>>) {
  return {
    docs: records.map((record) => ({
      id: record.id,
      data: () => {
        const { id: _id, ...value } = record;
        return value;
      },
    })),
  };
}

describe("student history and review supporting flows", () => {
  beforeEach(() => {
    clearViews();
    mocks.onSnapshot.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.getDoc.mockReset();
    mocks.getDocs.mockReset();
    mocks.createFollowUpSession.mockReset();
  });

  afterEach(() => { cleanup(); clearViews(); });

  it("routes current sessions to learning and terminal or legacy records to review", async () => {
    mocks.onSnapshot.mockImplementation((_query, next) => {
      next(docs([
        {
          id: "active-v4",
          schemaVersion: 5,
          workflowVersion: 6,
          status: "in_progress",
          subject: "Quantitative Methods",
          topic: "Probability",
        },
        {
          id: "legacy-v3",
          schemaVersion: 3,
          workflowVersion: 3,
          status: "completed",
          subject: "Discrete Mathematics",
          topic: "Graph Theory",
        },
      ]));
      return mocks.unsubscribe;
    });
    const { container, unmount } = render(
      <MemoryRouter>
        <SecureStudentHistory />
      </MemoryRouter>,
    );

    await screen.findByText("Probability");
    expect(container.querySelector('a[href="/session/active-v4/learn"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/student/review/legacy-v3"]')).toBeInTheDocument();
    const publish = mocks.onSnapshot.mock.calls[0][1];
    act(() => publish(docs([{id:'active-v4',schemaVersion:5,workflowVersion:6,status:'submitted',subject:'Quantitative Methods',topic:'Probability'}])));
    expect(container.querySelector('a[href="/student/review/active-v4"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/session/active-v4/learn"]')).not.toBeInTheDocument();
    expect(screen.queryByText('Graph Theory')).not.toBeInTheDocument();
    unmount();
    // Route changes detach the view listener; the authenticated cache owns the stream.
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    const returning = render(<MemoryRouter><SecureStudentHistory /></MemoryRouter>);
    expect(screen.getByText('Probability')).toBeVisible();
    expect(mocks.onSnapshot).toHaveBeenCalledOnce();
    returning.unmount();
    clearViews(); // Same disposal path used on auth changes.
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();

  });

  it("shows a useful missing-record state", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    mocks.getDocs.mockResolvedValue(docs([]));
    render(
      <MemoryRouter initialEntries={["/student/review/missing"]}>
        <Routes>
          <Route path="/student/review/:sessionId" element={<SecureStudentReview />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("The learning record was not found.")).toBeVisible();
    expect(screen.getByRole("link", { name: /return to history/i })).toHaveAttribute("href", "/student/history");
  });

  it("renders preserved evidence and creates the single allowed follow-up", async () => {
    mocks.getDoc.mockResolvedValue({
      id: "returned-session",
      exists: () => true,
      data: () => ({
        subject: "Discrete Mathematics",
        topic: "Logic",
        status: "returned",
        originalQuestion: "Evaluate the proposition.",
        scorecard: { total: 82 },
        releasedSolution: {
          method: "Truth table",
          justification: "It covers every truth assignment.",
          steps: ["List the assignments."],
          answer: "A tautology",
          verification: "Every row is true.",
          interpretation: "The proposition is always true.",
        },
        adminReview: { comment: "Explain the final implication more clearly." },
      }),
    });
    mocks.getDocs.mockResolvedValue(
      docs([
        {
          id: "response-1",
          phase: "problem_understanding",
          response: { plainText: "I identified the propositions." },
          evaluation: { evidenceSummary: "Relevant information was identified." },
        },
      ]),
    );
    mocks.createFollowUpSession.mockResolvedValue({ session: { id: "follow-up-1" } });

    render(
      <MemoryRouter initialEntries={["/student/review/returned-session"]}>
        <Routes>
          <Route path="/student/review/:sessionId" element={<SecureStudentReview />} />
          <Route path="/session/:sessionId/learn" element={<p>Follow-up learner screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Evaluate the proposition.")).toBeVisible();
    expect(screen.getByText("Scorecard 82")).toBeVisible();
    expect(screen.getByText("Unlocked worked solution")).toBeVisible();
    expect(screen.getByText("Explain the final implication more clearly.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /create one linked follow-up/i }));
    await waitFor(() => expect(mocks.createFollowUpSession).toHaveBeenCalledWith("returned-session"));
    expect(await screen.findByText("Follow-up learner screen")).toBeVisible();
  });

  it("renders saved Socratic conversation with AI tutor on the left and student on the right", async () => {
    mocks.getDoc.mockResolvedValue({
      id: "v6-session",
      exists: () => true,
      data: () => ({
        workflowVersion: 6,
        subject: "Discrete Mathematics",
        topic: "Set Operations",
        status: "completed",
        originalQuestion: "Find the union of A = {1, 2} and B = {2, 3}.",
      }),
    });
    mocks.getDocs
      .mockResolvedValueOnce(docs([]))
      .mockResolvedValueOnce(
        docs([
          {
            id: "msg-1",
            role: "assistant",
            text: "Let's begin by understanding the problem.",
          },
          {
            id: "msg-2",
            role: "student",
            text: "I need to find the union of the two sets.",
          },
        ]),
      );

    render(
      <MemoryRouter initialEntries={["/student/review/v6-session"]}>
        <Routes>
          <Route path="/student/review/:sessionId" element={<SecureStudentReview />} />
        </Routes>
      </MemoryRouter>,
    );

    const section = await screen.findByRole("region", { name: "Saved tutor conversation" });
    expect(section).toBeVisible();
    expect(screen.getByText("Socratic conversation")).toBeVisible();

    const tutorArticle = screen.getByRole("article", { name: "AI tutor" });
    const studentArticle = screen.getByRole("article", { name: "You" });

    expect(tutorArticle).toHaveTextContent("Let's begin by understanding the problem.");
    expect(tutorArticle).not.toHaveClass("flex-row-reverse");

    expect(studentArticle).toHaveTextContent("I need to find the union of the two sets.");
    expect(studentArticle).toHaveClass("flex-row-reverse");
    expect(studentArticle.querySelector(".bg-violet-600")).not.toBeNull();
  });

  it("distinguishes loading, error with Retry, genuinely empty, and filtered-empty history states", async () => {
    // 1. Loading state
    mocks.onSnapshot.mockImplementation(() => mocks.unsubscribe);
    const loadingView = render(
      <MemoryRouter>
        <SecureStudentHistory />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status", { name: "Loading learning records" })).toBeVisible();
    expect(screen.queryByText(/Your learning journey starts here/i)).not.toBeInTheDocument();
    loadingView.unmount();
    clearViews();

    // 2. Error state hides empty copy and retries on click
    mocks.onSnapshot
      .mockImplementationOnce((_query, _next, onError) => {
        onError(new Error("permission-denied"));
        return mocks.unsubscribe;
      })
      .mockImplementationOnce((_query, next) => {
        next(docs([]));
        return mocks.unsubscribe;
      });
    const errorView = render(
      <MemoryRouter>
        <SecureStudentHistory />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Learning progress could not be loaded");
    expect(screen.queryByText(/Your learning journey starts here/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    // 3. Genuinely empty state after retry
    expect(
      await screen.findByText(
        "Your learning journey starts here. Start your first MINDGUIDE session to practice mathematical reasoning.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /start your first session/i })).toHaveAttribute(
      "href",
      "/student/task",
    );
    expect(screen.queryByRole("searchbox", { name: "Search sessions" })).not.toBeInTheDocument();
    errorView.unmount();
    clearViews();

    // 4. Search & filters + filtered-empty Clear filters reset
    mocks.onSnapshot.mockImplementation((_query, next) => {
      next(
        docs([
          {
            id: "s1",
            schemaVersion: 5,
            workflowVersion: 6,
            status: "submitted",
            subject: "Quantitative Methods",
            topic: "Bayes Theorem",
            scorecard: { total: 91 },
            submittedAt: Date.UTC(2026, 9, 15),
          },
          {
            id: "s2",
            schemaVersion: 5,
            workflowVersion: 6,
            status: "returned",
            subject: "Discrete Mathematics",
            topic: "Induction Proof",
            scorecard: { total: 74 },
          },
        ]),
      );
      return mocks.unsubscribe;
    });
    render(
      <MemoryRouter>
        <SecureStudentHistory />
      </MemoryRouter>,
    );

    await screen.findByText("Bayes Theorem");
    expect(screen.getByText("Submitted for review")).toBeVisible();
    expect(screen.getByText("Returned for follow-up")).toBeVisible();
    expect(screen.getByText("91/100")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "nonexistent-topic" },
    });
    expect(screen.getByText("No sessions match your current search or filters.")).toBeVisible();
    expect(screen.queryByText(/Your learning journey starts here/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(screen.getByText("Bayes Theorem")).toBeVisible();
    expect(screen.getByText("Induction Proof")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Returned" }));
    expect(screen.queryByText("Bayes Theorem")).not.toBeInTheDocument();
    expect(screen.getByText("Induction Proof")).toBeVisible();
  });

  it("displays Back to history navigation and standardized status/phase labels on SecureStudentReview", async () => {
    mocks.getDoc.mockResolvedValue({
      id: "rev-session",
      exists: () => true,
      data: () => ({
        workflowVersion: 6,
        subject: "Quantitative Methods",
        topic: "Probability",
        status: "returned",
        originalQuestion: "Find P(A).",
      }),
    });
    mocks.getDocs
      .mockResolvedValueOnce(
        docs([
          {
            id: "resp-1",
            phase: "verification_and_checking",
            response: { plainText: "Checked sum of probabilities equals 1." },
            evaluation: { evidenceSummary: "Verified probability axioms." },
          },
        ]),
      )
      .mockResolvedValueOnce(docs([]));

    render(
      <MemoryRouter initialEntries={["/student/review/rev-session"]}>
        <Routes>
          <Route path="/student/review/:sessionId" element={<SecureStudentReview />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: /back to history/i })).toHaveAttribute(
      "href",
      "/student/history",
    );
    expect(screen.getByText("Returned for follow-up")).toBeVisible();
    expect(screen.getByText("Verify and Check")).toBeVisible();
  });
});
