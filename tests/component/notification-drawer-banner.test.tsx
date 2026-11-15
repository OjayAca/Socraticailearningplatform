import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationDrawer } from "@/app/components/NotificationDrawer";
import { NotificationErrorBanner } from "@/app/components/NotificationErrorBanner";

const mocks = vi.hoisted(() => ({
  notificationState: {
    notifications: [] as Array<Record<string, unknown>>,
    unreadCount: 0,
    isLoading: false,
    error: null as string | null,
    markAsRead: vi.fn<(id: string) => Promise<void>>(),
    markAllAsRead: vi.fn<() => Promise<void>>(),
    retryNotifications: vi.fn<() => void>(),
    clearError: vi.fn<() => void>(),
  },
  userProfile: { role: "student" } as { role: string } | null,
}));

vi.mock("@/stores/notification-store", async () => {
  const actual = await vi.importActual<typeof import("@/stores/notification-store")>(
    "@/stores/notification-store",
  );
  return {
    ...actual,
    useNotificationStore: () => mocks.notificationState,
  };
});

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { userProfile: typeof mocks.userProfile }) => unknown) =>
    selector({ userProfile: mocks.userProfile }),
}));

afterEach(cleanup);

beforeEach(() => {
  mocks.userProfile = { role: "student" };
  mocks.notificationState = {
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
    retryNotifications: vi.fn(),
    clearError: vi.fn(),
  };
});

describe("NotificationErrorBanner", () => {
  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <NotificationErrorBanner />
      </MemoryRouter>,
    );
  }

  it("shows a persistent error banner with Retry and Dismiss on app routes", () => {
    mocks.notificationState.error = "Notifications could not be loaded.";
    renderAt("/student/dashboard");

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Notifications could not be loaded.");

    fireEvent.click(within(banner).getByRole("button", { name: "Retry" }));
    expect(mocks.notificationState.retryNotifications).toHaveBeenCalledOnce();

    fireEvent.click(within(banner).getByRole("button", { name: "Dismiss banner" }));
    expect(mocks.notificationState.clearError).toHaveBeenCalledOnce();
  });

  it("suppresses the global banner on dedicated notifications routes to avoid stacking alerts", () => {
    mocks.notificationState.error = "Notifications could not be loaded.";

    const studentView = renderAt("/student/notifications");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    studentView.unmount();

    renderAt("/admin/notifications");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("NotificationDrawer", () => {
  function renderDrawer(initialPath = "/student/dashboard") {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/student/dashboard"
            element={<NotificationDrawer notificationsHref="/student/notifications" />}
          />
          <Route path="/student/profile" element={<p>Profile destination</p>} />
          <Route path="/student/notifications" element={<p>All notifications page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("displays an unread badge, marks items read on click, and navigates", async () => {
    mocks.notificationState.unreadCount = 2;
    mocks.notificationState.notifications = [
      {
        id: "n-1",
        title: "Session reviewed",
        message: "Your instructor left feedback.",
        read: false,
        actionUrl: "/student/profile#achievements",
      },
      {
        id: "n-2",
        title: "Welcome",
        message: "Account ready.",
        read: true,
      },
    ];

    renderDrawer();

    const trigger = screen.getByRole("button", { name: "Open notifications (2 unread)" });
    expect(trigger).toHaveTextContent("2");
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(dialog).getByText("2 unread updates")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Unread: Session reviewed" }));
    await waitFor(() => expect(mocks.notificationState.markAsRead).toHaveBeenCalledWith("n-1"));
    expect(await screen.findByText("Profile destination")).toBeVisible();
  });

  it("supports marking all as read and retrying errors inside the drawer", async () => {
    mocks.notificationState.unreadCount = 1;
    mocks.notificationState.error = "Temporary connection issue.";
    mocks.notificationState.notifications = [
      { id: "n-1", title: "Update", message: "Check details", read: false },
    ];

    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Open notifications (1 unread)" }));
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(mocks.notificationState.retryNotifications).toHaveBeenCalledOnce();

    fireEvent.click(within(dialog).getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(mocks.notificationState.markAllAsRead).toHaveBeenCalledOnce());

    fireEvent.click(within(dialog).getByRole("link", { name: "View all notifications" }));
    expect(await screen.findByText("All notifications page")).toBeVisible();
  });
});
