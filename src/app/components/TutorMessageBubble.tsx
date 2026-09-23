import type { TutorMessage } from "@mindguide/contracts";
import { MathText } from "./MathText";

// Tutor replies may contain delimited math; saved equation-editor values are
// appended to the message as a separate, undelimited LaTeX line.
const MATH_PARTS = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([^\n]+?\\\)|^\\[a-zA-Z]+[^\n]*$)/gm;

export function TutorMessageBubble({ role, text }: { role: TutorMessage["role"]; text: string }) {
  const student = role === "student";
  return (
    <article aria-label={student ? "You" : "AI tutor"} className={`flex items-start gap-2.5 ${student ? "flex-row-reverse" : ""}`}>
      <span aria-hidden="true" className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${student ? "bg-violet-100 text-violet-700" : "bg-white text-violet-600"}`}>
        {student ? "You" : "MG"}
      </span>
      <div className={`min-w-0 max-w-[85%] overflow-x-auto whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[75%] ${student ? "rounded-tr-md bg-violet-600 text-white" : "rounded-tl-md border border-slate-200/80 bg-white text-slate-700 shadow-sm"}`}>
        {text.split(MATH_PARTS).map((part, index) => {
          if (index % 2 === 0) return <span key={index}>{part}</span>;
          const display = part.startsWith("$$") || part.startsWith("\\[");
          const latex = display || part.startsWith("\\(") ? part.slice(2, -2) : part.startsWith("$") ? part.slice(1, -1) : part;
          return <span key={index} className={display ? "block overflow-x-auto py-2" : undefined}><MathText latex={latex} /></span>;
        })}
      </div>
    </article>
  );
}
