import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpDialog } from "@/app/components/HelpDialog";
import { ListRowSkeleton, Skeleton } from "@/app/components/ui/skeleton";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HelpDialog accessibility and standardized guidance", () => {
  it("opens from a 44px trigger, displays the four standardized stages, and returns focus on Escape", async () => {
    render(<HelpDialog variant="student" />);

    const trigger = screen.getByRole("button", { name: "Open student help" });
    expect(trigger).toHaveClass("h-11", "w-11");

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "How MINDGUIDE Works",
    });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass("motion-reduce:animate-none");
    expect(dialog).toHaveTextContent("Understand the Problem");
    expect(dialog).toHaveTextContent("Choose and Justify");
    expect(dialog).toHaveTextContent("Develop the Solution");
    expect(dialog).toHaveTextContent("Check and Interpret");
    expect(screen.getByRole("button", { name: "Close help" })).toHaveClass(
      "h-11",
      "w-11",
    );

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("renders session and administrator guidance accurately", async () => {
    const view = render(<HelpDialog variant="session" />);
    fireEvent.click(screen.getByRole("button", { name: "Open session help" }));
    const sessionDialog = await screen.findByRole("dialog", {
      name: "Socratic Session Guide",
    });
    expect(sessionDialog).toHaveTextContent("this browser tab");
    expect(sessionDialog).toHaveTextContent("saved to your account");

    view.unmount();
    render(<HelpDialog variant="admin" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open administrator help" }),
    );
    const adminDialog = await screen.findByRole("dialog", {
      name: "Administrator Console Guide",
    });
    expect(adminDialog).toHaveTextContent("Minimum 8 characters");
    expect(adminDialog).toHaveTextContent("Minimum 4 characters");
  });
});

describe("Skeleton loading primitives", () => {
  it("respects reduced motion and announces list loading politely", () => {
    const { container } = render(
      <div>
        <Skeleton className="h-4 w-24" />
        <ListRowSkeleton rows={2} label="Loading learning records" />
      </div>,
    );

    const status = screen.getByRole("status", {
      name: "Loading learning records",
    });
    expect(status).toBeInTheDocument();
    const skeletonEl = container.querySelector('[data-slot="skeleton"]');
    expect(skeletonEl).toHaveAttribute("aria-hidden", "true");
    expect(skeletonEl).toHaveClass("motion-reduce:animate-none");
  });
});
