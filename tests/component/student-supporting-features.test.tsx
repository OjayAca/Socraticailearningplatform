import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { ScorecardCategory, ScorecardResult } from "@mindguide/contracts";
import { ProfileContent } from "@/app/components/student/ProfileContent";
import { SettingsContent } from "@/app/components/student/SettingsContent";
import { NotificationContent } from "@/app/components/student/NotificationContent";
import { AchievementGrid } from "@/app/components/AchievementGrid";
import { ScorecardDetails } from "@/app/components/ScorecardDetails";

const mocks = vi.hoisted(() => ({
  authState: {} as Record<string, unknown>,
  notificationState: {} as Record<string, unknown>,
  getDoc: vi.fn(),
  setTheme: vi.fn(),
  updateDisplayName: vi.fn(),
  resetPassword: vi.fn(),
  clearError: vi.fn(),
  setLiveAlertPopups: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  retryNotifications: vi.fn(),
  scrollIntoView: vi.fn(),
}));

vi.mock("motion/react", () => ({
  motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: mocks.getDoc,
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark", setTheme: mocks.setTheme }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => mocks.authState,
  isAdminRole: (role: unknown) => role === "admin" || role === "teacher",
}));

vi.mock("@/stores/notification-store", () => ({
  useNotificationStore: () => mocks.notificationState,
  getNotificationText: (notification: { title: string; message: string }) => ({
    title: notification.title,
    message: notification.message,
  }),
  getNotificationActionUrl: (notification: { actionUrl?: string }) => notification.actionUrl,
}));

function studentProfile() {
  return {
    uid: "student-1",
    displayName: "Student One",
    email: "student@example.com",
    role: "student",
    stats: {
      sessionsCompleted: 1,
      averageCTScore: 70,
      currentStreak: 1,
      lastSessionDate: null,
      topicPerformance: [],
    },
  };
}

function renderProfile(initialEntry = "/student/profile") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProfileContent />
    </MemoryRouter>,
  );
}

function ProfileDestination() {
  const location = useLocation();
  return <p>Profile destination: {location.pathname}{location.hash}</p>;
}

