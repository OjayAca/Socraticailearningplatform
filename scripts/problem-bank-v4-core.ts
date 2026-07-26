import { mindGuideProblems } from "../src/data/mindguide-problems.ts";
import { buildPrivateProblem } from "./migration-v3-core.ts";

export interface SchemaV4ProblemSeed {
  id: string;
  sourceProblemId: string;
  subjectId: string;
  topicId: string;
  subject: "Quantitative Methods" | "Discrete Mathematics";
  topic: string;
  difficulty: "Basic" | "Intermediate" | "Advanced";
  variant: 1 | 2 | 3;
  problemText: string;
  formulaTheoremReferenceIds: string[];
  status: "draft" | "pending_validation";
  privateSolution: Record<string, unknown>;
  prompts: Record<string, string>;
}

export function buildSchemaV4ProblemSeeds(): SchemaV4ProblemSeed[] {
  return mindGuideProblems.flatMap((problem) => {
    const value = problem.requiredFormula || problem.requiredTheorem;
    if (!value) {
      throw new Error(`Problem ${problem.id} has no formula or theorem reference.`);
    }
    const subjectId = slug(problem.subject);
    const topicId = slug(`${problem.subject}-${problem.topic}`);
    const referenceId = `ref-${stableId(`${problem.subject}:${problem.topic}:${value}`)}`;
    const privateSolution = buildPrivateProblem(problem) as Record<string, unknown>;
    const prompts = privateSolution.socraticPrompts as Record<string, string>;
    return ([1, 2, 3] as const).map((variant) => ({
      id: variant === 1 ? problem.id : `${problem.id}-v${variant}`,
      sourceProblemId: problem.id,
      subjectId,
      topicId,
      subject: problem.subject,
      topic: problem.topic,
      difficulty: problem.difficulty,
      variant,
      problemText: variant === 1
        ? problem.problemText
        : `[Faculty-validation draft variant ${variant}] ${problem.problemText}`,
      formulaTheoremReferenceIds: [referenceId],
      status: variant === 1 ? "pending_validation" : "draft",
      privateSolution: {
        ...privateSolution,
        draftVariantNotice: variant === 1
          ? null
          : "Replace or verify the parameters, worked solution, final answer, and interpretation before faculty validation.",
      },
      prompts,
    }));
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
