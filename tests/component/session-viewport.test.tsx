import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionViewport } from "@/app/components/SessionViewport";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SessionViewport", () => {
  it("follows keyboard resize and pan, preserves pinch zoom, and removes listeners", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    const remove = vi.spyOn(viewport, "removeEventListener");
    vi.stubGlobal("visualViewport", viewport);
    const { container, unmount } = render(<SessionViewport><textarea aria-label="Response" /></SessionViewport>);
    const workspace = container.firstElementChild as HTMLElement;
    expect(workspace.style.getPropertyValue("--session-height")).toBe("844px");
    act(() => { viewport.height = 390; viewport.dispatchEvent(new Event("resize")); });
    expect(workspace.style.getPropertyValue("--session-height")).toBe("390px");
    expect(workspace.dataset.compact).toBe("true");
    act(() => { viewport.offsetTop = 42; viewport.dispatchEvent(new Event("scroll")); });
    expect(workspace.style.getPropertyValue("--session-top")).toBe("42px");
    act(() => { viewport.scale = 2; viewport.height = 195; viewport.dispatchEvent(new Event("resize")); });
    expect(workspace.style.getPropertyValue("--session-height")).toBe("390px");
    act(() => { viewport.scale = 1; viewport.height = 844; viewport.offsetTop = 0; viewport.dispatchEvent(new Event("resize")); });
    expect(workspace.style.getPropertyValue("--session-height")).toBe("844px");
    expect(workspace.dataset.compact).toBe("false");
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("leaves viewport sizing to CSS when VisualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("mathVirtualKeyboard", undefined);
    const { container } = render(<SessionViewport>Conversation</SessionViewport>);
    expect(container.firstElementChild).not.toHaveAttribute("style");
  });

  it("reserves space for the equation keyboard without counting native keyboard space twice", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    const keyboard = Object.assign(new EventTarget(), { boundingRect: { top: 844, height: 0 } });
    const remove = vi.spyOn(keyboard, "removeEventListener");
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("mathVirtualKeyboard", keyboard);
    const { container, unmount } = render(<SessionViewport>Conversation</SessionViewport>);
    const workspace = container.firstElementChild as HTMLElement;
    act(() => { keyboard.boundingRect = { top: 544, height: 300 }; keyboard.dispatchEvent(new Event("geometrychange")); });
    expect(workspace.style.getPropertyValue("--session-height")).toBe("544px");
    act(() => { viewport.height = 390; viewport.dispatchEvent(new Event("resize")); });
    expect(workspace.style.getPropertyValue("--session-height")).toBe("390px");
    act(() => { keyboard.boundingRect = { top: 844, height: 0 }; keyboard.dispatchEvent(new Event("geometrychange")); });
    expect(workspace.style.getPropertyValue("--session-height")).toBe("390px");
    unmount();
    expect(remove).toHaveBeenCalledWith("geometrychange", expect.any(Function));
  });
});
