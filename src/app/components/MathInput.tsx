import { useEffect, useMemo, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "mathlive";
import type { MathResponse } from "@mindguide/contracts";

type MathFieldElement = HTMLElement & {
  value: string;
  insert: (value: string) => void;
  focus: () => void;
};

const SYMBOLS = [
  ["Fraction", "\\frac{#0}{#?}"],
  ["Exponent", "^{#?}"],
  ["Radical", "\\sqrt{#0}"],
  ["Subscript", "_{#?}"],
  ["≤", "\\le"],
  ["≥", "\\ge"],
  ["≠", "\\ne"],
  ["∧", "\\land"],
  ["∨", "\\lor"],
  ["¬", "\\neg"],
  ["∈", "\\in"],
  ["⊆", "\\subseteq"],
] as const;

export function MathInput({
  value,
  onChange,
  label = "Your reasoning",
  explanationPlaceholder = "Explain your reasoning in words...",
}: {
  value: MathResponse;
  onChange: (value: MathResponse) => void;
  label?: string;
  explanationPlaceholder?: string;
}) {
  const fieldRef = useRef<MathFieldElement | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (field.value !== (value.latex ?? "")) field.value = value.latex ?? "";
    const handleInput = () => onChange({ ...value, latex: field.value });
    field.addEventListener("input", handleInput);
    return () => field.removeEventListener("input", handleInput);
  }, [onChange, value]);

  const preview = useMemo<{ html: string; error: string | null }>(() => {
    if (!value.latex?.trim()) {
      return { html: "", error: null };
    }
    try {
      const html = katex.renderToString(value.latex, {
        throwOnError: true,
        strict: "error",
        displayMode: true,
      });
      return { html, error: null };
    } catch {
      return { html: "", error: "Check the mathematical notation before submitting." };
    }
  }, [value.latex]);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-800" htmlFor="math-explanation">
          {label}
        </label>
        <textarea
          id="math-explanation"
          value={value.plainText}
          onChange={(event) => onChange({ ...value, plainText: event.target.value })}
          maxLength={4000}
          rows={5}
          placeholder={explanationPlaceholder}
          className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600"
        />
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-bold text-slate-800">Mathematical notation (optional)</span>
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Mathematical symbols">
          {SYMBOLS.map(([name, command]) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                fieldRef.current?.insert(command);
                fieldRef.current?.focus();
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-600"
              aria-label={`Insert ${name}`}
            >
              {name}
            </button>
          ))}
        </div>
        <math-field
          ref={(element) => {
            fieldRef.current = element as MathFieldElement | null;
          }}
          value={value.latex ?? ""}
          aria-label="Mathematical expression editor"
          virtual-keyboard-mode="onfocus"
          className="block min-h-14 w-full rounded-xl border border-slate-300 bg-white p-3 text-xl focus-within:ring-2 focus-within:ring-indigo-600"
        />
        {preview.error ? (
          <p className="text-sm font-medium text-red-600" role="alert">{preview.error}</p>
        ) : preview.html ? (
          <div className="overflow-x-auto rounded-xl bg-slate-50 p-3" aria-label="Rendered equation preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
        ) : null}
      </div>
      <p className="text-xs text-slate-500">Keyboard-entered text and LaTeX are supported. Images, handwriting, OCR, and graphical input are not accepted.</p>
    </div>
  );
}
