// Offline Phase 2 audit. The only write is a local report with IDs and check results.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { prepareQuestionBank } from './question-bank-core.ts';
import { validateManagedContent, findForbiddenPublicKeys } from '../src/lib/learning/validation.ts';
import { assertCurriculumContent, VALIDATED_TOPICS } from '../src/data/validated-curriculum.ts';
import { REASONING_PHASES } from '../packages/contracts/src/index.ts';

const dir = 'docs/question-bank-expansion/';
const files = {
  expansion: dir + 'MINDGUIDE_84_Question_Expansion.json',
  student: dir + 'Student_Problems_84_DRAFT.json',
  combined: dir + 'MINDGUIDE_120_Question_Bank_Draft.json',
  original: 'scripts/data/E_MINDGUIDE_Problem_Bank.json',
  suppliedReport: dir + 'validation_report.json',
};
const banks = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, JSON.parse(readFileSync(file, 'utf8'))]));
const hashes = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const { expansion, student, combined, original, suppliedReport } = banks;
const byId = (rows: any[]) => new Map(rows.map(row => [row.problem_id, row]));
const present = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
const strings = (values: unknown) => Array.isArray(values) && values.length > 0 && values.every(present);
const normalized = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const levels = ['Basic', 'Intermediate', 'Advanced'];
const distribution = (rows: any[]) => Object.fromEntries(levels.map(level => [level, rows.filter(row => row.difficulty === level).length]));
const combinedMap = byId(combined.problems);
const studentMap = byId(student.problems);
const originalMap = byId(original.problems);
const safeFields = ['problem_id','subject','topic','topic_number','syllabus_subtopics','difficulty','title','student_facing'];
const safeText = ['problem_statement','given_information_and_assumptions','response_instruction'];
const criteria = ['Accuracy','Logical Validity','Method Selection','Explanation Quality'];
const project = (record: any, fields: string[]) => Object.fromEntries(fields.map(key => [key, record[key]]));
const failures: string[] = [];
const check = (ok: boolean, label: string) => { if (!ok) failures.push(label); };
for (const [bank, count] of [[original, 36], [expansion, 84], [student, 84], [combined, 120]] as const) {
  check(bank.metadata.record_count === count && bank.problems.length === count && byId(bank.problems).size === count, 'Count or nonunique IDs for bank of ' + count);
}
check(hashes.original === suppliedReport.source.sha256 && hashes.original === expansion.metadata.existing_bank_source_sha256, 'Original source hash mismatch');
check(original.problems.every((p: any) => equal(p, combinedMap.get(p.problem_id))), 'Combined source changed original records');
check(expansion.metadata.academic_approval === false && student.metadata.contains_instructor_only_content === false, 'Unexpected approval/export metadata');
check(equal([...safeFields].sort(), [...suppliedReport.structural_checks.student_exports_use_allowlisted_fields.fields].sort()), 'Supplied report student fields mismatch');
const statements = new Map<string, string[]>();
for (const p of [...original.problems, ...expansion.problems]) {
  const key = normalized(p.student_facing.problem_statement);
  statements.set(key, [...(statements.get(key) ?? []), p.problem_id]);
}
const statementDuplicates = [...statements.values()].filter(ids => ids.length > 1);
check(statementDuplicates.length === 0, 'Duplicate normalized statement');
const rows = [];
for (const p of expansion.problems) {
  const id = p.problem_id;
  const i = p.instructor_only;
  const errors: string[] = [];
  const must = (ok: boolean, label: string) => { if (!ok) errors.push(label); };
  const topic = VALIDATED_TOPICS.find(t => t.name === p.topic);
  const oldForTopic = original.problems.find((old: any) => old.topic === p.topic);
  const exportValue = { ...project(p, safeFields), student_facing: project(p.student_facing, safeText) };
  must(!originalMap.has(id) && equal(p, combinedMap.get(id)), 'ID collision or combined record differs');
  must(equal(exportValue, studentMap.get(id)) && equal(exportValue.student_facing, p.student_facing), 'Student allowlist or value mismatch');
  must(safeText.every(key => present(p.student_facing[key])) && present(p.title), 'Missing public text');
  must(!!topic && oldForTopic?.topic_number === p.topic_number && oldForTopic?.subject === p.subject, 'Source topic/subject reference mismatch');
  must(levels.includes(p.difficulty) && present(p.difficulty_rationale) && id.startsWith(oldForTopic?.problem_id.split('-').slice(0,2).join('-') + '-' + p.difficulty[0]), 'Difficulty/ID classification mismatch');
  must(p.publication_status === 'DRAFT_NOT_PUBLISHED' && equal(p.academic_review, {status:'PENDING REVIEW',reviewer_identity:null,review_date:null,final_decision:null}), 'Unexpected review or publication data');
  must(present(i.expected_final_answer) && strings(i.step_by_step_solution) && i.step_by_step_solution.length > 1 && strings(i.formulas_definitions_theorems) && present(i.expected_reasoning), 'Incomplete solution or reasoning');
  must(Array.isArray(i.common_errors) && i.common_errors.length > 0 && i.common_errors.every((e: any) => present(e.misconception) && strings(e.corrective_followups)), 'Incomplete misconception guidance');
  must(equal(i.socratic_stages.map((s: any) => s.stage).sort(), [...'ABCDEF']) && i.socratic_stages.every((s: any) => present(s.name) && present(s.question) && present(s.expected_evidence)), 'Incomplete or duplicate Socratic stages');
  must(equal(Object.keys(i.scoring_references).sort(), [...criteria].sort()) && criteria.every(k => ['high','medium','low'].every(a => present(i.scoring_references[k][a])) && i.scoring_references[k].weight === null && i.scoring_references[k].numeric_score === null), 'Incomplete qualitative scoring references');
  try {
    const [r] = await prepareQuestionBank({ ...expansion, metadata: { ...expansion.metadata, record_count: 1 }, problems: [p] });
    must(r.problem.topicId === topic?.id && equal(r.source,p) && equal(r.privateSolution.solutionSteps,i.step_by_step_solution) && r.privateSolution.finalAnswer === i.expected_final_answer, 'Adapter changed source or answer');
    must(r.problem.problemText === safeText.map(k => p.student_facing[k]).join('\n\n') && !findForbiddenPublicKeys(r.problem,false).length && r.problem.status === 'draft', 'Unsafe mapped public record');
    assertCurriculumContent('problems', id, r.problem);
    assertCurriculumContent('formula_theorem_references', r.referenceId, r.reference);
    must(equal(Object.keys(r.prompts).sort(), [...REASONING_PHASES].sort()), 'Adapter stage coverage');
    for (const [phase, prompt] of Object.entries(r.prompts)) {
      validateManagedContent('socratic_prompt_bank', 'bank-' + id + '-' + phase, { problemId: id, phase, prompt, status: 'draft' });
    }
  } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  rows.push({id, topicId:topic?.id, difficulty:p.difficulty, steps:i.step_by_step_solution.length, stages:i.socratic_stages.length, misconceptions:i.common_errors.length, errors});
}
const topics = VALIDATED_TOPICS.map(t => {
  const newCounts = distribution(expansion.problems.filter((p: any) => p.topic === t.name));
  const total = distribution(combined.problems.filter((p: any) => p.topic === t.name));
  check(equal(newCounts,{Basic:3, Intermediate:2, Advanced:2}) && equal(total,{Basic:4, Intermediate:3, Advanced:3}), 'Topic distribution: ' + t.id);
  return {subjectId:t.subjectId, topicId:t.id, topic:t.name, newCounts, total};
});
const rejected = rows.filter(row => row.errors.length);
const counts = {original:distribution(original.problems), new:distribution(expansion.problems), combined:distribution(combined.problems)};
check(equal(counts.new,suppliedReport.counts.new_by_difficulty) && equal(counts.combined,suppliedReport.counts.combined_by_difficulty), 'Supplied distribution mismatch');
const report = {
  scope:'Offline source/schema validation only. Instructor records are not approved.', hashes, counts, topics,
  candidateCount:rows.length, structurallyRejected:rejected.length, duplicateNormalizedStatements:statementDuplicates,
  collidingOriginalIds:rows.filter(row => originalMap.has(row.id)).map(row => row.id),
  distinctPromptsPerSourceStage:Object.fromEntries([...'ABCDEF'].map(stage => [stage,new Set(expansion.problems.map((p: any) => p.instructor_only.socratic_stages.find((s: any) => s.stage === stage)?.question)).size])),
  failures, records:rows,
};
writeFileSync(dir + 'source-audit.json', JSON.stringify(report,null,2) + '\n');
console.log(JSON.stringify({counts, failures, rejected},null,2));
if (failures.length || rejected.length) process.exitCode = 1;
