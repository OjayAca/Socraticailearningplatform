import { scoringReference } from '../src/lib/learning/scoring-reference.ts';
import { contentHash } from '../src/lib/learning/content-hash.ts';

import type { prepareQuestionBank } from "./question-bank-core.ts";

export async function questionBankDocuments(records: Awaited<ReturnType<typeof prepareQuestionBank>>, sourceFileHash: string, evidence: any = null) {
  const status = evidence ? "approved" : "draft";
  const expected = new Map<string, Record<string, any>>();
  const put = (path: string, fields: Record<string, any>) => {
    if (expected.has(path)) throw new Error('Duplicate document path: ' + path);
    expected.set(path, fields);
  };
  for (const record of records) {
    const { id, problem, privateSolution, source, referenceId, reference, prompts, metadata } = record;
    const validationId = `bank-${id}-${sourceFileHash.slice(0, 16)}`;
    const published = { ...problem, status, version: 1, ...(evidence ? { validationRecordId: validationId } : {}) };
    put(`problems/${id}`, published);
    put(`problems/${id}/private/solution`, { ...privateSolution, version: 1 });
    put(`problems/${id}/private/import_source`, { source, metadata, sourceFileHash });
    put(`formula_theorem_references/${referenceId}`, { ...reference, status, version: 1 });
    for (const [phase, prompt] of Object.entries(prompts)) put(`socratic_prompt_bank/bank-${id}-${phase}`, { problemId: id, phase, prompt, status, version: 1 });
    if (evidence) {
      const validation: Record<string, any> = { problemId: id, problemVersion: 1, decision: 'approved',
        syllabusReference: source.provenance.syllabus_locator, contentMatrixItem: `${problem.topic} / ${problem.difficulty}`,
        validatorName: evidence.confirmedBy, validatorRole: 'Project owner confirming academic approval',
        validationDate: Date.parse(evidence.confirmedAt), evidenceReference: evidence.reference, evidenceHash: await contentHash(evidence),
        approvalConfirmation: evidence.statement, createdBy: 'operator-import',
      };
      const scoring = scoringReference({ ...privateSolution, formulaTheoremConditions: reference.conditions }, { ...published, id }, validation);
      validation.scoringSnapshotHash = await contentHash(scoring);
      put(`content_validation_records/${validationId}`, validation);
      put(`problem_scoring/${id}`, scoring);
    }
  }
  return expected;
}
