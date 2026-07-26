import type {
  CatalogReadinessResponse,
  CatalogSubject,
  CatalogTopic,
  Difficulty,
  LearningCatalog,
  ReasoningPhase,
  SessionConfigurationVersions,
  Subject,
} from "@mindguide/contracts";
import { REASONING_PHASES } from "@mindguide/contracts";
import { callableError } from "./errors.js";
import { database } from "./runtime.js";
import type { PrivateProblemReference } from "./workflow.js";

export interface DifficultyPolicy {
  minimumCompletedSessions: number;
  increaseScoreThreshold: number;
  decreaseScoreThreshold: number;
  maxHintsForIncrease: number;
  arithmeticErrorAloneLowersDifficulty: boolean;
}

export interface ResolvedProblemConfiguration {
  reference: PrivateProblemReference;
  versions: SessionConfigurationVersions;
  difficultyPolicy: DifficultyPolicy;
}

export async function readApprovedTopic(topicId: string): Promise<{
  id: string;
  subjectId: string;
  subject: Subject;
  name: string;
  version: number;
}> {
  const topic = await database.doc(`topics/${topicId}`).get();
  if (!topic.exists || topic.get("status") !== "approved") {
    throw callableError("not-found", "topic_unavailable", "This learning topic is not approved or is unavailable.");
  }
  const subject = topic.get("subject");
  if (subject !== "Quantitative Methods" && subject !== "Discrete Mathematics") {
    throw callableError("failed-precondition", "topic_subject_invalid", "The topic is not linked to a supported subject.");
  }
  return {
    id: topic.id,
    subjectId: String(topic.get("subjectId")),
    subject,
    name: String(topic.get("name")),
    version: Number(topic.get("version") ?? 1),
  };
}

export async function buildLearningCatalog(): Promise<LearningCatalog> {
  const [subjectSnapshot, topicSnapshot, readiness] = await Promise.all([
    database.collection("subjects").where("status", "==", "approved").get(),
    database.collection("topics").where("status", "==", "approved").get(),
    buildCatalogReadiness(),
  ]);
  if (!readiness.ready) {
    return {
      subjects: [],
      topics: [],
      generatedAt: Date.now(),
    };
  }
  const readyTopics = new Set(
    readiness.cells
      .filter((cell) => cell.ready)
      .map((cell) => cell.topicId)
  );
  const topicsWithAllDifficulties = new Set<string>();
  for (const topicId of readyTopics) {
    if (["Basic", "Intermediate", "Advanced"].every((difficulty) =>
      readiness.cells.some((cell) =>
        cell.topicId === topicId && cell.difficulty === difficulty && cell.ready
      )
    )) {
      topicsWithAllDifficulties.add(topicId);
    }
  }

  const subjects = subjectSnapshot.docs
    .filter((document) =>
      document.get("name") === "Quantitative Methods"
      || document.get("name") === "Discrete Mathematics"
    )
    .map((document) => ({
      id: document.id,
      name: document.get("name"),
      status: "approved",
      version: Number(document.get("version") ?? 1),
    } satisfies CatalogSubject))
    .sort((first, second) => first.name.localeCompare(second.name));

  const topics = topicSnapshot.docs
    .filter((document) => topicsWithAllDifficulties.has(document.id))
    .map((document) => ({
      id: document.id,
      subjectId: String(document.get("subjectId")),
      subject: document.get("subject"),
      name: String(document.get("name")),
      status: "approved",
      version: Number(document.get("version") ?? 1),
      ready: true,
    } satisfies CatalogTopic))
    .sort((first, second) =>
      first.subject.localeCompare(second.subject) || first.name.localeCompare(second.name)
    );

  return { subjects, topics, generatedAt: Date.now() };
}

