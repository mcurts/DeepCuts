/**
 * Enforces the parts of standards/code-comments.md that a scanner can check:
 *
 * - No inline decision IDs (TD-123, ADR-0042). A file may point at its governing
 *   decision once, in its first comment block; everywhere else the comment must make
 *   sense without opening the decision log.
 * - No history: the words in HISTORY below describe what code once was, and that
 *   belongs in git.
 *
 * The scanner understands strings, template literals and URLs, so `"https://…"` and
 * `'/* not a comment'` aren't mistaken for comments.
 */

export interface CommentProblem {
  line: number;
  message: string;
}

interface Comment {
  text: string;
  line: number;
  /** True for the file's header block: the first comment, with only whitespace before it. */
  first: boolean;
}

export const DECISION_ID = /\b(?:TD|ADR)-\d+\b/;
/**
 * Words that describe what the code once was, plus site-builder direction rounds ("round 11"),
 * which belong in direction.md. Phrases that also describe runtime conditions or UI copy ("a
 * theme that no longer exists", "nothing was changed", "values used to scale") are left out, so
 * the check has no false positives to argue with.
 */
export const HISTORY =
  /\b(?:previously|formerly|we changed|now uses|used to (?:be|have|do|show|ask|start|push|return|run|work|call|take|live|use)|(?:direction )?round \d+)\b/i;

/**
 * Extract comments from CSS, JS, TS, JSX, Astro or HTML text. CSS has no `//` comments
 * (and `url(//cdn…)` would look like one), so pass lineComments: false for CSS.
 */
export function extractComments(src: string, lineComments = true): Comment[] {
  const out: Comment[] = [];
  let i = 0;
  let line = 1;
  let sawCode = false;
  const push = (text: string, startLine: number) => {
    out.push({ text, line: startLine, first: out.length === 0 && !sawCode });
  };
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      const text = src.slice(i, stop);
      push(text, line);
      line += text.split('\n').length - 1;
      i = stop;
      continue;
    }
    if (c === '<' && src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      const stop = end === -1 ? src.length : end + 3;
      const text = src.slice(i, stop);
      push(text, line);
      line += text.split('\n').length - 1;
      i = stop;
      continue;
    }
    // `//` starts a comment unless it follows a word character or colon (a URL like https://).
    if (lineComments && c === '/' && next === '/' && !/[\w:]/.test(src[i - 1] ?? '')) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      push(src.slice(i, stop), line);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      sawCode = true;
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n') {
          if (c !== '`') break;
          line++;
        }
        j++;
      }
      i = j + 1;
      continue;
    }
    if (!/\s/.test(c)) sawCode = true;
    i++;
  }
  // Consecutive line comments at the top of a file form one header block.
  for (let k = 1; k < out.length && out[k - 1]!.first && out[k]!.line === out[k - 1]!.line + 1; k++) {
    if (out[k]!.text.startsWith('//')) out[k]!.first = true;
  }
  return out;
}

/** Check one file's text. `file` picks the comment syntax by extension. */
export function checkComments(src: string, file: string): CommentProblem[] {
  const problems: CommentProblem[] = [];
  for (const c of extractComments(src, !file.endsWith('.css'))) {
    const lines = c.text.split('\n');
    lines.forEach((text, offset) => {
      const line = c.line + offset;
      if (!c.first && DECISION_ID.test(text)) {
        problems.push({ line, message: 'decision ID in an inline comment; explain the reason here, and point at the decision once in the file header.' });
      }
      if (HISTORY.test(text)) problems.push({ line, message: 'history in a comment; that belongs in the commit message or CHANGELOG.' });
    });
  }
  return problems;
}
