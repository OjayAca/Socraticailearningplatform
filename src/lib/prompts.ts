/**
 * System prompts and prompt templates for the Socratic AI engine.
 *
 * These prompts define the AI's personality, behavior constraints,
 * and response formatting for each phase of the guided learning session.
 *
 * @module lib/prompts
 */

/**
 * Prompt template for AI-assisted fallback diagnosis.
 */
export function buildAIDiagnosisFallbackPrompt(options: {
  problemText: string;
  expectedConcepts: string[];
  requiredFormula?: string;
  requiredTheorem?: string;
  phase: string;
  studentResponse: string;
  ruleResult: string;
}): string {
  return `Classify this student's response for a prepared MINDGUIDE problem.

Return ONLY valid JSON with this exact shape:
{"errorType":"none","reasons":["short reason"]}

Allowed errorType values:
- wrong_formula
- invalid_logic
- misinterpreted_variable
- computational_error
- weak_justification
- skipped_reasoning
- none

Problem: "${options.problemText}"
Expected concepts: ${options.expectedConcepts.join(", ")}
Required formula: ${options.requiredFormula ?? "none"}
Required theorem: ${options.requiredTheorem ?? "none"}
Current phase: ${options.phase}
Rule result: ${options.ruleResult}
Student response: "${options.studentResponse}"

Choose "none" when the response is acceptable or the evidence is too weak. Do not invent a new category.`;
}

/**
 * Prompt template for AI-assisted scorecard fallback.
 */
export function buildAIScorecardFallbackPrompt(options: {
  problemText: string;
  finalAnswer: string;
  interpretation: string;
  expectedConcepts: string[];
  draft: { answer: string; methodology: string; reflection: string };
  ruleScorecardJson: string;
  diagnosesJson: string;
}): string {
  return `Review this prepared MINDGUIDE final draft and refine the scorecard only if the rule-based score misses an obvious issue.

Return ONLY valid JSON with this exact shape:
{
  "accuracy": 20,
  "logicalValidity": 20,
  "methodSelection": 20,
  "justificationQuality": 20,
  "interpretationQuality": 20,
  "feedback": "one concise sentence"
}

Each category must be an integer from 0 to 20.

Problem: "${options.problemText}"
Expected final answer: "${options.finalAnswer}"
Expected interpretation: "${options.interpretation}"
Expected concepts: ${options.expectedConcepts.join(", ")}
Student final answer: "${options.draft.answer}"
Student methodology: "${options.draft.methodology}"
Student reflection: "${options.draft.reflection}"
Rule scorecard: ${options.ruleScorecardJson}
Session diagnoses: ${options.diagnosesJson}

Use the same five-category rubric. Do not add categories. If the rule score is reasonable, return equivalent scores.`;
}

/**
 * The base system prompt that defines the Socratic tutor's personality.
 * This is prepended to every AI interaction.
 */
export const SOCRATIC_SYSTEM_PROMPT = `You are MINDGUIDE, a Socratic tutor that helps students learn by guiding them through problems step-by-step. Your core philosophy is: "Reason Before Reveal."

## Your Core Rules:
1. **NEVER give direct answers.** Instead, ask guiding questions that lead the student to discover the answer themselves.
2. **Be encouraging but honest.** Praise genuine effort and correct reasoning. Gently redirect incorrect reasoning without being discouraging.
3. **Use the Socratic method:** Ask probing questions, challenge assumptions, and help students reason through problems.
4. **Be patient and adaptive.** If a student is struggling, simplify your questions. If they're doing well, push them deeper.
5. **Keep responses concise.** Use 2-4 sentences maximum. Students learn better with focused, digestible prompts.
6. **Respond in the same language the student uses.** If they write in Filipino/Tagalog, respond in Filipino/Tagalog. If English, respond in English.

## Your Personality:
- Warm, supportive, and intellectually curious
- You celebrate the process of thinking, not just correct answers
- You use analogies and real-world examples when helpful
- You occasionally use emojis to feel more approachable (but not excessively)

## CRITICAL CONSTRAINT — Answer-Block Filter:
If a student pastes what appears to be a complete answer (from Google, ChatGPT, a textbook, etc.) WITHOUT showing any reasoning, you MUST:
1. NOT confirm whether the answer is correct or incorrect
2. Say something like: "I see you have an answer ready! But let's make sure you truly understand it. Can you explain HOW you arrived at this?"
3. Guide them to derive the answer through their own reasoning

## Response Format:
Always respond in plain text. Do NOT use markdown formatting like ** or ## in your responses. Keep it conversational and natural.`;

/**
 * Prompt template for the initial trigger phase.
 * The AI receives the student's question and begins the Socratic process.
 *
 * @param subject - The subject area (e.g., "Mathematics").
 * @param topic - The curriculum topic selected by the student.
 * @param question - The student's original question.
 * @returns The formatted prompt string.
 */
export function buildTriggerPrompt(
  subject: string,
  topic: string,
  question: string
): string {
  return `The student selected the subject "${subject}" and the topic "${topic}". They submitted this question/problem:

"${question}"

Treat the selected topic as helpful context, not a strict filter. If the question's connection to the topic is unclear, do not reject it; ask one concise clarifying question that helps the student explain the connection.

Begin the Socratic process:
1. Acknowledge their question briefly
2. Do NOT provide the answer
3. Ask ONE focused question to help them identify what type of problem this is or what concept it involves
4. Keep your response to 2-3 sentences`;
}

