// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareQuestionBank } from '../../scripts/question-bank-core';
import { findForbiddenPublicKeys, validateManagedContent } from '../../src/lib/learning/validation';
import { scoringReference } from '../../src/lib/learning/scoring-reference';
import { checkMath } from '../../server/gemini';
import { LearningService } from '../../server/services/LearningService';
import { MemoryStore } from '../helpers/memory-learning-store';
import { contentHash } from '../../src/lib/learning/content-hash';
import type { Env } from '../../server/platform';

const bank = JSON.parse(readFileSync('scripts/data/E_MINDGUIDE_Problem_Bank.json', 'utf8'));
describe('supplied question bank adapter', () => {
  it('retrieves all 36 approved questions through the existing assignment service with protected references', async () => {
    for (const r of await prepareQuestionBank(bank)) {
      const store = new MemoryStore();
      const approval = { decision: 'approved', problemId: r.id, problemVersion: 1 };
      const problem = { ...r.problem, id: r.id, status: 'approved', version: 1, validationRecordId: 'approval' };
      const reference = scoringReference(r.privateSolution, problem, approval);
      store.put(`subjects/${r.problem.subjectId}`, { name: r.problem.subject, status: 'approved' });
      store.put(`topics/${r.problem.topicId}`, { name: r.problem.topic, subject: r.problem.subject, subjectId: r.problem.subjectId, status: 'approved' });
      store.put(`problems/${r.id}`, problem);
      store.put('content_validation_records/approval', { ...approval, scoringSnapshotHash: await contentHash(reference) });
      store.put(`problem_scoring/${r.id}`, reference);
      store.put(`problems/${r.id}/private/import_source`,{source:r.source});
      // Higher levels require actual performance evidence, never availability fallback.
      if (r.problem.difficulty !== 'Basic') {
        const previous = r.problem.difficulty === 'Advanced' ? 'Intermediate' : 'Basic';
        for (let i=0;i<3;i++) store.put(`sessions/history-${i}`, {studentId:'local-unit-only',topicId:r.problem.topicId,problemId:`prior-${i}`,difficulty:previous,status:'submitted',workflowVersion:6,statsCommittedAt:new Date(i+1),submittedAt:new Date(i+1),supportHistory:[],scorecard:{criteria:Object.fromEntries(['accuracy','logicalValidity','methodSelection','explanationQuality'].map(k=>[k,{score:25}]))}});
      }
      const service = new LearningService(store, { generate: async () => { throw new Error('No provider calls in assignment test'); } }, {} as Env, 'local-unit-only');
      const prepared = await (service as any).prepare({ topicId: r.problem.topicId, mode: 'curated' }, {});
      expect(prepared.session.problemId).toBe(r.id);
      expect(prepared.session.originalQuestion).toBe(r.problem.problemText);
      expect(prepared.session.releasedSolution).toBeNull();
      expect(prepared.session.scorecard).toBeNull();
      expect(prepared.session.allowedSupport).toEqual(['socratic_prompt']);
      expect(findForbiddenPublicKeys(prepared.session, false)).not.toContain('content.finalAnswer');
      expect(prepared.reference.finalAnswer).toBe(r.privateSolution.finalAnswer);
      expect(prepared.reference.sourceGuidance.alternativeMethods).toEqual(r.source.instructor_only.alternative_methods ?? null);
      expect(prepared.session.sourceGuidance).toBeUndefined();
    }
  });
  it('preserves every source field and answer while covering all curriculum cells', async () => {
    const records = await prepareQuestionBank(bank);
    expect(records).toHaveLength(36);
    expect(new Set(records.map(r => `${r.problem.topicId}/${r.problem.difficulty}`)).size).toBe(36);
    for (const [index, record] of records.entries()) {
      expect(record.source).toEqual(bank.problems[index]);
      expect(record.privateSolution.finalAnswer).toBe(record.source.instructor_only.expected_final_answer);
      expect(record.privateSolution.solutionSteps).toEqual(record.source.instructor_only.step_by_step_solution);
      expect(record.problem.problemText).toBe(Object.values(record.source.student_facing).join('\n\n'));
      expect(findForbiddenPublicKeys(record.problem, false)).toEqual([]);
      const validated = validateManagedContent('problems', record.id, { ...record.problem, privateSolution: record.privateSolution });
      expect(validated.privateSolution).toEqual(record.privateSolution);
      expect(record.problem.status).toBe('draft');
      expect(checkMath({ plainText: record.privateSolution.finalAnswer }, record.privateSolution.answerSpecification)).toBe('unsupported');
    }
  });
  it('is deterministic and does not manufacture approval', async () => {
    expect(await prepareQuestionBank(bank)).toEqual(await prepareQuestionBank(bank));
    const [r] = await prepareQuestionBank(bank);
    expect(() => scoringReference(r.privateSolution, { ...r.problem, id: r.id }, {})).toThrow(/approval/);
  });
  it('rejects duplicate IDs, duplicate questions, unknown topics and missing answers', async () => {
    for (const change of [
      (b: any) => { b.problems[1].problem_id = b.problems[0].problem_id; },
      (b: any) => { b.problems[1].student_facing.problem_statement = b.problems[0].student_facing.problem_statement; },
      (b: any) => { b.problems[0].topic = 'Unknown topic'; },
      (b: any) => { b.problems[0].instructor_only.expected_final_answer = ''; },
    ]) {
      const changed = structuredClone(bank); change(changed);
      await expect(prepareQuestionBank(changed)).rejects.toThrow();
    }
  });
});
