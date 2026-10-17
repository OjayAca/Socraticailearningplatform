// Authoritative user-validated curriculum. Content approval is a separate workflow.
export interface CurriculumSubtopic { id: string; name: string; children?: CurriculumSubtopic[] }
const matrix = {
  "Quantitative Methods": {
    "Functions": [
      "Images and Pre-images",
      "Types and Properties of Functions",
      "Limit of a Function",
      "Derivative of a Function",
      "Maxima and Minima",
      "Graph of a Function",
      "Asymptotes",
      "Inflection Points",
      "Antiderivative of a Function"
    ],
    "Descriptive Statistics": [
      "Basic Concepts of Statistics",
      "Collection, Organization, and Presentation of Data",
      "Frequency Distribution",
      {
        "name": "Descriptive Measures",
        "children": [
          "Central Tendency",
          "Dispersion",
          "Position",
          "Skewness",
          "Kurtosis"
        ]
      }
    ],
    "Introduction to Probability": [
      "Experiments and the Sample Space",
      "Assigning Probabilities to Experimental Outcomes",
      "Events and Their Probabilities",
      "Some Basic Relationships of Probability",
      "Bayes' Theorem"
    ],
    "Probability Distributions": [
      "Random Variables",
      "Discrete Probability Distribution",
      "Continuous Probability Distribution",
      "Binomial Probability Distribution",
      "Poisson Probability Distribution",
      "Hypergeometric Probability Distribution",
      "Trinomial Probability Distribution",
      "Normal Probability Distribution"
    ],
    "Introduction to Decision Making": [
      "Problem Solving and Decision Making",
      "Decision Processes: Descriptive and Prescriptive Orientation",
      "Decision Making Tools and Models",
      "Quantitative and Qualitative Methods in Practice"
    ],
    "Decision Analysis": [
      "Problem Formulation",
      "Decision Making With and Without Probabilities",
      "Decision Analysis With Sample Information",
      "Computing Branch Probabilities"
    ]
  },
  "Discrete Mathematics": {
    "Speaking Mathematically": [
      "Variables",
      "Sets",
      "Relations",
      "Functions"
    ],
    "Set Theory": [
      "Basic Concepts of Sets",
      "Set Notation",
      "Set Operations",
      "Venn Diagrams",
      "Applications of Sets",
      "Cartesian Products",
      "Equivalence Relations",
      "Equivalence Classes"
    ],
    "Relations and Functions": [
      "Concepts of Relations",
      "Properties of Relations",
      "Operations on Relations",
      "Applications of Relations",
      "Function Tests",
      "Mappings",
      "Graphs of Functions",
      "Expressions of Functions",
      "Vertical-Line Test"
    ],
    "Logic": [
      "Propositions / Statements",
      "Logical Connectives",
      "Truth Tables",
      "Predicates",
      "Quantifiers",
      "Propositional Calculus",
      "Predicate Calculus",
      "Statement Structure",
      "Proof and Disproof",
      "Direct Proof",
      "Indirect Proof",
      "Proof by Contradiction",
      "Proof by Cases"
    ],
    "Combinatorics": [
      "Basic Counting Principles",
      "Permutations",
      "Combinations",
      "Counting Applications"
    ],
    "Discrete Probability": [
      "Events",
      "Discrete Random Variables",
      "Probability Distributions"
    ]
  }
} as const;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const CURRICULUM_VERSION = "validated-2026-10-16";
export const VALIDATED_SUBJECTS = Object.keys(matrix).map(name => ({ id: slug(name), name, description: name }));
export const VALIDATED_TOPICS = Object.entries(matrix).flatMap(([subject, topics]) => Object.entries(topics).map(([name, children]) => ({
  id: slug(`${subject}-${name}`), subjectId: slug(subject), subject, name,
  subtopics: children.map((child: string | { name: string; children: readonly string[] }) => {
    const title = typeof child === "string" ? child : child.name;
    const id = slug(`${subject}-${name}-${title}`);
    return { id, name: title, ...(typeof child === "string" ? {} : { children: child.children.map(value => ({ id: `${id}-${slug(value)}`, name: value })) }) };
  }) as CurriculumSubtopic[],
})));
export const SUBJECT_TOPICS = Object.fromEntries(Object.entries(matrix).map(([name, topics]) => [name, Object.keys(topics)])) as Record<keyof typeof matrix, string[]>;
export function isValidatedTopic(id: string, data: any): boolean {
  const topic = VALIDATED_TOPICS.find(item => item.id === id);
  return !!topic && data?.name === topic.name && data?.subjectId === topic.subjectId && data?.subject === topic.subject;
}
export function assertCurriculumContent(collection: string, id: string, value: any) {
  if (["subjects", "topics"].includes(collection) && value.status !== "approved") throw new Error("Validated curriculum entries must remain active; archive learning content separately.");
  if (collection === "subjects" && !VALIDATED_SUBJECTS.some(item => item.id === id && item.name === value.name)) throw new Error("Choose an exact validated subject and stable ID.");
  if (collection === "topics") {
    const topic = VALIDATED_TOPICS.find(item => item.id === id);
    if (!topic || !isValidatedTopic(id, value)) throw new Error("Choose an exact validated topic and parent subject.");
    if (value.subtopics && JSON.stringify(value.subtopics) !== JSON.stringify(topic.subtopics)) throw new Error("Subtopics must match the validated hierarchy.");
    value.subtopics = topic.subtopics;
  }
  if (collection === "problems" && !VALIDATED_TOPICS.some(item => item.id === value.topicId && item.subjectId === value.subjectId && item.subject === value.subject && item.name === value.topic)) throw new Error("Associate this content with a validated subject and topic.");
  if (collection === "formula_theorem_references" && value.supportedTopics?.some((name: string) => !VALIDATED_TOPICS.some(item => item.subject === value.domain && item.name === name))) throw new Error("References must use validated topics within their subject.");
  if (collection === "difficulty_policies" && value.topicId && !VALIDATED_TOPICS.some(item => item.id === value.topicId && (!value.subjectId || item.subjectId === value.subjectId))) throw new Error("Choose a validated topic for this policy.");
}
