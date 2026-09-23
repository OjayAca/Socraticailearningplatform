import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { SecureAdminReportPrint } from "@/app/components/SecureAdmin";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ signOut: vi.fn() }) }));

describe("protected P1 report print view", () => {
  afterEach(cleanup);
  it("renders audited print rows and pseudonymization status", () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/admin/reports/print", state: { report: { output: "print", kind: "learning_progress", rows: [{ learner: "Learner-abcd", sessionsCompleted: 4 }], generatedAt: 1, pseudonymized: true } } }]}><Routes><Route path="/admin/reports/print" element={<SecureAdminReportPrint />} /></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /learning progress report/i })).toBeVisible();
    expect(screen.getByText(/pseudonymized/i)).toBeVisible();
    expect(screen.getByText("Learner-abcd")).toBeVisible();
    expect(screen.getByRole("button", { name: /print \/ save as pdf/i })).toBeVisible();
  });
});
