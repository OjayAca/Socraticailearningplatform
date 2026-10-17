import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "@/app/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/app/components/ui/sheet";

// jsdom does not implement the browser observer used to position tooltips.
beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("icon tooltips", () => {
  it("shows a keyboard label, dismisses on Escape, and preserves the button action", async () => {
    const onClick = vi.fn();
    render(<Tooltip label="Send message"><button aria-label="Send message" onClick={onClick}><svg /></button></Tooltip>);
    const button = screen.getByRole("button", { name: "Send message" });
    fireEvent.focus(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Send message");
    expect(button).toHaveAccessibleDescription("Send message");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.blur(button);
    fireEvent.pointerMove(button, { pointerType: "mouse" });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Send message");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("preserves navigation drawer trigger and close controls", async () => {
    render(<Sheet>
      <Tooltip label="Open navigation"><SheetTrigger asChild><button aria-label="Open navigation"><svg /></button></SheetTrigger></Tooltip>
      <SheetContent><SheetTitle>Navigation</SheetTitle><SheetDescription>Choose a page</SheetDescription></SheetContent>
    </Sheet>);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.focus(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Open navigation");
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
