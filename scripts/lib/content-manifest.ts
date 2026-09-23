import { contentHash } from "./content-hash.js";
import { getFirestore } from "firebase-admin/firestore";
const database = getFirestore();
import { REASONING_PHASES } from "@mindguide/contracts";
import { callableError } from "../../src/lib/learning/errors.ts";
import { checkAnswer } from "../../src/lib/learning/answers.ts";
import type { PrivateProblemReference } from "../../src/lib/learning/workflow.ts";


/** Read inside the caller's transaction when recording approval. Operational metadata is excluded. */
export async function instructionalManifest(problem: FirebaseFirestore.DocumentSnapshot, transaction?: FirebaseFirestore.Transaction) {
  const readDoc = (ref: FirebaseFirestore.DocumentReference) => transaction ? transaction.get(ref) : ref.get();
  const readQuery = (query: FirebaseFirestore.Query) => transaction ? transaction.get(query) : query.get();
  const [solution, prompts, topic, policies, misconceptions, rubric] = await Promise.all([
    readDoc(problem.ref.collection("private").doc("solution")),
    readQuery(database.collection("socratic_prompt_bank").where("problemId", "==", problem.id).where("status", "==", "approved")),
    readDoc(database.doc(`topics/${String(problem.get("topicId"))}`)),
    readQuery(database.collection("difficulty_policies").where("status", "==", "approved")),
    readQuery(database.collection("misconception_categories").where("status", "==", "approved")),
    readDoc(database.doc("rubrics/pilot-v5")),
  ]);
  const ids: string[] = problem.get("formulaTheoremReferenceIds") ?? [];
  const references = await Promise.all(ids.map(id => readDoc(database.doc(`formula_theorem_references/${id}`))));
  const privateData = solution.data() as PrivateProblemReference | undefined;
  const applicable = policies.docs.filter(doc => (!doc.get("topicId") || doc.get("topicId") === topic.id) && (!doc.get("subjectId") || doc.get("subjectId") === problem.get("subjectId")));
  const clean = (doc: FirebaseFirestore.DocumentSnapshot) => {
    const value = { ...doc.data() };
    for (const key of ["createdAt", "updatedAt", "updatedBy", "createdBy", "validatedAt", "validationRecordId", "status"]) delete value[key];
    return { id: doc.id, value };
  };
  const complete = Boolean(privateData?.answerSpecification && privateData.rubricVersion && privateData.solutionSteps?.length && privateData.finalAnswer?.trim()
    && privateData.interpretation?.trim() && privateData.expectedConcepts?.length && topic.get("status") === "approved"
    && references.length && references.every(doc => doc.get("status") === "approved") && applicable.length && rubric.get("status") === "approved"
    && REASONING_PHASES.every(phase => prompts.docs.filter(doc => doc.get("phase") === phase && String(doc.get("prompt") ?? "").trim()).length === 1
      && ["socratic_prompt", "targeted_hint", "stronger_hint", "partial_step"].every(level => {
        const hints = privateData.safeHints?.[phase]?.[level as "targeted_hint"];
        return hints?.length && hints.every(hint => hint.trim() && !checkAnswer({ plainText: hint }, privateData.answerSpecification));
      })));
  const manifest = { problem: clean(problem), solution: clean(solution), topic: clean(topic), references: references.map(clean).sort((a,b) => a.id.localeCompare(b.id)), prompts: prompts.docs.map(clean).sort((a,b) => a.id.localeCompare(b.id)), policies: applicable.map(clean).sort((a,b) => a.id.localeCompare(b.id)), misconceptions: misconceptions.docs.map(clean).sort((a,b) => a.id.localeCompare(b.id)), rubric: clean(rubric) };
  return { hash: contentHash(manifest), manifest, complete };
}

export async function requireMatchingApproval(problem: FirebaseFirestore.DocumentSnapshot): Promise<string> {
  const id = problem.get("validationRecordId");
  if (typeof id !== "string" || !id || id.includes("/")) throw callableError("failed-precondition", "approval_missing", "Faculty validation is required.");
  const [approval, current] = await Promise.all([database.doc(`content_validation_records/${id}`).get(), instructionalManifest(problem)]);
  if (!current.complete || approval.get("decision") !== "approved" || approval.get("problemId") !== problem.id || approval.get("manifestHash") !== current.hash) {
    throw callableError("failed-precondition", "approval_stale", "The current instructional content does not match a complete faculty-approved manifest.");
  }
  return current.hash;
}
