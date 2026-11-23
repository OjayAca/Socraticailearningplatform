import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Activity } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  ADMIN_SIDEBAR_COLLAPSED_KEY,
  AdminShell,
  type AdminActiveNav,
} from "@/app/components/admin/AdminShell";
import {
  AdminPagination,
  AdminSearchInput,
  AdminTabs,
  JsonTable,
  LogPanel,
  PageTitle,
  Stat,
  errorMessage,
  formatTimestamp,
  paginateSlice,
  searchableUser,
  statusBadgeClass,
} from "@/app/components/admin/admin-shared";

const mocks = vi.hoisted(() => ({
  resolvedTheme: "dark" as "light" | "dark",
  setTheme: vi.fn(),
  signOut: vi.fn<() => Promise<void>>(),
  userProfile: {
    uid: "admin-1",
    displayName: "Ada Lovelace",
    email: "ada@mindguide.edu",
    role: "admin",
  } as { uid: string; displayName: string; email: string; role: string } | null,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: mocks.resolvedTheme,
    setTheme: mocks.setTheme,
  }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      signOut: mocks.signOut,
      userProfile: mocks.userProfile,
      firebaseUser: mocks.userProfile ? { uid: mocks.userProfile.uid } : null,
    }),
}));

function renderAdminShell(active: AdminActiveNav = "dashboard") {
  return render(
    <MemoryRouter initialEntries={["/admin/dashboard"]}>
      <Routes>
        <Route
          path="/admin/dashboard"
          element={
            <AdminShell active={active}>
              <p>Admin workspace body</p>
            </AdminShell>
          }
        />
        <Route path="/login" element={<p>Login screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminShell", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  beforeEach(() => {
    window.localStorage.clear();
    mocks.resolvedTheme = "dark";
    mocks.setTheme.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue();
    mocks.userProfile = {
      uid: "admin-1",
      displayName: "Ada Lovelace",
      email: "ada@mindguide.edu",
      role: "admin",
    };
  });

  it("renders MINDGUIDE [ADMIN] brand, grouped sidebar sections, and excludes Notifications from sidebar", () => {
    renderAdminShell("dashboard");

    const sidebar = screen.getByRole("complementary", { name: "Administrator sidebar" });
    expect(within(sidebar).getByText("MINDGUIDE")).toBeVisible();
    expect(within(sidebar).getByText("ADMIN")).toBeVisible();

    for (const section of [
      "OVERVIEW",
      "LEARNING MANAGEMENT",
      "SYSTEM MANAGEMENT",
      "BOTTOM NAVIGATION",
    ]) {
      expect(within(sidebar).getByText(section)).toBeVisible();
    }

    const expectedLinks: Array<[string, string]> = [
      ["Dashboard", "/admin/dashboard"],
      ["User Accounts", "/admin/users"],
      ["Learner Progress", "/admin/progress"],
      ["Content Library", "/admin/content/problems"],
      ["Reports", "/admin/reports"],
      ["Activity & AI Logs", "/admin/logs"],
      ["Cohort & Access", "/admin/maintenance"],
      ["Settings", "/admin/settings"],
      ["My Profile", "/admin/profile"],
    ];

    for (const [label, href] of expectedLinks) {
      expect(within(sidebar).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }

    expect(within(sidebar).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(sidebar).queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open notifications" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "Sign Out" })).toBeVisible();
  });

  it("marks active navigation items with aria-current=page", () => {
    renderAdminShell("content");

    const sidebar = screen.getByRole("complementary", { name: "Administrator sidebar" });
    expect(within(sidebar).getByRole("link", { name: "Content Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(sidebar).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("collapses and expands the desktop sidebar and persists state in localStorage", () => {
    const first = renderAdminShell("dashboard");
    const sidebar = screen.getByRole("complementary", { name: "Administrator sidebar" });
    expect(sidebar).toHaveClass("w-64");

    const collapseButton = screen.getByRole("button", { name: "Collapse administrator sidebar" });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseButton);

    expect(sidebar).toHaveClass("w-20");
    expect(window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY)).toBe("true");
    expect(
      screen.getByRole("button", { name: "Expand administrator sidebar" }),
    ).toHaveAttribute("aria-expanded", "false");

    first.unmount();

    renderAdminShell("dashboard");
    expect(screen.getByRole("complementary", { name: "Administrator sidebar" })).toHaveClass(
      "w-20",
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand administrator sidebar" }));
    expect(window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY)).toBe("false");
  });

  it("opens the responsive mobile navigation Sheet drawer", () => {
    renderAdminShell("users");

    fireEvent.click(screen.getByRole("button", { name: "Open administrator navigation" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Administrator navigation")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "User Accounts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(dialog).getByRole("link", { name: "Cohort & Access" })).toHaveAttribute(
      "href",
      "/admin/maintenance",
    );
  });

  it("handles theme switching, sign out, and sign out error banners", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("Network offline"));
    renderAdminShell("dashboard");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(mocks.setTheme).toHaveBeenCalledWith("light");

    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network offline");

    mocks.signOut.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Login screen")).toBeVisible();
  });
});

describe("admin-shared helpers", () => {
  afterEach(cleanup);

  it("renders PageTitle, Stat, JsonTable, LogPanel, AdminSearchInput, AdminTabs, and AdminPagination", () => {
    const onSearch = vi.fn();
    const onTab = vi.fn();
    const onPage = vi.fn();

    render(
      <MemoryRouter>
        <PageTitle title="Analytics" description="Overview metrics" />
        <Stat label="User accounts" value={42} />
        <AdminSearchInput
          value="ada"
          onChange={onSearch}
          placeholder="Search learners"
          ariaLabel="Search learners"
        />
        <AdminTabs
          activeId="all"
          onSelect={onTab}
          items={[
            { id: "all", label: "All" },
            { id: "active", label: "Active" },
          ]}
        />
        <JsonTable rows={[{ learner: "Ada", score: 95 }]} />
        <LogPanel
          title="Audit events"
          icon={<Activity className="h-4 w-4" />}
          rows={[{ id: "log-1", action: "user_activated", target: "student-1" }]}
        />
        <AdminPagination page={2} pageSize={10} totalItems={25} onPageChange={onPage} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Analytics" })).toBeVisible();
    expect(screen.getByText("42")).toBeVisible();
    expect(screen.getByText("Ada")).toBeVisible();
    expect(screen.getByText("user_activated")).toBeVisible();
    expect(screen.getByText("Page 2 of 3")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onSearch).toHaveBeenCalledWith("");

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(onTab).toHaveBeenCalledWith("active");

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it("provides pure utility helpers for timestamps, status badges, search indexing, pagination, and errors", () => {
    expect(statusBadgeClass("active")).toContain("emerald");
    expect(statusBadgeClass("submitted")).toContain("amber");
    expect(statusBadgeClass("rejected")).toContain("rose");
    expect(statusBadgeClass("unknown")).toContain("slate");

    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp(1_700_000_000_000)).not.toBe("—");
    expect(formatTimestamp({ toDate: () => new Date(1_700_000_000_000) })).not.toBe("—");

    expect(errorMessage(new Error("Boom"), "Fallback")).toBe("Boom");
    expect(errorMessage("raw", "Fallback")).toBe("Fallback");

    expect(
      searchableUser({
        displayName: "Grace Hopper",
        email: "grace@example.com",
        role: "student",
        status: "active",
        academicProfile: { course: "BSCS", yearLevel: "3", section: "A" },
      }),
    ).toContain("bscs");

    const slice = paginateSlice([1, 2, 3, 4, 5], 2, 2);
    expect(slice).toEqual({
      items: [3, 4],
      page: 2,
      totalPages: 3,
      totalItems: 5,
      startIndex: 3,
      endIndex: 4,
    });
  });

  it("renders nowrap table headers in JsonTable and prevents duplicate in-flight Sign Out clicks", async () => {
    let resolveSignOut!: () => void;
    mocks.signOut.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );

    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <AdminShell active="dashboard">
                <JsonTable rows={[{ studentName: "Ada", averageScore: 95 }]} />
              </AdminShell>
            }
          />
          <Route path="/login" element={<p>Login screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("columnheader", { name: /studentName/i })).toHaveClass("whitespace-nowrap");

    const sidebar = screen.getByRole("complementary", { name: "Administrator sidebar" });
    const signOutBtn = within(sidebar).getByRole("button", { name: "Sign Out" });
    fireEvent.click(signOutBtn);
    fireEvent.click(signOutBtn);
    expect(signOutBtn).toBeDisabled();
    expect(mocks.signOut).toHaveBeenCalledOnce();

    resolveSignOut();
    expect(await screen.findByText("Login screen")).toBeVisible();
  });
});
