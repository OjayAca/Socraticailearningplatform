import { useEffect, useRef, type ReactNode } from "react";

/** Keep the learning workspace within the keyboard's visible viewport. */
export function SessionViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const keyboard = window.mathVirtualKeyboard;
    if (!viewport && !keyboard) return;
    const resize = () => {
      // Let the browser handle pinch zoom without resizing the learning UI.
      if (viewport && viewport.scale !== 1) return;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const keyboardBounds = keyboard?.boundingRect;
      // MathLive's keyboard overlays the page instead of resizing VisualViewport.
      const visibleBottom = keyboardBounds && keyboardBounds.height > 0
        ? Math.min(bottom, keyboardBounds.top) : bottom;
      const height = Math.max(0, visibleBottom - top);
      ref.current?.style.setProperty("--session-height", `${height}px`);
      ref.current?.style.setProperty("--session-top", `${top}px`);
      if (ref.current) ref.current.dataset.compact = String(height < 480);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    keyboard?.addEventListener("geometrychange", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      keyboard?.removeEventListener("geometrychange", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <div ref={ref} className="session-viewport flex min-h-0 min-w-0 flex-none flex-col overflow-hidden bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">{children}</div>;
}
