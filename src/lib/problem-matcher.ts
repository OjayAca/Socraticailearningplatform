import { mindGuideProblems } from "@/data/mindguide-problems";
import type {
  MindGuideDifficulty,
  MindGuideProblem,
  Subject,
  Topic,
} from "@/types";

export type ProblemMatchConfidence = "high" | "medium";

export interface ProblemMatchResult {
  problem: MindGuideProblem;
  confidence: ProblemMatchConfidence;
  score: number;
  reasons: string[];
}

interface ScoredProblemMatch extends ProblemMatchResult {
  strongEvidenceCount: number;
}

const HIGH_CONFIDENCE_SCORE = 60;
const MEDIUM_CONFIDENCE_SCORE = 30;
const CLOSE_TIE_SCORE_GAP = 8;

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "been",
  "before",
  "being",
  "best",
  "both",
  "can",
  "choose",
  "day",
  "does",
  "each",
  "find",
  "for",
  "from",
  "given",
  "has",
  "have",
  "how",
  "into",
  "must",
  "needs",
  "not",
  "one",
  "out",
  "possible",
  "problem",
  "row",
  "same",
  "the",
  "then",
  "there",
  "this",
  "three",
  "through",
  "value",
  "values",
  "what",
  "when",
  "which",
  "with",
]);

const LOGIC_OPERATORS = ["and", "or", "not", "implies", "implication"];

export function matchToBankProblem(
  subject: Subject,
  topic: Topic,
  studentQuestion: string,
  preferredDifficulty?: MindGuideDifficulty
): ProblemMatchResult | null {
  const candidates = mindGuideProblems.filter(
    (problem) => problem.subject === subject && problem.topic === topic
  );

  if (candidates.length === 0) return null;

  const scoredMatches = candidates
    .map((problem) => scoreProblem(problem, studentQuestion))
    .filter((match) => match.score >= MEDIUM_CONFIDENCE_SCORE)
    .sort((a, b) => b.score - a.score);

  const topMatch = scoredMatches[0];
  if (!topMatch) return null;

  const preferredMatch = preferredDifficulty
    ? scoredMatches.find(
        (match) =>
          match.problem.difficulty === preferredDifficulty &&
          topMatch.score - match.score <= CLOSE_TIE_SCORE_GAP
      )
    : undefined;
  const selectedMatch = preferredMatch ?? topMatch;
  const nextMatch = scoredMatches[1];
  const closeTie =
    nextMatch && selectedMatch.score - nextMatch.score < CLOSE_TIE_SCORE_GAP;
  const preferenceApplied = Boolean(
    preferredMatch && preferredMatch.problem.id !== topMatch.problem.id
  );

  if (closeTie || preferenceApplied) {
    return {
      problem: selectedMatch.problem,
      confidence: "medium",
      score: selectedMatch.score,
      reasons: [
        ...selectedMatch.reasons,
        closeTie ? "Close match score tie; downgraded to medium confidence." : "",
        preferenceApplied
          ? "Preferred adaptive difficulty was used because its match score was close to the top text match."
          : "",
      ].filter(Boolean),
    };
  }

  if (preferredMatch) {
    return {
      problem: preferredMatch.problem,
      confidence: preferredMatch.confidence,
      score: preferredMatch.score,
      reasons: [
        ...preferredMatch.reasons,
        "Preferred adaptive difficulty matched the top scoring problem.",
      ],
    };
  }

  return selectedMatch;
}

function scoreProblem(
  problem: MindGuideProblem,
  studentQuestion: string
): ScoredProblemMatch {
  const reasons: string[] = [];
  let score = 0;
  let strongEvidenceCount = 0;

  const numberEvidence = getNumberEvidence(problem.problemText, studentQuestion);
  score += numberEvidence.score;
  if (numberEvidence.isStrong) {
    strongEvidenceCount += 1;
    reasons.push(numberEvidence.reason);
  }

  const conceptEvidence = getConceptEvidence(problem, studentQuestion);
  score += conceptEvidence.score;
  if (conceptEvidence.isStrong) {
    strongEvidenceCount += 1;
    reasons.push(conceptEvidence.reason);
  }

  const keywordEvidence = getKeywordEvidence(problem, studentQuestion);
  score += keywordEvidence.score;
  if (keywordEvidence.isStrong) {
    strongEvidenceCount += 1;
    reasons.push(keywordEvidence.reason);
  }

  const logicEvidence = getLogicEvidence(problem, studentQuestion);
  score += logicEvidence.score;
  if (logicEvidence.isStrong) {
    strongEvidenceCount += 1;
    reasons.push(logicEvidence.reason);
  }

  const confidence =
    score >= HIGH_CONFIDENCE_SCORE && strongEvidenceCount >= 2
      ? "high"
      : "medium";

  return {
    problem,
    confidence,
    score,
    reasons,
    strongEvidenceCount,
  };
}

function getNumberEvidence(problemText: string, studentQuestion: string) {
  const problemNumbers = extractNumericTokens(problemText);
  const questionNumbers = extractNumericTokens(studentQuestion);

  if (problemNumbers.size === 0) {
    return { score: 0, isStrong: false, reason: "" };
  }

  const sharedCount = countIntersection(problemNumbers, questionNumbers);
  const sharedRatio = sharedCount / problemNumbers.size;
  const score = Math.round(sharedRatio * 35);

  return {
    score,
    isStrong: sharedRatio >= 0.6,
    reason: `${sharedCount} of ${problemNumbers.size} problem number groups matched.`,
  };
}

