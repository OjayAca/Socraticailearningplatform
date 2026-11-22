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
