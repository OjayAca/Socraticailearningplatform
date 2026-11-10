export class ProblemInputError extends Error {}
export function invalid(message: string): never { throw new ProblemInputError(message); }
export function bounded(value: number, limit = 1e12): number {
  if (!Number.isFinite(value) || Math.abs(value) > limit) invalid('A value or intermediate result exceeds the numerical limits.');
  return value;
}
/** Whitelisted notation only; unknown commands survive and are rejected by the grammar. */
export function normalizeNotation(text: string): string {
  return text.replace(/\\(?:left|right)(?![a-zA-Z])/g, '').replace(/\\[,;! ]/g, ' ')
    .replace(/\\(?:cdot|times)(?![a-zA-Z])/g, '*').replace(/\\div(?![a-zA-Z])/g, '/')
    .replace(/\\(?:land|wedge)(?![a-zA-Z])|∧/g, ' AND ').replace(/\\(?:lor|vee)(?![a-zA-Z])|∨/g, ' OR ')
    .replace(/\\(?:neg|lnot)(?![a-zA-Z])|¬/g, ' NOT ').replace(/\\cup(?![a-zA-Z])|∪/g, ' union ')
    .replace(/\\cap(?![a-zA-Z])|∩/g, ' intersection ').replace(/\\setminus(?![a-zA-Z])|∖/g, ' difference ')
    .replace(/\\([{}])/g, '$1').replace(/\^\{(\d+)\}/g, '^$1')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
}
export function evaluateFunction(expression: string, x: number): number {
  if (expression.length > 240) invalid('Function expressions are limited to 240 characters.');
  if (/[\dx)]\s+[\d.]|\.\s+\d/.test(expression)) invalid('Separate adjacent numbers with an explicit operator.');
  const source = expression.replace(/\s/g, '');
  const raw = source.match(/\d+(?:\.\d+)?|x|[()+*/^-]/g) ?? [];
  if (!source || raw.join('') !== source || raw.length > 100) invalid('Use numbers, x, parentheses, +, -, *, / and integer powers only (100 tokens maximum).');
  const tokens: string[] = [];
  raw.forEach((token, i) => {
    const previous = raw[i - 1];
    if (previous && (/^(?:\d|x|\))/.test(previous)) && (token === 'x' || token === '(')) tokens.push('*');
    tokens.push(token);
  });
  if (tokens.length > 100) invalid('Use at most 100 expression tokens.');
  let i = 0;
  const atom = (): number => {
    const token = tokens[i++];
    if (token === '(') { const value = sum(); if (tokens[i++] !== ')') invalid('Unclosed parentheses.'); return value; }
    if (token === 'x') return bounded(x, 1e6);
    if (!token || !/^\d/.test(token)) invalid('Malformed function expression.');
    return bounded(Number(token), 1e6);
  };
  const power = (): number => { let v = atom(); if (tokens[i] === '^') { i++; const exponent = tokens[i++]; if (!/^\d+$/.test(exponent ?? '') || Number(exponent) > 10) invalid('Powers must be literal integers from 0 to 10.'); v = bounded(v ** Number(exponent)); } return v; };
  const unary = (): number => { if (tokens[i] === '+' || tokens[i] === '-') { const sign = tokens[i++]; return (sign === '-' ? -1 : 1) * unary(); } return power(); };
  const product = (): number => { let v = unary(); while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++], r = unary(); if (op === '/' && r === 0) invalid('Division by zero is not defined.'); v = bounded(op === '*' ? v * r : v / r); } return v; };
  const sum = (): number => { let v = product(); while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++], r = product(); v = bounded(op === '+' ? v + r : v - r); } return v; };
  const result = sum(); if (i !== tokens.length) invalid('Malformed or unsupported function expression.'); return result;
}
export function evaluateLogic(expression: string, assignments: Record<string, boolean>): boolean {
  const source = expression.toLowerCase().trim();
  const tokens = source.match(/and\b|or\b|not\b|[a-z]|[()]/g) ?? [];
  if (source.length > 240 || tokens.length > 100 || tokens.join('') !== source.replace(/\s/g, '')) invalid('Use AND, OR, NOT, parentheses and single-letter assigned variables only.');
  let i = 0;
  const atom = (): boolean => { const t = tokens[i++]; if (t === 'not') return !atom(); if (t === '(') { const v = or(); if (tokens[i++] !== ')') invalid('Unclosed logical parentheses.'); return v; } if (!Object.hasOwn(assignments, t)) invalid('Every logical variable needs an explicit true/false assignment.'); return assignments[t]; };
  const and = (): boolean => { let v = atom(); while (tokens[i] === 'and') { i++; const r = atom(); v = v && r; } return v; };
  const or = (): boolean => { let v = and(); while (tokens[i] === 'or') { i++; const r = and(); v = v || r; } return v; };
  const result = or(); if (i !== tokens.length) invalid('Malformed logical expression.'); return result;
}
