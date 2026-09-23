import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TutorMessageBubble } from "@/app/components/TutorMessageBubble";

afterEach(cleanup);

describe("tutor message content", () => {
  it("renders inline, display, and saved equation-editor notation", () => {
    const { container } = render(<TutorMessageBubble role="assistant" text={"Consider \\(x^2\\).\n$$\\frac{1}{2}$$\n\\sqrt{4}"} />);
    expect(screen.getByRole("article", { name: "AI tutor" })).toBeVisible();
    expect(container.querySelectorAll(".katex")).toHaveLength(3);
    expect(container).toHaveTextContent("Consider");
  });

  it("keeps malformed notation readable and renders markup as plain text", () => {
    const { container } = render(<TutorMessageBubble role="student" text={'<img src=x onerror=alert(1)> $\\notACommand{2}$'} />);
    expect(screen.getByRole("article", { name: "You" })).toHaveTextContent("\\notACommand{2}");
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});
