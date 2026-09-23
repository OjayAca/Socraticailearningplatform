import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { SecureStudentHistory, SecureStudentReview } from "@/app/components/SecureStudent";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  createFollowUpSession: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
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
    mocks.getDoc.mockReset();
    mocks.getDocs.mockReset();
    mocks.createFollowUpSession.mockReset();
  });

  afterEach(cleanup);

  it("routes current sessions to learning and terminal or legacy records to review", async () => {
    mocks.getDocs.mockResolvedValue(
      docs([
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
      ]),
    );
    const { container } = render(
      <MemoryRouter>
        <SecureStudentHistory />
      </MemoryRouter>,
    );

    await screen.findByText("Probability");
    expect(container.querySelector('a[href="/session/active-v4/learn"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/student/review/legacy-v3"]')).toBeInTheDocument();
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
});
