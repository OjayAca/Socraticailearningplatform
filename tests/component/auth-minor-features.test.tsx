import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { Login } from "@/app/components/auth/Login";
import { SignUp } from "@/app/components/auth/SignUp";
import { VerifyEmail } from "@/app/components/auth/VerifyEmail";
import { ProtectedRoute } from "@/app/components/ProtectedRoute";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
  sendVerification: vi.fn(),
  refreshVerification: vi.fn(),
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
        <Route path="/verify-email" element={initialPath === "/verify-email" ? element : <p>Verify email destination</p>} />
        <Route path="/login" element={initialPath === "/login" ? element : <p>Login destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("authentication supporting flows", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const mock of [
      mocks.signIn,
      mocks.signUp,
      mocks.signInWithGoogle,
      mocks.resetPassword,
      mocks.sendVerification,
      mocks.refreshVerification,
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
      sendVerification: mocks.sendVerification,
      refreshVerification: mocks.refreshVerification,
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

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith("student@example.com", "secret123", false));
    expect(await screen.findByText("Destination screen")).toBeVisible();
  });

  it("toggles password visibility on login and sign-up screens", () => {
    const loginView = renderAt(<Login />, "/login");
    const loginPasswordInput = screen.getByLabelText("Password");
    expect(loginPasswordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(loginPasswordInput).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(loginPasswordInput).toHaveAttribute("type", "password");

    loginView.unmount();
    renderAt(<SignUp />, "/signup");
    const signupPasswordInput = screen.getByLabelText("Password");
    const confirmPasswordInput = screen.getByLabelText("Confirm Password");
    expect(signupPasswordInput).toHaveAttribute("type", "password");
    expect(confirmPasswordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(signupPasswordInput).toHaveAttribute("type", "text");
    expect(confirmPasswordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show confirm password" }));
    expect(confirmPasswordInput).toHaveAttribute("type", "text");
  });

  it("persists and restores remembered email when Remember me is checked", async () => {
    mocks.signIn.mockResolvedValue({ role: "student" });
    const firstView = renderAt(<Login />, "/login");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " remembered@example.com " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByLabelText("Remember me"));
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith("remembered@example.com", "secret123", true));
    expect(localStorage.getItem("mindguide.rememberedEmail")).toBe("remembered@example.com");

    firstView.unmount();
    renderAt(<Login />, "/login");
    expect(screen.getByLabelText("Email")).toHaveValue("remembered@example.com");
    expect(screen.getByLabelText("Remember me")).toBeChecked();
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

  it("routes unverified email/password sign-ups and logins to the email verification gate", async () => {
    mocks.signUp.mockResolvedValue({ role: "student", emailVerified: false });
    const signupView = renderAt(<SignUp />, "/signup");

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "New Learner" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledWith("New Learner", "new@example.com", "secret123"));
    expect(await screen.findByText("Verify email destination")).toBeVisible();

    signupView.unmount();
    mocks.signIn.mockResolvedValue({ role: "student", emailVerified: false });
    renderAt(<Login />, "/login");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByText("Verify email destination")).toBeVisible();
  });

  it("handles resending verification, checking status, and advancing once verified", async () => {
    mocks.sendVerification.mockResolvedValue(undefined);
    mocks.refreshVerification
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mocks.state = {
      ...mocks.state,
      firebaseUser: { uid: "student-1", email: "student@example.com", emailVerified: false },
      userProfile: { uid: "student-1", email: "student@example.com", role: "student", emailVerified: false },
    };

    renderAt(<VerifyEmail />, "/verify-email");
    expect(screen.getByText("student@example.com")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    expect(await screen.findByText(/verification email sent/i)).toBeVisible();
    expect(mocks.sendVerification).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /i've verified my email/i }));
    expect(await screen.findByText(/your email is still unverified/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /i've verified my email/i }));
    expect(await screen.findByText("Destination screen")).toBeVisible();
  });

  it("shows Back to home navigation and inline field validation on Login without pre-disabling submit", () => {
    renderAt(<Login />, "/login");

    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/");
    const submit = screen.getByRole("button", { name: /^log in$/i });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Please enter your email address.")).toBeVisible();
    expect(screen.getByText("Please enter your password.")).toBeVisible();
    expect(mocks.signIn).not.toHaveBeenCalled();

    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    fireEvent.blur(emailInput);
    expect(screen.getByText("Please enter a valid email address with an @ symbol.")).toBeVisible();
  });

  it("shows Back to home link and inline accessible validation on SignUp", () => {
    renderAt(<SignUp />, "/signup");

    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/");
    const submit = screen.getByRole("button", { name: /^sign up$/i });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);

    expect(screen.getByLabelText("Full Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Confirm Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Please enter your full name.")).toBeVisible();
    expect(screen.getByText("Please create a password.")).toBeVisible();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("keeps high-contrast light-surface alert colors on SignUp even under dark mode", () => {
    renderAt(<SignUp />, "/signup");
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    const summaryAlert = screen
      .getByText("Please review and fix the highlighted fields below.")
      .closest('[data-slot="alert"]');
    expect(summaryAlert).not.toBeNull();
    expect(summaryAlert).toHaveClass("bg-red-50", "text-red-800", "dark:bg-red-50", "dark:text-red-800");
    expect(summaryAlert).not.toHaveClass("dark:bg-red-950/40", "dark:text-red-300");
  });

  it("disables Login submit only while an authentication request is in flight", () => {
    mocks.state = {
      ...mocks.state,
      isLoading: true,
    };
    renderAt(<Login />, "/login");

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
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
          <Route path="/verify-email" element={<p>Verify email destination</p>} />
          <Route path="/student/dashboard" element={<p>Student dashboard</p>} />
          <Route path="/admin/dashboard" element={<p>Admin dashboard</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("redirects an unverified student account to /verify-email", () => {
    mocks.state = {
      isLoading: false,
      firebaseUser: { uid: "student-unverified", emailVerified: false },
      userProfile: { role: "student", emailVerified: false },
    };
    renderGuard("student");
    expect(screen.getByText("Verify email destination")).toBeVisible();
  });

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
