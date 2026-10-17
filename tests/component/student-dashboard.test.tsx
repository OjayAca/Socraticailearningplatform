import { clearViews } from "@/lib/view-cache";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SecureStudentDashboard } from "@/app/components/SecureStudent";

const mocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setTheme: vi.fn(),
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("firebase/firestore", () => ({
  onSnapshot: mocks.onSnapshot,
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: mocks.getDoc,
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
    clearViews();
    mocks.onSnapshot.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.onSnapshot.mockImplementation((_query, next, error) => {
      mocks.getDocs().then(next, error);
      return mocks.unsubscribe;
    });
    mocks.getDocs.mockReset();
    mocks.getDoc.mockReset();
    mocks.getDoc.mockResolvedValue({ exists: () => false });
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
        schemaVersion: 5,
        workflowVersion: 6,
      },
      {
        id: "scored-session",
        subject: "Discrete Mathematics",
        topic: "Graph Theory",
        status: "ready_for_submission",
        schemaVersion: 5,
        workflowVersion: 6,
        scorecard: { total: 85 },
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
    expect(within(screen.getByText("Current streak").parentElement!).getByText("0 days")).toBeVisible();
    expect(within(screen.getAllByText("Latest scorecard")[0].parentElement!).getByText("80/100")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Achievements" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start session/i })).toHaveAttribute("href", "/student/task");
    expect(container.querySelector('a[href="/session/active-session/learn"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/session/scored-session/learn"]')).toBeInTheDocument();
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
      expect(screen.getByText("Learning progress could not be loaded. Please try again.")).toBeVisible();
    });
  });
  it("updates metrics live and retains loaded records across navigation", async () => {
    let publish: (value: ReturnType<typeof snapshot>) => void = () => {};
    mocks.onSnapshot.mockImplementation((_query, next) => { publish = next; return mocks.unsubscribe; });
    const view = renderDashboard();
    expect(within(screen.getByText("Completed").parentElement!).getByText("Loading…")).toBeVisible();
    act(() => publish(snapshot([])));
    expect(within(screen.getByText("Completed").parentElement!).getByText("0")).toBeVisible();
    act(() => publish(snapshot([{ id: "new", status: "submitted", submittedAt: new Date(), scorecard: { total: 90 } }])));
    expect(within(screen.getByText("Completed").parentElement!).getByText("1")).toBeVisible();
    expect(within(screen.getByText("Formative average").parentElement!).getByText("90/100")).toBeVisible();
    expect(within(screen.getByText("Current streak").parentElement!).getByText("1 day")).toBeVisible();
    view.unmount();
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    renderDashboard();
    expect(within(screen.getByText("Completed").parentElement!).getByText("1")).toBeVisible();
    expect(mocks.onSnapshot).toHaveBeenCalledOnce();
    clearViews();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("hides misleading zeros after an error and retries the listener", async () => {
    mocks.getDocs.mockRejectedValueOnce(new Error("permission-denied"));
    renderDashboard();
    await screen.findByRole("alert");
    expect(within(screen.getByText("Completed").parentElement!).getByText("—")).toBeVisible();
    expect(screen.queryByText("No learning records yet.")).not.toBeInTheDocument();
    mocks.getDocs.mockResolvedValue(snapshot([{ id: "legacy", status: "completed", ctScore: 92 }]));
    fireEvent.click(screen.getByRole("button", { name: "Retry learning progress" }));
    await waitFor(() => expect(within(screen.getByText("Completed").parentElement!).getByText("1")).toBeVisible());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

});
