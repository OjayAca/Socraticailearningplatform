import { Fragment } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

const MATH_PARTS_PATTERN =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([^\n]+?\\\)|^\\[a-zA-Z]+[^\n]*$)/gm;

interface MathTextProps {
  text?: string;
  latex?: string;
  displayMode?: boolean;
}

/**
 * Renders plain text and/or a KaTeX-formatted LaTeX expression safely with strict sanitization.
 *
 * @param props.text - Optional plain text to display alongside or instead of LaTeX.
 * @param props.latex - Optional raw LaTeX expression (without delimiters) to render with KaTeX.
 * @param props.displayMode - When `true`, renders the expression in block display math mode.
 * @returns Rendered inline or block math element, falling back to plain `<code>` on KaTeX errors.
 */
export function MathText({ text = "", latex, displayMode = false }: MathTextProps) {
  if (!latex) return <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</span>;
  let rendered: string;
  try {
    rendered = katex.renderToString(latex, {
      displayMode,
      throwOnError: true,
      trust: false,
      strict: "error",
      maxExpand: 100,
      maxSize: 20,
      output: "htmlAndMathml",
    });
  } catch {
    return (
      <span>
        {text} <code className="[overflow-wrap:anywhere]">{latex}</code>
      </span>
    );
  }
  return (
    <span>
      {text && <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text} </span>}
      <span
        className={
          displayMode
            ? "block max-w-full overflow-x-auto overflow-y-hidden py-0.5"
            : "inline align-baseline"
        }
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </span>
  );
}

interface FormattedMathTextProps {
  text: string;
}

/**
 * Splits mixed prose and delimited LaTeX (`\(...\)`, `\[...\]`, `$...$`, `$$...$$`, and standalone
 * LaTeX lines) and renders math segments via `MathText`. Returns plain text unchanged when no
 * math delimiters are present so accessible text queries remain intact.
 *
 * @param props.text - Mixed prose and optional delimited LaTeX string.
 * @returns Plain text fragment when no math is present, or interleaved prose and `MathText` segments.
 */
export function FormattedMathText({ text }: FormattedMathTextProps) {
  const parts = text.split(MATH_PARTS_PATTERN);
  if (parts.length === 1) {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) {
          return part ? <Fragment key={index}>{part}</Fragment> : null;
        }
        const isDisplayMath = part.startsWith("$$") || part.startsWith("\\[");
        const latex =
          isDisplayMath || part.startsWith("\\(")
            ? part.slice(2, -2)
            : part.startsWith("$")
              ? part.slice(1, -1)
              : part;
        return (
          <span key={index} className={isDisplayMath ? "block overflow-x-auto py-2" : undefined}>
            <MathText latex={latex} displayMode={isDisplayMath} />
          </span>
        );
      })}
    </>
  );
}

/** Props for {@link ProblemStatementText}. */
export interface ProblemStatementTextProps {
  question?: string;
  problemText?: string;
  problemLatex?: string;
}

/**
 * Renders a problem statement, substituting a single `[math]` placeholder in `problemText`
 * with KaTeX-rendered `problemLatex` when present, and otherwise rendering `question` via
 * {@link FormattedMathText}.
 *
 * @param props.question - Combined problem statement fallback.
 * @param props.problemText - Original learner-authored sentence containing an optional `[math]` placeholder.
 * @param props.problemLatex - Optional raw LaTeX expression associated with `[math]`.
 * @returns Rendered problem statement with KaTeX notation when present.
 */
export function ProblemStatementText({
  question,
  problemText,
  problemLatex,
}: ProblemStatementTextProps) {
  const trimmedLatex = problemLatex?.trim();
  if (
    typeof problemText === "string" &&
    problemText.length > 0 &&
    trimmedLatex &&
    problemText.split("[math]").length === 2
  ) {
    const [before, after] = problemText.split("[math]");
    return (
      <span>
        {before && <FormattedMathText text={before} />}
        <MathText latex={trimmedLatex} />
        {after && <FormattedMathText text={after} />}
      </span>
    );
  }
  return <FormattedMathText text={question ?? problemText ?? ""} />;
}