export async function buildCatalogReadiness(): Promise<CatalogReadinessResponse> {
  const [topicSnapshot, problemSnapshot, referenceSnapshot, promptSnapshot, policySnapshot, misconceptionSnapshot] = await Promise.all([
    database.collection("topics").where("status", "==", "approved").get(),
    database.collection("problems").where("status", "==", "approved").get(),
    database.collection("formula_theorem_references").where("status", "==", "approved").get(),
    database.collection("socratic_prompt_bank").where("status", "==", "approved").get(),
    database.collection("difficulty_policies").where("status", "==", "approved").get(),
    database.collection("misconception_categories").where("status", "==", "approved").get(),
  ]);
  const referenceIds = new Set(referenceSnapshot.docs.map((reference) => reference.id));
  const promptPhases = new Map<string, Set<string>>();
  for (const prompt of promptSnapshot.docs) {
    const phases = promptPhases.get(String(prompt.get("problemId"))) ?? new Set<string>();
    phases.add(String(prompt.get("phase")));
    promptPhases.set(String(prompt.get("problemId")), phases);
  }
  const configuredProblems = problemSnapshot.docs.filter((problem) => {
    const references = stringArray(problem.get("formulaTheoremReferenceIds"));
    return Boolean(problem.get("validationRecordId"))
      && references.length > 0
      && references.every((referenceId) => referenceIds.has(referenceId))
      && promptPhases.get(problem.id)?.size === REASONING_PHASES.length;
  });
  const difficulties: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
  const cells = topicSnapshot.docs.flatMap((topic) =>
    difficulties.map((difficulty) => {
      const variants = new Set(
        configuredProblems
          .filter((problem) =>
            problem.get("topicId") === topic.id
            && problem.get("difficulty") === difficulty
            && problem.get("validationRecordId")
          )
          .map((problem) => Number(problem.get("variant")))
      );
      return {
        topicId: topic.id,
        difficulty,
        approvedVariants: variants.size,
        ready: variants.size === 3,
      };
    })
  );
  const approvedProblemCount = problemSnapshot.docs.filter((problem) =>
    problem.get("validationRecordId")
  ).length;
  const issues = cells
    .filter((cell) => !cell.ready)
    .map((cell) =>
      `${cell.topicId}/${cell.difficulty} has ${cell.approvedVariants} of 3 validated variants.`
    );
  if (policySnapshot.size === 0) issues.push("No approved adaptive-difficulty policy is configured.");
  if (misconceptionSnapshot.size < 12) issues.push("The approved misconception policy set is incomplete.");
  return {
    ready:
      topicSnapshot.size === 11
      && cells.length === 33
      && issues.length === 0
      && approvedProblemCount === 99,
    expectedProblemCount: 99,
    approvedProblemCount,
    cells,
    issues,
    generatedAt: Date.now(),
  };
}

