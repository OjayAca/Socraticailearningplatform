import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  SecureAdminLogs,
  SecureAdminMaintenance,
  SecureAdminNotifications,
  SecureAdminProgress,
  SecureAdminProgressDetail,
  SecureAdminReports,
  SecureAdminReview,
  SecureAdminSettings,
  SecureAdminUsers,
} from "@/app/components/SecureAdmin";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  signOut: vi.fn(),
  adminDeleteUser: vi.fn(),
  adminExportReport: vi.fn(),
  adminManageUser: vi.fn(),
  adminOverrideSessionSupport: vi.fn(),
  adminPublishAnnouncement: vi.fn(),
  adminQueryReport: vi.fn(),
  adminReviewSession: vi.fn(),
  adminUpsertContent: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...path) => ({ path })),
  doc: vi.fn((_db, ...path) => ({ path })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((value) => value),
  where: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("@/lib/secure-api", () => ({
  getPilotStatus: async () => ({ state: "closed", enabledTopicIds: [], admitted: false }),
  adminSetPilot: async () => ({ state: "closed", enabledTopicIds: [] }),
  adminPilotRoster: vi.fn(),
  adminDeleteUser: mocks.adminDeleteUser,
  adminExportReport: mocks.adminExportReport,
  adminManageUser: mocks.adminManageUser,
  adminOverrideSessionSupport: mocks.adminOverrideSessionSupport,
  adminPublishAnnouncement: mocks.adminPublishAnnouncement,
  adminQueryReport: mocks.adminQueryReport,
  adminReviewSession: mocks.adminReviewSession,
  adminUpsertContent: mocks.adminUpsertContent,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ signOut: mocks.signOut }),
}));

vi.mock("@/app/components/ManagedContentEditor", () => ({
  CONTENT_COLLECTIONS: ["problems", "topics", "system_settings"],
  ManagedContentEditor: ({ collectionName }: { collectionName: string }) => <p>Editor {collectionName}</p>,
}));

vi.mock("@/app/components/student/NotificationContent", () => ({
  NotificationContent: () => <p>Notification feed</p>,
}));

vi.mock("@/app/components/student/ProfileContent", () => ({
  ProfileContent: () => <p>Administrator profile</p>,
}));

vi.mock("@/app/components/ScorecardDetails", () => ({
  ScorecardDetails: ({ scorecard }: { scorecard: { total: number } }) => <p>Scorecard {scorecard.total}</p>,
}));

function snapshot(records: Array<Record<string, unknown>>) {
  return {
    size: records.length,
    docs: records.map((record) => ({
      id: record.id,
      data: () => {
        const { id: _id, ...value } = record;
        return value;
      },
    })),
  };
}

function renderRoute(element: React.ReactNode, path = "/admin/test", routePattern = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePattern} element={element} />
        <Route path="/admin/dashboard" element={<p>Administrator dashboard destination</p>} />
        <Route path="/admin/reports/print" element={<p>Prepared print destination</p>} />
        <Route path="/admin/progress" element={<p>Progress destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("administrator account safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.adminManageUser.mockResolvedValue({});
    mocks.adminDeleteUser.mockResolvedValue({ retainedLearningRecords: 2 });
  });

  afterEach(cleanup);

  it("loads, searches, and performs an audited reversible account action", async () => {
    mocks.getDocs.mockResolvedValue(
      snapshot([
        { id: "student-1", displayName: "Student One", email: "one@example.com", role: "student", status: "active" },
        { id: "student-2", displayName: "Second Learner", email: "two@example.com", role: "student", status: "suspended" },
      ]),
    );
    renderRoute(<SecureAdminUsers />);

    await screen.findByText("Student One");
    fireEvent.change(screen.getByPlaceholderText(/search name/i), { target: { value: "Second" } });
    expect(screen.queryByText("Student One")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "activate" }));
    await waitFor(() =>
      expect(mocks.adminManageUser).toHaveBeenCalledWith({
        userId: "student-2",
        action: "activate",
        reason: "Authorized capstone account administration",
      }),
    );
  });

  it("directs privileged Auth operations to Firebase Console", async () => {
    mocks.getDocs.mockResolvedValue(snapshot([{ id: "student-3", displayName: "Deleted Learner", email: "deleted@example.com", role: "student", status: "deactivated" }]));
    renderRoute(<SecureAdminUsers />);
    await screen.findByText("Deleted Learner");
    expect(screen.queryByRole("button", { name: "delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Firebase Console" })).toHaveAttribute("target", "_blank");
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("surfaces account-list failures instead of leaving a permanent spinner", async () => {
    mocks.getDocs.mockRejectedValue(new Error("Accounts are temporarily unavailable."));
    renderRoute(<SecureAdminUsers />);

    expect(await screen.findByText("Accounts are temporarily unavailable.")).toBeVisible();
  });
});