function getConceptEvidence(
  problem: MindGuideProblem,
  studentQuestion: string
) {
  const normalizedQuestion = normalizeForPhraseMatch(studentQuestion);
  const matchedConcepts = problem.expectedConcepts.filter((concept) =>
    phraseOrTokenMatches(normalizedQuestion, concept)
  );
  const score = Math.min(matchedConcepts.length * 12, 30);

  return {
    score,
    isStrong: matchedConcepts.length > 0,
    reason: `Expected concept matched: ${matchedConcepts.join(", ")}.`,
  };
}

function getKeywordEvidence(
  problem: MindGuideProblem,
  studentQuestion: string
) {
  const problemKeywords = extractMeaningfulKeywords(
    [
      problem.problemText,
      problem.expectedConcepts.join(" "),
      problem.requiredFormula,
      problem.requiredTheorem,
    ]
      .filter(Boolean)
      .join(" ")
  );
  const questionKeywords = extractMeaningfulKeywords(studentQuestion);
  const sharedKeywords = Array.from(problemKeywords).filter((keyword) =>
    questionKeywords.has(keyword)
  );
  const score = Math.min(sharedKeywords.length * 4, 24);

  return {
    score,
    isStrong: sharedKeywords.length >= 3,
    reason: `Shared content keywords: ${sharedKeywords.slice(0, 6).join(", ")}.`,
  };
}

function getLogicEvidence(
  problem: MindGuideProblem,
  studentQuestion: string
) {
  if (problem.subject !== "Discrete Mathematics") {
    return { score: 0, isStrong: false, reason: "" };
  }

  const problemSymbols = extractLogicSymbols(problem.problemText);
  const questionSymbols = extractLogicSymbols(studentQuestion);
  const symbolMatches = countIntersection(problemSymbols, questionSymbols);
  const problemOperators = extractLogicOperators(problem.problemText);
  const questionOperators = extractLogicOperators(studentQuestion);
  const operatorMatches = countIntersection(problemOperators, questionOperators);
  const truthAssignmentsAlign = haveAlignedTruthAssignments(
    problem.problemText,
    studentQuestion
  );

  let score = 0;
  if (symbolMatches > 0) score += Math.min(symbolMatches * 5, 10);
  if (operatorMatches > 0) score += Math.min(operatorMatches * 5, 10);
  if (truthAssignmentsAlign) score += 15;

  const isStrong =
    truthAssignmentsAlign || (symbolMatches >= 2 && operatorMatches >= 1);

  return {
    score: Math.min(score, 25),
    isStrong,
    reason: truthAssignmentsAlign
      ? "Logic symbols and truth assignments aligned."
      : "Logic symbols and operators aligned.",
  };
}

function extractNumericTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  let remainingValue = value.toLowerCase();

  for (const match of remainingValue.matchAll(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/g)) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator !== 0) {
      tokens.add(formatNumberToken(numerator / denominator));
    }
  }
  remainingValue = remainingValue.replace(
    /\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b/g,
    " "
  );

  for (const match of remainingValue.matchAll(/\b(\d+(?:\.\d+)?)\s*%/g)) {
    tokens.add(formatNumberToken(Number(match[1]) / 100));
  }
  remainingValue = remainingValue.replace(/\b\d+(?:\.\d+)?\s*%/g, " ");

  for (const match of remainingValue.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    tokens.add(formatNumberToken(Number(match[0])));
  }

  return tokens;
}

function extractMeaningfulKeywords(value: string): Set<string> {
  return new Set(
    normalizeForPhraseMatch(value)
      .split(" ")
      .map(stemToken)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  );
}

function phraseOrTokenMatches(normalizedText: string, phrase: string): boolean {
  const normalizedPhrase = normalizeForPhraseMatch(phrase);
  if (!normalizedPhrase) return false;
  if (` ${normalizedText} `.includes(` ${normalizedPhrase} `)) return true;

  return normalizedPhrase
    .split(" ")
    .map(stemToken)
    .filter((token) => token.length > 3 && !STOP_WORDS.has(token))
    .some((token) => ` ${normalizedText} `.includes(` ${token} `));
}

function extractLogicSymbols(value: string): Set<string> {
  const symbols = new Set<string>();
  for (const match of normalizeForLogic(value).matchAll(/\b[pqrst]\b/g)) {
    symbols.add(match[0]);
  }
  return symbols;
}

function extractLogicOperators(value: string): Set<string> {
  const normalizedValue = normalizeForLogic(value);
  return new Set(
    LOGIC_OPERATORS.filter((operator) =>
      ` ${normalizedValue} `.includes(` ${operator} `)
    )
  );
}

function haveAlignedTruthAssignments(
  problemText: string,
  studentQuestion: string
): boolean {
  const problemAssignments = extractTruthAssignments(problemText);
  const questionAssignments = extractTruthAssignments(studentQuestion);

  if (problemAssignments.size === 0 || questionAssignments.size === 0) {
    return false;
  }

  return Array.from(problemAssignments).every((assignment) =>
    questionAssignments.has(assignment)
  );
}

function extractTruthAssignments(value: string): Set<string> {
  const assignments = new Set<string>();
  const normalizedValue = normalizeForLogic(value);
  const pattern = /\b([pqrst])\s*(is|=|be)\s*(true|false)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedValue)) !== null) {
    assignments.add(`${match[1]}:${match[3]}`);
  }

  return assignments;
}

function countIntersection<T>(first: Set<T>, second: Set<T>): number {
  let count = 0;
  for (const value of first) {
    if (second.has(value)) count += 1;
  }
  return count;
}

function normalizeForPhraseMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/->/g, " implies ")
    .replace(/[^a-z0-9\s/.%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForLogic(value: string): string {
  return normalizeForPhraseMatch(value)
    .replace(/\biff\b/g, " equivalence ")
    .replace(/\bif\s+and\s+only\s+if\b/g, " equivalence ");
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function formatNumberToken(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6);
}
