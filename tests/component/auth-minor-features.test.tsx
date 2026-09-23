import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { Login } from "@/app/components/auth/Login";
import { SignUp } from "@/app/components/auth/SignUp";
import { ProtectedRoute } from "@/app/components/ProtectedRoute";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
  clearError: vi.fn(),
  reloadProfile: vi.fn(),
  signOut: vi.fn(),
  state: {} as Record<string, unknown>,
}));

vi.mock("motion/react", () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => mocks.state,
  isAdminRole: (role: unknown) => role === "admin" || role === "teacher",
  getDashboardPath: (role: unknown) =>
    role === "admin" || role === "teacher" ? "/admin/dashboard" : role === "student" ? "/student/dashboard" : "/login",
}));

function renderAt(element: React.ReactNode, initialPath: string, destination = "/student/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={initialPath} element={element} />
        <Route path={destination} element={<p>Destination screen</p>} />
        <Route path="/login" element={initialPath === "/login" ? element : <p>Login destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("authentication supporting flows", () => {
  beforeEach(() => {
    for (const mock of [
      mocks.signIn,
      mocks.signUp,
      mocks.signInWithGoogle,
      mocks.resetPassword,
      mocks.clearError,
      mocks.reloadProfile,
      mocks.signOut,
    ]) {
      mock.mockReset();
    }
    mocks.state = {
      signIn: mocks.signIn,
      signUp: mocks.signUp,
      signInWithGoogle: mocks.signInWithGoogle,
      resetPassword: mocks.resetPassword,
      clearError: mocks.clearError,
      reloadProfile: mocks.reloadProfile,
      signOut: mocks.signOut,
      error: null,
      isLoading: false,
      firebaseUser: null,
      userProfile: null,
    };
  });

  afterEach(cleanup);

  it("signs in with trimmed credentials and routes by the returned role", async () => {
    mocks.signIn.mockResolvedValue({ role: "student" });
    renderAt(<Login />, "/login");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " student@example.com " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith("student@example.com", "secret123"));
    expect(await screen.findByText("Destination screen")).toBeVisible();
  });

  it("sends a privacy-preserving password recovery response", async () => {
    mocks.resetPassword.mockResolvedValue(undefined);
    renderAt(<Login />, "/login");

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " learner@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith("learner@example.com"));
    expect(screen.getByText(/if an account exists/i)).toBeVisible();
  });

  it("rejects mismatched signup passwords before calling Firebase", () => {
    renderAt(<SignUp />, "/signup");

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Test Learner" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "learner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "different123" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeVisible();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});

describe("protected route recovery and role enforcement", () => {
  beforeEach(() => {
    mocks.reloadProfile.mockReset();
    mocks.signOut.mockReset();
    mocks.reloadProfile.mockResolvedValue({ role: "student" });
    mocks.signOut.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  function renderGuard(requiredRole: "student" | "admin" = "student") {
    return render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route element={<ProtectedRoute requiredRole={requiredRole} />}>
            <Route path="/protected" element={<p>Protected content</p>} />
          </Route>
          <Route path="/login" element={<p>Login destination</p>} />
          <Route path="/student/dashboard" element={<p>Student dashboard</p>} />
          <Route path="/admin/dashboard" element={<p>Admin dashboard</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows loading and redirects a signed-out visitor", () => {
    mocks.state = { isLoading: true };
    const view = renderGuard();
    expect(screen.getByText("Loading...")).toBeVisible();

    view.unmount();
    mocks.state = { isLoading: false, firebaseUser: null };
    renderGuard();
    expect(screen.getByText("Login destination")).toBeVisible();
  });

  it("offers retry and sign-out when the authenticated profile is unavailable", () => {
    mocks.state = {
      isLoading: false,
      firebaseUser: { uid: "student-1" },
      userProfile: null,
      error: "Profile is temporarily unavailable.",
      reloadProfile: mocks.reloadProfile,
      signOut: mocks.signOut,
    };
    renderGuard();

    expect(screen.getByText("Profile is temporarily unavailable.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /retry profile/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mocks.reloadProfile).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("redirects cross-role users and accepts the legacy teacher administrator role", () => {
    mocks.state = {
      isLoading: false,
      firebaseUser: { uid: "admin-1" },
      userProfile: { role: "admin" },
    };
    const view = renderGuard("student");
    expect(screen.getByText("Admin dashboard")).toBeVisible();

    view.unmount();
    mocks.state = {
      isLoading: false,
      firebaseUser: { uid: "teacher-1" },
      userProfile: { role: "teacher" },
    };
    renderGuard("admin");
    expect(screen.getByText("Protected content")).toBeVisible();
  });
});