describe("administrator reports and announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("previews pseudonymized report rows and opens a prepared print result", async () => {
    mocks.adminQueryReport.mockResolvedValue({ rows: [{ learner: "Learner A", completed: 3 }] });
    mocks.adminExportReport.mockResolvedValue({
      output: "print",
      kind: "learning_progress",
      rows: [{ learner: "Learner A", completed: 3 }],
      generatedAt: 1,
      pseudonymized: true,
    });
    renderRoute(<SecureAdminReports />);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Learner A")).toBeVisible();
    expect(mocks.adminQueryReport).toHaveBeenCalledWith({ kind: "learning_progress", includeIdentity: false, limit: 250 });

    fireEvent.click(screen.getByRole("button", { name: /open print report/i }));
    expect(await screen.findByText("Prepared print destination")).toBeVisible();
  });

  it("requires complete announcement input and reports delivery", async () => {
    mocks.adminPublishAnnouncement.mockResolvedValue({ delivered: 4 });
    renderRoute(<SecureAdminNotifications />);

    const publish = screen.getByRole("button", { name: /publish to active students/i });
    expect(publish).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Announcement title"), { target: { value: "Staging notice" } });
    fireEvent.change(screen.getByPlaceholderText("Message for active students"), { target: { value: "Scheduled verification notice." } });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);

    expect(await screen.findByText(/delivered to 4 active students/i)).toBeVisible();
    expect(mocks.adminPublishAnnouncement).toHaveBeenCalledWith({
      title: "Staging notice",
      message: "Scheduled verification notice.",
      reason: "Authorized capstone announcement",
    });
  });
});

describe("administrator progress, logs, and settings recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.adminUpsertContent.mockResolvedValue({});
  });

  afterEach(cleanup);

  it("joins learner profiles with canonical progress and filters the table", async () => {
    mocks.getDocs
      .mockResolvedValueOnce(snapshot([{ id: "student-1", displayName: "Student One", email: "one@example.com", role: "student", status: "active" }]))
      .mockResolvedValueOnce(snapshot([{ id: "student-1", sessionsCompleted: 4, averageCTScore: 81, currentStreak: 2 }]));
    renderRoute(<SecureAdminProgress />);

    const learner = await screen.findByRole("link", { name: "Student One" });
    expect(learner).toHaveAttribute("href", "/admin/progress/student-1");
    expect(screen.getByText("81/100")).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText(/search learner/i), { target: { value: "missing" } });
    expect(screen.queryByText("Student One")).not.toBeInTheDocument();
  });

  it("shows progress-detail and log loading failures", async () => {
    mocks.getDoc.mockRejectedValue(new Error("Progress detail is offline."));
    mocks.getDocs.mockRejectedValue(new Error("Progress detail is offline."));
    const progressView = renderRoute(<SecureAdminProgressDetail />, "/admin/progress/student-1", "/admin/progress/:userId");
    expect(await screen.findByText("Progress detail is offline.")).toBeVisible();

    progressView.unmount();
    mocks.getDocs.mockRejectedValue(new Error("Audit logs are offline."));
    renderRoute(<SecureAdminLogs />);
    expect(await screen.findByText("Audit logs are offline.")).toBeVisible();
  });

  it("reports invalid settings JSON and preserves the maintenance warning", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ retentionDays: 90 }) });
    const settingsView = renderRoute(<SecureAdminSettings />);
    const editor = await screen.findByLabelText("Privacy settings JSON");
    fireEvent.change(editor, { target: { value: "not-json" } });
    fireEvent.click(screen.getByRole("button", { name: /save audited settings/i }));
    expect(await screen.findByText(/unexpected token|not valid json/i)).toBeVisible();
    expect(mocks.adminUpsertContent).not.toHaveBeenCalled();

    settingsView.unmount();
    renderRoute(<SecureAdminMaintenance />);
    expect(await screen.findByText("closed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save release controls" })).toBeVisible();
  });
});

describe("administrator review safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.adminReviewSession.mockResolvedValue({});
    mocks.adminOverrideSessionSupport.mockResolvedValue({});
    mocks.getDoc.mockResolvedValue({
      id: "session-1",
      exists: () => true,
      data: () => ({
        studentName: "Student One",
        subject: "Quantitative Methods",
        topic: "Probability",
        status: "submitted",
        originalQuestion: "Find the probability.",
        scorecard: { total: 80 },
        releasedSolution: { method: "Counting", steps: ["Count outcomes"], answer: "1/2" },
      }),
    });
    mocks.getDocs.mockResolvedValue(snapshot([]));
  });

  afterEach(cleanup);

  it("requires meaningful reasons and comments before privileged review actions", async () => {
    renderRoute(<SecureAdminReview />, "/admin/review/session-1", "/admin/review/:sessionId");

    await screen.findByText("Find the probability.");
    const override = screen.getByRole("button", { name: /authorize full solution/i });
    const reviewed = screen.getByRole("button", { name: /mark reviewed/i });
    expect(override).toBeDisabled();
    expect(reviewed).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Required exception reason"), { target: { value: "Valid audited reason" } });
    expect(override).toBeEnabled();

    fireEvent.change(screen.getByRole("textbox", { name: /administrator formative comment/i }), { target: { value: "Good reasoning evidence." } });
    expect(reviewed).toBeEnabled();
    fireEvent.click(reviewed);

    await waitFor(() =>
      expect(mocks.adminReviewSession).toHaveBeenCalledWith({
        sessionId: "session-1",
        outcome: "reviewed",
        comment: "Good reasoning evidence.",
      }),
    );
    expect(await screen.findByText("Administrator dashboard destination")).toBeVisible();
  });
});
