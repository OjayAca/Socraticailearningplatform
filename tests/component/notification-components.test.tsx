import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert } from "@/app/components/ui/alert";
import { Banner } from "@/app/components/ui/banner";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { OfflineBanner } from "@/app/components/OfflineBanner";

afterEach(cleanup);

describe("Alert", () => {
  it.each([
    ["error", "alert"],
    ["warning", "alert"],
    ["info", "status"],
    ["success", "status"],
  ] as const)("announces %s alerts with role=%s", (tone, role) => {
    render(<Alert tone={tone} title="Heading">Body text</Alert>);
    const alert = screen.getByRole(role);
    expect(alert).toHaveTextContent("Heading");
    expect(alert).toHaveTextContent("Body text");
    expect(alert).toHaveAttribute("data-tone", tone);
  });

  it("renders an action and a dismiss control", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Alert tone="error" onDismiss={onDismiss} action={<button type="button" onClick={onRetry}>Retry</button>}>
        Something failed
      </Alert>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("Banner", () => {
  it("is persistent unless a dismiss handler is supplied", () => {
    const { rerender } = render(<Banner tone="warning">Service degraded</Banner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Service degraded");
    expect(screen.queryByRole("button", { name: "Dismiss banner" })).not.toBeInTheDocument();

    const onDismiss = vi.fn();
    rerender(<Banner tone="info" onDismiss={onDismiss}>Maintenance tonight</Banner>);
    expect(screen.getByRole("status")).toHaveTextContent("Maintenance tonight");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss banner" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("OfflineBanner", () => {
  it("appears while offline and disappears when connectivity returns", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    onLine.mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByRole("alert")).toHaveTextContent("You are offline");

    onLine.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  function renderDialog(overrides: { isLoading?: boolean } = {}) {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    const onConfirm = vi.fn<() => void>();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="Delete item?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={overrides.isLoading}
      />,
    );
    return { onOpenChange, onConfirm };
  }

  it("is an accessible, labelled alert dialog that confirms", () => {
    const props = renderDialog();
    const dialog = screen.getByRole("alertdialog", { name: "Delete item?" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(props.onConfirm).toHaveBeenCalledOnce();
  });

  it("closes on Cancel and Escape", async () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);

    props.onOpenChange.mockClear();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
  });

  it("locks both actions while the confirmed action is running", () => {
    const props = renderDialog({ isLoading: true });
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});
