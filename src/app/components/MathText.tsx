import katex from "katex";
import "katex/dist/katex.min.css";

export function MathText({ text = "", latex }: { text?: string; latex?: string }) {
  if (!latex) return <span className="whitespace-pre-wrap">{text}</span>;
  let rendered: string;
  try { rendered = katex.renderToString(latex, { throwOnError: true, trust: false, strict: "error", maxExpand: 100, maxSize: 20, output: "htmlAndMathml" }); }
  catch { return <span>{text} <code>{latex}</code></span>; }
  return <span>{text && <span className="whitespace-pre-wrap">{text} </span>}<span className="inline-block max-w-full overflow-x-auto align-middle" dangerouslySetInnerHTML={{ __html: rendered }} /></span>;
}
