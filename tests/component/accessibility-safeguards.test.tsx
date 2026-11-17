import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MathInput } from "@/app/components/MathInput";
import { Alert } from "@/app/components/ui/alert";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";

describe("Phase 5 accessibility and usability safeguards", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders ConfirmDialog with reduced-motion classes, 44px controls, Escape cancellation, and loading lock", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    const view = render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        variant="destructive"
        title="Confirm destructive change"
        description="This action requires explicit confirmation."
        confirmLabel="Confirm delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
      />,
    );

    const dialog = await screen.findByRole("alertdialog", { name: "Confirm destructive change" });
    expect(dialog).toHaveClass("motion-reduce:animate-none");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Confirm delete" })).toHaveClass("min-h-11");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();

    onOpenChange.mockReset();
    view.rerender(
      <ConfirmDialog
        open
        isLoading
        onOpenChange={onOpenChange}
        variant="destructive"
        title="Confirm destructive change"
        description="This action requires explicit confirmation."
        confirmLabel="Confirm delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm delete" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("exposes semantic live roles and 44px dismiss buttons on Alert banners", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Alert tone="error" onDismiss={onDismiss}>
        Unable to save. Try again.
      </Alert>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save. Try again.");
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(dismiss).toHaveClass("h-11", "w-11");
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledOnce();

    rerender(<Alert tone="success">Saved to your account.</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Saved to your account.");
  });

  it("associates inline KaTeX syntax errors with aria-invalid and aria-describedby in MathInput", async () => {
    const onSyntaxError = vi.fn();
    render(
      <MathInput
        notationOnly
        value={{ plainText: "", latex: "\\invalidcommand{" }}
        onChange={vi.fn()}
        onSyntaxError={onSyntaxError}
      />,
    );

    await waitFor(() =>
      expect(onSyntaxError).toHaveBeenCalledWith(
        "Check the mathematical notation before submitting.",
      ),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Check the mathematical notation before submitting.");
    const mathField = screen.getByLabelText("Mathematical expression editor");
    expect(mathField).toHaveAttribute("aria-invalid", "true");
    expect(mathField).toHaveAttribute("aria-describedby", alert.id);
  });
});