describe("student profile and achievements", () => {
  it("only reports verification after refresh confirms it and displays delivery failures", async () => {
    const sendVerification = vi.fn().mockRejectedValueOnce(new Error("Delivery unavailable")).mockResolvedValue(undefined);
    const refreshVerification = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    Object.assign(mocks.authState, {firebaseUser:{emailVerified:false},sendVerification,refreshVerification});
    renderProfile();
    fireEvent.click(screen.getByRole("button", {name:"Send verification email"}));
    expect(await screen.findByText("Delivery unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name:"Send verification email"}));
    expect(await screen.findByText(/Verification email sent/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name:"Check verification"}));
    expect(await screen.findByText(/Your email is still unverified/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name:"Check verification"}));
    expect(await screen.findByText(/Email verified. You can return/)).toBeVisible();
  });

  beforeEach(() => {
    mocks.getDoc.mockReset();
    mocks.updateDisplayName.mockReset();
    mocks.clearError.mockReset();
    mocks.scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: mocks.scrollIntoView,
    });
    mocks.updateDisplayName.mockResolvedValue(undefined);
    mocks.authState = {
      userProfile: studentProfile(),
      updateDisplayName: mocks.updateDisplayName,
      clearError: mocks.clearError,
      error: null,
    };
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        sessionsCompleted: 5,
        averageCTScore: 84,
        currentStreak: 3,
        achievements: {
          first_step: {
            id: "first_step",
            title: "First Step",
            description: "Complete your first learning session.",
            sourceSessionId: "session-1",
            awardedAt: 1,
          },
        },
      }),
    });
  });

  afterEach(cleanup);

  it("loads canonical progress and saves a trimmed display name", async () => {
    renderProfile();

    await waitFor(() => expect(screen.getByText("84%")).toBeVisible());
    expect(screen.getByText("5")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Achievements" })).getByText("Earned")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /edit name/i }));
    const nameInput = screen.getByRole("textbox");
    fireEvent.change(nameInput, { target: { value: "  Updated Student  " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocks.updateDisplayName).toHaveBeenCalledWith("Updated Student"));
    expect(await screen.findByText("Profile Updated")).toBeVisible();
  });

  it("shows administrator profile context without learner statistics", () => {
    mocks.authState = {
      ...mocks.authState,
      userProfile: { ...studentProfile(), role: "admin" },
    };
    renderProfile();

    expect(screen.getByText(/system administrator account/i)).toBeVisible();
    expect(screen.queryByText("Your Learning Stats")).not.toBeInTheDocument();
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });

  it("shows administrator profile save errors without claiming success", async () => {
    mocks.authState = { ...mocks.authState, userProfile: { ...studentProfile(), role: "admin" } };
    mocks.updateDisplayName.mockRejectedValueOnce(new Error("Profile write failed"));
    renderProfile("/admin/profile");
    fireEvent.click(screen.getByRole("button", { name: /edit name/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Updated Admin" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText("Profile write failed")).toBeVisible();
    expect(screen.queryByText("Profile Updated")).not.toBeInTheDocument();
  });

  it("renders all earned and locked achievement states", () => {
    render(
      <AchievementGrid
        achievements={{
          strong_reasoner: {
            id: "strong_reasoner",
            title: "Strong Reasoner",
            description: "Earn a scorecard total of 80 or higher.",
            sourceSessionId: "session-2",
            awardedAt: 2,
          },
        }}
      />,
    );
    const region = screen.getByRole("region", { name: "Achievements" });
    expect(within(region).getAllByText("Not yet earned")).toHaveLength(3);
    expect(within(region).getByText("Earned")).toBeVisible();
  });

  it("scrolls to the stable achievements anchor for a Profile deep link", async () => {
    renderProfile("/student/profile#achievements");

    const region = screen.getByRole("region", { name: "Achievements" });
    expect(region).toHaveAttribute("id", "achievements");
    expect(region).toHaveClass("scroll-mt-6");
    await waitFor(() => {
      expect(mocks.scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "start",
      });
    });
  });

  it("does not force-scroll a normal Profile visit", () => {
    renderProfile();

    expect(screen.getByRole("region", { name: "Achievements" })).toBeVisible();
    expect(mocks.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("student settings", () => {
  beforeEach(() => {
    mocks.setTheme.mockReset();
    mocks.resetPassword.mockReset();
    mocks.clearError.mockReset();
    mocks.setLiveAlertPopups.mockReset();
    mocks.resetPassword.mockResolvedValue(undefined);
    mocks.setLiveAlertPopups.mockResolvedValue(undefined);
    mocks.authState = {
      firebaseUser: { uid: "student-1" },
      userProfile: studentProfile(),
      resetPassword: mocks.resetPassword,
      clearError: mocks.clearError,
    };
    mocks.notificationState = {
      liveAlertPopups: true,
      isPreferenceLoading: false,
      isPreferenceSaving: false,
      preferenceError: null,
      setLiveAlertPopups: mocks.setLiveAlertPopups,
    };
  });

  afterEach(cleanup);

  it("switches theme, persists alert preferences, and requests password recovery", async () => {
    render(<SettingsContent />);

    fireEvent.click(screen.getByRole("button", { name: "Light Mode" }));
    expect(mocks.setTheme).toHaveBeenCalledWith("light");

    fireEvent.click(screen.getByRole("checkbox", { name: /enable live alert popups/i }));
    await waitFor(() => expect(mocks.setLiveAlertPopups).toHaveBeenCalledWith("student-1", false));

    fireEvent.click(screen.getByRole("button", { name: /send reset email/i }));
    await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith("student@example.com"));
    expect(screen.getByRole("button", { name: /reset link sent/i })).toBeDisabled();
  });

  it("keeps preference failures visible and disables the switch while loading", () => {
    mocks.notificationState = {
      ...mocks.notificationState,
      isPreferenceLoading: true,
      preferenceError: "Preference could not be loaded.",
    };
    render(<SettingsContent />);

    expect(screen.getByRole("checkbox", { name: /enable live alert popups/i })).toBeDisabled();
    expect(screen.getByText("Preference could not be loaded.")).toBeVisible();
  });
});

describe("notification center", () => {
  beforeEach(() => {
    mocks.markAsRead.mockReset();
    mocks.markAllAsRead.mockReset();
    mocks.retryNotifications.mockReset();
    mocks.markAsRead.mockResolvedValue(undefined);
    mocks.markAllAsRead.mockResolvedValue(undefined);
    mocks.authState = { userProfile: studentProfile() };
    mocks.notificationState = {
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      markAsRead: mocks.markAsRead,
      markAllAsRead: mocks.markAllAsRead,
      retryNotifications: mocks.retryNotifications,
    };
  });

  afterEach(cleanup);

  function renderNotifications() {
    return render(
      <MemoryRouter initialEntries={["/student/notifications"]}>
        <Routes>
          <Route path="/student/notifications" element={<NotificationContent />} />
          <Route path="/student/profile" element={<ProfileDestination />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders empty, loading, and retryable error states", () => {
    const view = renderNotifications();
    expect(screen.getByText("All caught up!")).toBeVisible();

    view.unmount();
    mocks.notificationState = { ...mocks.notificationState, isLoading: true };
    const loadingView = renderNotifications();
    expect(screen.getByText(/loading notifications/i)).toBeVisible();

    loadingView.unmount();
    mocks.notificationState = { ...mocks.notificationState, error: "Notifications are offline." };
    renderNotifications();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mocks.retryNotifications).toHaveBeenCalledOnce();
  });

  it("marks unread notifications before navigating and supports mark-all", async () => {
    let finishMarkAsRead: (() => void) | undefined;
    mocks.markAsRead.mockImplementation(() => new Promise<void>((resolve) => {
      finishMarkAsRead = resolve;
    }));
    mocks.notificationState = {
      ...mocks.notificationState,
      unreadCount: 1,
      notifications: [
        {
          id: "achievement_awarded__student-1__award-1",
          title: "Achievement unlocked",
          message: "A new achievement is ready.",
          read: false,
          actionUrl: "/student/profile#achievements",
        },
      ],
    };
    renderNotifications();

    fireEvent.click(screen.getByRole("button", { name: /unread: achievement unlocked/i }));
    await waitFor(() => expect(mocks.markAsRead).toHaveBeenCalledWith("achievement_awarded__student-1__award-1"));
    expect(screen.queryByText(/profile destination/i)).not.toBeInTheDocument();

    finishMarkAsRead?.();
    expect(await screen.findByText("Profile destination: /student/profile#achievements")).toBeVisible();
  });

  it("marks every loaded update as read", async () => {
    mocks.notificationState = {
      ...mocks.notificationState,
      unreadCount: 2,
      notifications: [
        { id: "one", title: "One", message: "First", read: false },
        { id: "two", title: "Two", message: "Second", read: false },
      ],
    };
    renderNotifications();

    fireEvent.click(screen.getByRole("button", { name: /mark all as read/i }));
    await waitFor(() => expect(mocks.markAllAsRead).toHaveBeenCalledOnce());
  });
});

describe("scorecard details", () => {
  afterEach(cleanup);

  it("renders all criteria and suppresses extended coaching in compact mode", () => {
    const scores: Record<ScorecardCategory, number> = {
      accuracy: 20,
      logicalValidity: 22,
      methodSelection: 21,
      explanationQuality: 23,
    };
    const criterion = (category: ScorecardCategory) => ({
      category,
      score: scores[category],
      evidence: [],
      reason: `${category} reason`,
      improvementAdvice: `${category} advice`,
      confidence: "high" as const,
      source: "deterministic" as const,
    });
    const scorecard: ScorecardResult = {
      total: 86,
      feedback: "Clear reasoning overall.",
      generatedAt: 1,
      criteria: {
        accuracy: criterion("accuracy"),
        logicalValidity: criterion("logicalValidity"),
        methodSelection: criterion("methodSelection"),
        explanationQuality: criterion("explanationQuality"),
      },
    };

    const view = render(<ScorecardDetails scorecard={scorecard} />);
    expect(screen.getByRole("region", { name: /critical thinking scorecard/i })).toBeVisible();
    expect(screen.getAllByText(/\/25$/)).toHaveLength(4);
    expect(screen.getByText("Improvement plan")).toBeVisible();

    view.unmount();
    render(<ScorecardDetails scorecard={scorecard} compact />);
    expect(screen.queryByText("Improvement plan")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Improve:/)).not.toBeInTheDocument();
  });
});
