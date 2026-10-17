import { CUSTOM_FAMILIES, type CustomFamily } from './custom-problem-config';
import { bounded, invalid, normalizeNotation } from './custom-problem-parser';
export type VerifiedGivens = { operation: string; values: number[]; expression?: string; assignments?: Record<string, boolean>; right?: number[] };
const num = '[+-]?\\d+(?:\\.\\d+)?';
function dataset(text: string, empty = false): number[] {
  if (empty && !text.trim()) return [];
  const cleaned = text.trim().replace(/,\s*and\s+/gi, ',').replace(/\s+and\s+/gi, ',');
  if (!new RegExp(`^${num}(?:\\s*,\\s*${num})*$`).test(cleaned)) invalid('Use a complete comma-separated numerical dataset, for example 2, -4, and 6.');
  const values = cleaned.split(',').map(Number);
  if (values.length > 50) invalid('Use at most 50 values.');
  values.forEach(v => bounded(v, 1e6)); return values;
}
export function parseVerifiedProblem(question: string, topic: string): VerifiedGivens {
  const text = normalizeNotation(question).trim().replace(/[?.]$/, '').trim();
  let givens: VerifiedGivens | undefined, family: CustomFamily | undefined;
  const forward = new RegExp(`^(?:Given\\s+)?f\\(x\\)\\s*=\\s*(.+?),\\s*find\\s+f\\((${num})\\)$`, 'i').exec(text);
  const reverse = new RegExp(`^Find\\s+f\\((${num})\\)\\s+if\\s+f\\(x\\)\\s*=\\s*(.+)$`, 'i').exec(text);
  if (forward || reverse) { family = 'functions'; givens = { operation: 'function evaluation', expression: (forward?.[1] ?? reverse![2]).trim(), values: [bounded(Number(forward?.[2] ?? reverse![1]), 1e6)] }; }
  const stats = /^(?:(?:what is|find|calculate|compute)\s+(?:the\s+)?)?(mean|median|mode|range|(?:population|sample) (?:variance|standard deviation)|product|permutation|combination|probability)(?:\s*:\s*|\s+(?:of|for)\s+)(?:the scores\s+|scores\s+)?(.+)$/i.exec(text);
  const probability = /^Find the probability of (\d+) favorable outcomes out of (\d+) equally likely outcomes$/i.exec(text);
  if (probability) { family = 'probability'; givens = { operation: 'probability', values: [Number(probability[1]), Number(probability[2])] }; }
  else if (stats) { const operation = stats[1].toLowerCase(); family = ['product','permutation','combination'].includes(operation) ? 'counting' : operation === 'probability' ? 'probability' : 'statistics'; givens = { operation, values: dataset(stats[2]) }; }
  const choose = /^How many combinations are possible when choosing (\d+) from (\d+)$/i.exec(text);
  if (choose) { family = 'counting'; givens = { operation: 'combination', values: [Number(choose[2]), Number(choose[1])] }; }
  const words = /^(?:Find the )?(union|intersection|difference) of \{([^{}]*)\} and \{([^{}]*)\}$/i.exec(text);
  const notation = /^\{([^{}]*)\}\s*(union|intersection|difference)\s*\{([^{}]*)\}$/i.exec(text);
  if (words || notation) { family = 'sets'; givens = { operation: (words?.[1] ?? notation![2]).toLowerCase(), values: dataset(words?.[2] ?? notation![1], true), right: dataset(words?.[3] ?? notation![3], true) }; }
  const logic = /^Evaluate (.+) when (.+)$/i.exec(text);
  if (logic) {
    family = 'logic'; const assignments: Record<string, boolean> = {};
    for (const entry of logic[2].split(/\s+and\s+|\s*,\s*/i)) {
      const match = /^([a-z])\s*=\s*(true|false)$/i.exec(entry.trim());
      if (!match || Object.hasOwn(assignments, match[1].toLowerCase())) invalid('Provide each assignment exactly once, for example p=true and q=false.');
      assignments[match[1].toLowerCase()] = match[2].toLowerCase() === 'true';
    }
    givens = { operation: 'logic', expression: logic[1], assignments, values: [] };
  }
  if (!givens || !family) invalid('Unsupported or malformed problem. Use the selected topic example format with all values and the requested operation.');
  if (!(CUSTOM_FAMILIES[family].topics as readonly string[]).includes(topic)) invalid('This problem does not match the selected topic. Choose the appropriate approved topic.');
  const { operation, values } = givens;
  if (family === 'counting' && (values.some(v => !Number.isInteger(v) || v < 0 || v > 100) || (operation !== 'product' && (values.length !== 2 || values[1] > values[0])))) invalid('Counting requires integers from 0 to 100; use n, r with r <= n.');
  if (family === 'probability' && (values.length !== 2 || values.some(v => !Number.isInteger(v) || v < 0 || v > 1e6) || values[1] === 0 || values[0] > values[1])) invalid('Use favorable, total integer counts with 0 <= favorable <= total and total > 0.');
  if (operation.startsWith('sample') && values.length < 2) invalid('Sample dispersion requires at least two values.');
  return givens;
}
