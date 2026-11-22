import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MathInput } from "@/app/components/MathInput";

vi.mock("mathlive", () => ({}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("equation-only input", () => {
  it("edits equations without duplicating the chat text field", () => {
    const onChange = vi.fn();
    render(<MathInput notationOnly value={{ plainText: "My reasoning", latex: "x^2" }} onChange={onChange} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const field = screen.getByLabelText("Mathematical expression editor") as HTMLElement & { value: string };
    field.value = "x^3";
    fireEvent.input(field);
    expect(onChange).toHaveBeenCalledWith({ plainText: "My reasoning", latex: "x^3" });
  });

  it("locks the custom equation field and symbol buttons while sending", () => {
    render(<MathInput notationOnly disabled value={{ plainText: "", latex: "" }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Mathematical expression editor")).toHaveProperty("readOnly", true);
    expect(screen.getByRole("button", { name: "Insert Fraction" })).toBeDisabled();
  });

  it("collapses optional notation by default and expands on toggle or [math] insertion", () => {
    const onChange = vi.fn();
    render(
      <MathInput
        value={{ plainText: "Given f(x) =", latex: "" }}
        onChange={onChange}
        notationHint="Place [math] once in your problem."
      />
    );
    const toggle = screen.getByRole("button", { name: /Mathematical notation \(optional\)/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "+ Insert [math] in problem" }));
    expect(onChange).toHaveBeenCalledWith({ plainText: "Given f(x) = [math]", latex: "" });
  });

  it("disables MathLive audio loading to prevent 404 requests for missing sound files", () => {
    const mathfieldCtor = { soundsDirectory: "sounds" as string | null };
    vi.stubGlobal("MathfieldElement", mathfieldCtor);
    render(<MathInput notationOnly value={{ plainText: "", latex: "" }} onChange={vi.fn()} />);
    expect(mathfieldCtor.soundsDirectory).toBeNull();
  });
});
