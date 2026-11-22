import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormattedMathText } from "@/app/components/MathText";
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

  it("avoids inline scrollbars on tall symbols while preserving horizontal scroll for display equations", () => {
    const bubble = render(
      <TutorMessageBubble role="assistant" text={"Inline \\(\\mathbb{Z}\\) and block $$\\frac{1}{2}$$"} />,
    );
    const bubbleKatex = Array.from(bubble.container.querySelectorAll(".katex"));
    expect(bubbleKatex).toHaveLength(2);
    expect(bubbleKatex[0].parentElement).toHaveClass("inline", "align-baseline");
    expect(bubbleKatex[0].parentElement).not.toHaveClass("overflow-x-auto");
    expect(bubbleKatex[1].closest("span.block")).toHaveClass("block", "overflow-x-auto");
    bubble.unmount();

    const formatted = render(
      <FormattedMathText text={"Inline \\(\\mathbb{Z}\\) and block $$\\frac{1}{2}$$"} />,
    );
    const formattedKatex = Array.from(formatted.container.querySelectorAll(".katex"));
    expect(formattedKatex).toHaveLength(2);
    expect(formattedKatex[0].parentElement).toHaveClass("inline", "align-baseline");
    expect(formattedKatex[0].parentElement).not.toHaveClass("overflow-x-auto");

    const displayWrapper = formattedKatex[1].closest(".katex-display")?.parentElement;
    expect(displayWrapper).toHaveClass("block", "overflow-x-auto", "overflow-y-hidden");
  });
});
