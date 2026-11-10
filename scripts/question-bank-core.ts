import { z } from 'zod';
import { containsExcludedContent, VALIDATED_TOPICS } from '../src/data/validated-curriculum.ts';
import { contentHash } from '../src/lib/learning/content-hash.ts';
import { validateManagedContent } from '../src/lib/learning/validation.ts';

const text = z.string().min(1);
const sourceSchema = z.object({
  metadata: z.object({ record_count: z.number().int().positive(), bank_version: text }).passthrough(),
  problems: z.array(z.object({
    problem_id: text.regex(/^[A-Za-z0-9_-]+$/), subject: text, topic: text,
    difficulty: z.enum(['Basic', 'Intermediate', 'Advanced']), title: text,
    syllabus_subtopics: z.array(text).min(1),
    student_facing: z.object({ problem_statement: text, given_information_and_assumptions: text, response_instruction: text }).passthrough(),
    instructor_only: z.object({ expected_final_answer: text, step_by_step_solution: z.array(text).min(1),
      formulas_definitions_theorems: z.array(text).min(1), expected_reasoning: text,
      socratic_stages: z.array(z.object({ stage: text, question: text, expected_evidence: text }).passthrough()),
    }).passthrough(),
    provenance: z.object({ syllabus_locator: text }).passthrough(),
  }).passthrough()).min(1),
}).passthrough();

export async function prepareQuestionBank(input: unknown) {
  const bank = sourceSchema.parse(input);
  if (bank.metadata.record_count !== bank.problems.length) throw new Error('Source record count mismatch.');
  const ids = new Set<string>(), questions = new Set<string>();
  return Promise.all(bank.problems.map(async source => {
    if (ids.has(source.problem_id) || questions.has(source.student_facing.problem_statement.trim())) throw new Error(`Duplicate source question: ${source.problem_id}`);
    ids.add(source.problem_id); questions.add(source.student_facing.problem_statement.trim());
    const subject = source.subject === 'Quantitative Methods with Probability and Statistics' ? 'Quantitative Methods' : source.subject;
    const topic = VALIDATED_TOPICS.find(t => t.subject === subject && t.name === source.topic);
    if (!topic) throw new Error(`Unknown classification: ${source.problem_id}`);
    if (containsExcludedContent([source.syllabus_subtopics,source.student_facing,source.instructor_only])) throw new Error(`Excluded curriculum content: ${source.problem_id}`);
    const instructor = source.instructor_only;
    const stages = Object.fromEntries(instructor.socratic_stages.map(s => [s.stage, s]));
    if ('ABCDEF'.split('').some(s => !stages[s])) throw new Error(`Missing Socratic stage: ${source.problem_id}`);
    const mapping = { problem_understanding: 'A', relevant_information_identification: 'A', method_selection: 'B', formula_theorem_justification: 'C', guided_computation_or_proof: 'D', verification_and_checking: 'F', result_interpretation: 'E' };
    const prompts = Object.fromEntries(Object.entries(mapping).map(([phase, stage]) => [phase, stages[stage].question]));
    const id = source.problem_id;
    const referenceId = `bank-${id}-reference`;
    const privateSolution = {
      // Existing semantic-proof contract: no fabricated scalar answer or exact-prose matching.
      answerSpecification: { kind: 'proof', conclusion: instructor.expected_final_answer, requirements: instructor.socratic_stages.map(s => s.expected_evidence) },
      expectedConcepts: source.syllabus_subtopics,
      requiredTheorem: instructor.formulas_definitions_theorems.join('\n'),
      solutionSteps: instructor.step_by_step_solution, finalAnswer: instructor.expected_final_answer,
      interpretation: instructor.expected_reasoning, socraticPrompts: prompts,
      rubricCalibrationStatus: 'pending',
    };
    const problem = {
      subjectId: topic.subjectId, topicId: topic.id, subject, topic: source.topic,
      difficulty: source.difficulty, variant: 1, title: source.title, questionType: 'constructed_response',
      problemText: [source.student_facing.problem_statement, source.student_facing.given_information_and_assumptions, source.student_facing.response_instruction].join('\n\n'),
      supportedResponseFormats: ['text', 'latex'], formulaTheoremReferenceIds: [referenceId], status: 'draft',
      importSource: 'E_MINDGUIDE_Problem_Bank', sourceProblemId: id, sourceHash: await contentHash(source),
    };
    validateManagedContent('problems', id, { ...problem, privateSolution });
    const reference = { kind: 'theorem', statement: instructor.formulas_definitions_theorems.join('\n'), variables: [],
      conditions: [source.student_facing.given_information_and_assumptions], domain: subject, supportedTopics: [source.topic], equivalentNotation: [], status: 'draft' };
    validateManagedContent('formula_theorem_references', referenceId, reference);
    return { id, problem, privateSolution, referenceId, reference, prompts, source, metadata: bank.metadata };
  }));
}
