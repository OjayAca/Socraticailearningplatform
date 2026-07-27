import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { StudentShell } from "@/app/components/StudentShell";

const mocks = vi.hoisted(() => ({
  resolvedTheme: "dark" as "light" | "dark",
  setTheme: vi.fn(),
  signOut: vi.fn<() => Promise<void>>(),
  userProfile: {
    displayName: "Ojay Acabal",
    email: "ojay@example.com",
  } as { displayName: string; email: string } | null,
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
    }),
}));

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/student/dashboard"]}>
      <Routes>
        <Route
          path="/student/dashboard"
          element={
            <StudentShell active="dashboard">
              <p>Dashboard content</p>
            </StudentShell>
          }
        />
        <Route path="/login" element={<p>Login screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudentShell", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.resolvedTheme = "dark";
    mocks.setTheme.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue();
    mocks.userProfile = {
      displayName: "Ojay Acabal",
      email: "ojay@example.com",
    };
  });

  it("renders the student identity and preserves all navigation destinations", () => {
    renderShell();

    expect(screen.getByRole("heading", { name: /welcome, ojay acabal/i })).toBeVisible();
    expect(screen.getByText("ojay@example.com")).toBeVisible();
    expect(screen.getByText("OA")).toBeVisible();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    for (const name of ["Dashboard", "New session", "History", "Notifications", "Profile", "Settings"]) {
      expect(screen.getByRole("link", { name })).toBeVisible();
    }
  });

  it("switches from the resolved dark theme to light", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));

    expect(mocks.setTheme).toHaveBeenCalledWith("light");
  });

  it("uses a safe identity fallback and can switch a light theme to dark", () => {
    mocks.userProfile = null;
    mocks.resolvedTheme = "light";
    renderShell();

    expect(screen.getByRole("heading", { name: /welcome, student/i })).toBeVisible();
    expect(screen.getByText("S")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(mocks.setTheme).toHaveBeenCalledWith("dark");
  });

  it("opens the accessible mobile navigation sheet", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Open student navigation" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "History" })).toBeVisible();
    expect(within(dialog).getByText("Student navigation")).toBeInTheDocument();
  });

  it("signs out and returns to login", async () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(await screen.findByText("Login screen")).toBeVisible();
  });
});
