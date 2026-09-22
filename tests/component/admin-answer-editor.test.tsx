import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerSpecificationEditor } from "@/app/components/AnswerSpecificationEditor";

function Editor() {
  const [value, setValue] = useState<Record<string, any>>();
  return <><AnswerSpecificationEditor value={value} onChange={setValue} /><output data-testid="answer">{JSON.stringify(value)}</output></>;
}
afterEach(cleanup);
describe("structured scoring answer editor", () => {
  it("requires an explicitly entered numeric answer and preserves zero", () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "number" } });
    expect(screen.getByLabelText("Numeric answer")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Numeric answer"), { target: { value: "0" } });
    expect(JSON.parse(screen.getByTestId("answer").textContent!)).toEqual({ kind: "number", value: 0 });
  });
  it("supports expression, boolean and numeric set values", () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "expression" } });
    fireEvent.change(screen.getByLabelText("Expected expression"), { target: { value: "x+1" } });
    expect(JSON.parse(screen.getByTestId("answer").textContent!)).toEqual({ kind: "expression", expression: "x+1" });
    fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "truth" } });
    fireEvent.change(screen.getByLabelText("Truth value"), { target: { value: "false" } });
    expect(JSON.parse(screen.getByTestId("answer").textContent!)).toEqual({ kind: "truth", value: false });
    fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "set" } });
    fireEvent.change(screen.getByLabelText(/Set members/), { target: { value: "1\n2" } });
    expect(JSON.parse(screen.getByTestId("answer").textContent!)).toEqual({ kind: "set", values: [1, 2] });
  });
  it("adds named scalar parts and prevents duplicate names", () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "parts" } });
    fireEvent.change(screen.getByLabelText("New part name"), { target: { value: "mean" } });
    fireEvent.click(screen.getByRole("button", { name: "Add part" }));
    fireEvent.change(screen.getByLabelText("Numeric answer"), { target: { value: "8" } });
    expect(JSON.parse(screen.getByTestId("answer").textContent!)).toEqual({ kind: "parts", parts: { mean: { kind: "number", value: 8 } } });
    fireEvent.change(screen.getByLabelText("New part name"), { target: { value: "mean" } });
    fireEvent.click(screen.getByRole("button", { name: "Add part" }));
    expect(screen.getByRole("alert")).toHaveTextContent("unique part name");
  });
});
