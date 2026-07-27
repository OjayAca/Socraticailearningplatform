import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SecureStudentDashboard } from "@/app/components/SecureStudent";

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  setTheme: vi.fn(),
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: mocks.getDocs,
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

vi.mock("@/lib/secure-api", () => ({
  createFollowUpSession: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    setTheme: mocks.setTheme,
  }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      firebaseUser: { uid: "student-1" },
      signOut: mocks.signOut,
      userProfile: {
        displayName: "Student One",
        email: "student@example.com",
      },
    }),
}));

function snapshot(sessions: Array<Record<string, unknown>>) {
  return {
    docs: sessions.map((session) => ({
      id: session.id,
      data: () => {
        const { id: _id, ...data } = session;
        return data;
      },
    })),
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <SecureStudentDashboard />
    </MemoryRouter>,
  );
}

describe("SecureStudentDashboard", () => {
  beforeEach(() => {
    mocks.getDocs.mockReset();
    mocks.setTheme.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue();
  });

  afterEach(cleanup);

  it("preserves metric calculations and session destinations", async () => {
    mocks.getDocs.mockResolvedValue(snapshot([
      {
        id: "active-session",
        subject: "Quantitative Methods",
        topic: "Probability",
        status: "in_progress",
        schemaVersion: 3,
        workflowVersion: 4,
      },
      {
        id: "submitted-session",
        subject: "Discrete Mathematics",
        topic: "Logic and Propositions",
        status: "submitted",
        scorecard: { total: 80 },
      },
      {
        id: "reviewed-session",
        subject: "Quantitative Methods",
        topic: "Data Interpretation",
        status: "reviewed",
        ctScore: 70,
      },
    ]));

    const { container } = renderDashboard();

    expect(screen.getByRole("status", { name: "Loading learning records" })).toBeVisible();
    await screen.findByText("Probability");

    expect(within(screen.getByText("Completed").parentElement!).getByText("2")).toBeVisible();
    expect(within(screen.getByText("Formative average").parentElement!).getByText("75/100")).toBeVisible();
    expect(within(screen.getByText("Active").parentElement!).getByText("1")).toBeVisible();
    expect(screen.getByRole("link", { name: /start session/i })).toHaveAttribute("href", "/student/task");
    expect(container.querySelector('a[href="/session/active-session/learn"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/student/review/submitted-session"]')).toBeInTheDocument();
  });

  it("renders the empty recent-sessions state", async () => {
    mocks.getDocs.mockResolvedValue(snapshot([]));
    renderDashboard();

    expect(await screen.findByText("No learning records yet.")).toBeVisible();
    expect(screen.getByText("Start your first guided session when you are ready.")).toBeVisible();
  });

  it("shows a recoverable records error", async () => {
    mocks.getDocs.mockRejectedValue(new Error("Records are temporarily unavailable."));
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Records are temporarily unavailable.")).toBeVisible();
    });
  });
});