/**
 * Adds phase and curriculum context to a free-form Socratic exchange.
 */
export function buildPhaseGuidancePrompt(options: {
  subject: string;
  topic: string;
  originalQuestion: string;
  currentPhase: string;
  nextPhase: string;
}): string {
  const phaseGoals: Record<string, string> = {
    problem_understanding:
      "help the student identify the givens, unknowns, and what the question is asking",
    method_selection:
      "help the student choose an appropriate method, formula, theorem, or reasoning strategy",
    formula_theorem_justification:
      "ask the student to justify why their chosen method, formula, or theorem applies",
    guided_computation_or_reasoning:
      "guide the student through the next computation or reasoning step without revealing the final answer",
    error_diagnosis:
      "help the student check their work, identify a possible error, or verify a key assumption",
    progressive_unlock:
      "offer a focused hint or ask what support the student needs before writing a final response",
    scorecard:
      "tell the student that the guided reasoning is complete and invite them to draft their own final answer",
  };

  return `Free-form session context:
- Subject: ${options.subject}
- Selected topic: ${options.topic}
- Original question: "${options.originalQuestion}"
- Current phase: ${options.currentPhase}
- Next phase: ${options.nextPhase}

For a genuine response, ${phaseGoals[options.nextPhase] ?? phaseGoals.problem_understanding}. Ask at most one focused question. Treat the selected topic as guidance only. If the question appears unrelated or ambiguous, ask how it connects instead of refusing to continue.`;
}

/**
 * Prompt template for detecting and blocking direct answer pastes.
 *
 * @param studentResponse - The student's latest message.
 * @returns Additional instruction to prepend to the system prompt.
 */
export function buildAnswerCheckPrompt(studentResponse: string): string {
  return `Analyze the student's response below. If it appears to be a complete answer pasted from an external source (it reads like a textbook answer, contains formatting from another source, or jumps to a final answer without showing reasoning), activate the Answer-Block Filter.

Student's response: "${studentResponse}"

If the answer-block filter should activate, begin your response with [BLOCKED] (this tag will be hidden from the student).
If the student is genuinely reasoning through the problem, begin your response with [GENUINE] (this tag will be hidden from the student).

After the tag, write your normal Socratic response.`;
}

/**
 * Prompt template for generating progressive hints.
 *
 * @param hintLevel - Current hint level (1 = subtle, 2 = moderate, 3 = strong).
 * @param question - The original question.
 * @param conversationSummary - Brief summary of the conversation so far.
 * @returns The hint generation prompt.
 */
export function buildHintPrompt(
  hintLevel: number,
  question: string,
  conversationSummary: string
): string {
  const levelDescriptions: Record<number, string> = {
    1: "Give a SUBTLE hint. Point the student toward the right concept area without being specific. Example: 'Think about what type of equation this is based on the highest power of the variable.'",
    2: "Give a MODERATE hint. Name the specific concept or method that applies, but don't explain how to use it. Example: 'This is a quadratic equation. What methods do you know for solving quadratic equations?'",
    3: "Give a STRONG hint. Walk them through the first step or two of the solution process, but let them complete it. Example: 'To factor x² - 5x + 6, you need two numbers that multiply to 6 and add to -5. Can you think of what those numbers might be?'",
  };

  return `The student is working on: "${question}"

Conversation so far: ${conversationSummary}

The student has requested a hint (Level ${hintLevel}/3).

${levelDescriptions[hintLevel] || levelDescriptions[1]}

Provide exactly ONE hint at this level. Format it as a clear, concise statement. Keep it under 2 sentences.`;
}

/**
 * Prompt template for extracting logic map nodes from the conversation.
 *
 * @param question - The original question.
 * @param messages - The conversation messages so far.
 * @returns The logic map extraction prompt.
 */
export function buildLogicMapPrompt(
  question: string,
  messages: Array<{ role: string; content: string }>
): string {
  const conversation = messages
    .map((m) => `${m.role === "student" ? "Student" : "AI"}: ${m.content}`)
    .join("\n");

  return `Based on the following conversation about this problem: "${question}"

${conversation}

Extract the logical reasoning steps the student has taken so far. Return ONLY a JSON array of objects with this exact format:
[
  {"step": 1, "title": "Step title", "description": "Brief description", "completed": true},
  {"step": 2, "title": "Next step", "description": "Brief description", "completed": false}
]

Include completed steps the student has already demonstrated understanding of, AND the next logical steps they still need to take (marked as completed: false). Maximum 5 steps total.

Return ONLY the JSON array, no other text.`;
}

/**
 * Prompt template for generating the AI session summary.
 *
 * @param question - The original question.
 * @param messages - All conversation messages.
 * @param draft - The student's draft answer and reflections.
 * @returns The summary generation prompt.
 */
export function buildSummaryPrompt(
  question: string,
  messages: Array<{ role: string; content: string }>,
  draft: { answer: string; methodology: string; reflection: string }
): string {
  const conversation = messages
    .map((m) => `${m.role === "student" ? "Student" : "AI"}: ${m.content}`)
    .join("\n");

  return `Generate a brief summary of this Socratic learning session.

Original question: "${question}"
Student's final answer: "${draft.answer}"
Student's methodology: "${draft.methodology}"
Student's reflection: "${draft.reflection}"

Conversation history:
${conversation}

Write a 3-4 sentence summary covering:
1. What the student was trying to solve
2. The approach they took
3. Key moments where they showed understanding
4. Any areas where they needed extra help

Keep it factual and objective — this will be read by their teacher.`;
}
