/**
 * Shared LaTeX command denylist using word-boundary lookahead so valid commands such as
 * `\displaystyle` or `\textstyle` are preserved while dangerous macros are rejected.
 */
export const DANGEROUS_LATEX_RE =
  /\\(?:href|url|includegraphics|htmlClass|htmlId|htmlData|style|class|def|gdef|edef|xdef|newcommand|renewcommand|let)(?![a-zA-Z])|\\begin\s*\{\s*(?:tikzpicture|picture)\s*\}/i;

/**
 * Removes non-printing ASCII control characters (excluding `\t`, `\n`, `\r`) from untrusted text.
 *
 * @param value - Input text string to sanitize.
 * @returns Text with unsafe control characters removed.
 */
export function stripControlCharacters(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    const isControl = (code < 32 && !isAllowedWhitespace) || code === 127;
    if (!isControl) {
      result += value[i];
    }
  }
  return result;
}

/**
 * Checks whether text contains any ASCII control character (including tabs/newlines/null).
 *
 * @param value - Input string to inspect.
 * @returns True if any ASCII control character is present.
 */
export function hasAsciiControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}