export async function resolveProblemConfiguration(
  problem: FirebaseFirestore.DocumentSnapshot,
  privateReference: PrivateProblemReference
): Promise<ResolvedProblemConfiguration> {
  if (!problem.exists || problem.get("status") !== "approved" || !problem.get("validationRecordId")) {
    throw callableError("failed-precondition", "problem_not_validated", "This problem has not completed faculty validation.");
  }
  const topic = await readApprovedTopic(String(problem.get("topicId")));
  if (topic.subjectId !== problem.get("subjectId") || topic.name !== problem.get("topic")) {
    throw callableError("failed-precondition", "problem_topic_mismatch", "The problem and approved topic metadata do not match.");
  }

  const referenceIds = stringArray(problem.get("formulaTheoremReferenceIds"));
  if (referenceIds.length === 0) {
    throw callableError("failed-precondition", "problem_reference_missing", "The problem has no approved formula or theorem reference.");
  }
  const [referenceDocuments, promptSnapshot, misconceptionSnapshot, policySnapshot] = await Promise.all([
    database.getAll(...referenceIds.map((referenceId) =>
      database.doc(`formula_theorem_references/${referenceId}`)
    )),
    database.collection("socratic_prompt_bank")
      .where("problemId", "==", problem.id)
      .where("status", "==", "approved")
      .get(),
    database.collection("misconception_categories").where("status", "==", "approved").get(),
    database.collection("difficulty_policies").where("status", "==", "approved").get(),
  ]);
  if (referenceDocuments.some((document) => !document.exists || document.get("status") !== "approved")) {
    throw callableError("failed-precondition", "problem_reference_unapproved", "A linked formula or theorem reference is unavailable.");
  }

  const prompts = Object.fromEntries(promptSnapshot.docs.map((document) => [
    document.get("phase"),
    String(document.get("prompt")),
  ])) as Partial<Record<ReasoningPhase, string>>;
  const missingPhases = REASONING_PHASES.filter((phase) => !prompts[phase]);
  if (missingPhases.length > 0) {
    throw callableError(
      "failed-precondition",
      "prompt_set_incomplete",
      `The approved prompt set is incomplete: ${missingPhases.join(", ")}.`
    );
  }

  const policyDocument = selectDifficultyPolicy(
    policySnapshot.docs,
    String(problem.get("subjectId")),
    String(problem.get("topicId"))
  );
  if (!policyDocument) {
    throw callableError("failed-precondition", "difficulty_policy_missing", "No approved difficulty policy applies to this topic.");
  }
  const misconceptionPrompts = Object.fromEntries(
    misconceptionSnapshot.docs
      .filter((document) => typeof document.get("correctivePrompt") === "string")
      .map((document) => [document.id, String(document.get("correctivePrompt"))])
  );
  const requiredFormula = referenceDocuments.find((document) => document.get("kind") === "formula")?.get("statement");
  const requiredTheorem = referenceDocuments.find((document) => document.get("kind") === "theorem")?.get("statement");

  return {
    reference: {
      ...privateReference,
      requiredFormula: requiredFormula ? String(requiredFormula) : privateReference.requiredFormula,
      requiredTheorem: requiredTheorem ? String(requiredTheorem) : privateReference.requiredTheorem,
      formulaTheoremConditions: referenceDocuments.flatMap((document) => stringArray(document.get("conditions"))),
      socraticPrompts: prompts,
      misconceptionPrompts,
    },
    versions: {
      topic: { id: topic.id, version: topic.version },
      problem: { id: problem.id, version: Number(problem.get("version") ?? 1) },
      formulaTheoremReferences: referenceDocuments.map((document) => ({
        id: document.id,
        version: Number(document.get("version") ?? 1),
      })),
      prompts: promptSnapshot.docs.map((document) => ({
        id: document.id,
        version: Number(document.get("version") ?? 1),
      })),
      misconceptionPolicies: misconceptionSnapshot.docs.map((document) => ({
        id: document.id,
        version: Number(document.get("version") ?? 1),
      })),
      difficultyPolicy: {
        id: policyDocument.id,
        version: Number(policyDocument.get("version") ?? 1),
      },
    },
    difficultyPolicy: {
      minimumCompletedSessions: Number(policyDocument.get("minimumCompletedSessions")),
      increaseScoreThreshold: Number(policyDocument.get("increaseScoreThreshold")),
      decreaseScoreThreshold: Number(policyDocument.get("decreaseScoreThreshold")),
      maxHintsForIncrease: Number(policyDocument.get("maxHintsForIncrease")),
      arithmeticErrorAloneLowersDifficulty: Boolean(policyDocument.get("arithmeticErrorAloneLowersDifficulty")),
    },
  };
}

export async function resolveDifficultyPolicy(
  subjectId: string,
  topicId: string
): Promise<DifficultyPolicy> {
  const snapshot = await database.collection("difficulty_policies")
    .where("status", "==", "approved")
    .get();
  const document = selectDifficultyPolicy(snapshot.docs, subjectId, topicId);
  if (!document) {
    throw callableError("failed-precondition", "difficulty_policy_missing", "No approved difficulty policy applies to this topic.");
  }
  return {
    minimumCompletedSessions: Number(document.get("minimumCompletedSessions")),
    increaseScoreThreshold: Number(document.get("increaseScoreThreshold")),
    decreaseScoreThreshold: Number(document.get("decreaseScoreThreshold")),
    maxHintsForIncrease: Number(document.get("maxHintsForIncrease")),
    arithmeticErrorAloneLowersDifficulty: Boolean(document.get("arithmeticErrorAloneLowersDifficulty")),
  };
}

function selectDifficultyPolicy(
  policies: FirebaseFirestore.QueryDocumentSnapshot[],
  subjectId: string,
  topicId: string
): FirebaseFirestore.QueryDocumentSnapshot | undefined {
  return policies
    .filter((document) =>
      (!document.get("subjectId") || document.get("subjectId") === subjectId)
      && (!document.get("topicId") || document.get("topicId") === topicId)
    )
    .sort((first, second) => {
      const specificity = (document: FirebaseFirestore.QueryDocumentSnapshot) =>
        Number(Boolean(document.get("subjectId"))) + Number(Boolean(document.get("topicId"))) * 2;
      return specificity(second) - specificity(first)
        || Number(second.get("version") ?? 0) - Number(first.get("version") ?? 0);
    })[0];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}
