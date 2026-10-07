export const PR_TITLE = 'Reporting page: filter, sort, archive stale orders';

// Rule packs are versioned institutional knowledge, not prompt folklore.
// `languages` limits a rule to the file types it was written for — the
// "rule matching by language" step, applied before any model is consulted.
// `reflection` names the deterministic re-check run before a comment ships:
// a rule may over-fire on guarded/defaulted code, and the pipeline refuses to
// post a comment the rule alone cannot justify.
export const RULES = [
  {
    id: 'npe-deref',
    name: 'Null pointer dereference on unchecked accessor',
    languages: ['java'],
    pattern: /\)\s*\.\s*(trim|toUpperCase|getName|length|getValue|substring|size|isEmpty)\s*\(/,
    severity: 'high',
    evidence: 'deref',
    reflection: 'null-guard',
    message: line =>
      `${line.s.trim()} — the accessor above may return null; it is dereferenced without a check. Validate the return value before use.`,
  },
  {
    id: 'sqli-string-interpolation',
    name: 'SQL injection via string interpolation',
    languages: ['xml', 'sql', 'java'],
    pattern: /\$\{\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\s*\}/,
    severity: 'critical',
    evidence: 'sqli',
    reflection: null,
    message: line =>
      `${line.s.trim()} — a caller-controlled value reaches the SQL text verbatim via \${…}. Bind it as a #{} parameter instead.`,
  },
  {
    id: 'xss-template-sink',
    name: 'Cross-site scripting sink in server-rendered template',
    languages: ['html'],
    pattern: /\$\{\s*(item|user|model|order|row)\.[A-Za-z_]\w*\s*\}/,
    severity: 'high',
    evidence: 'xss',
    reflection: null,
    message: line =>
      `${line.s.trim()} — an unescaped value is written into the response body. Escape it before render or the field becomes stored XSS.`,
  },
  {
    id: 'thread-unsafe-static-state',
    name: 'Thread-unsafe shared mutable state',
    languages: ['java'],
    pattern: /static\s+final\s+\w+(?:<[^>]+>)?\s+\w+\s*=\s*new\s+(?:ArrayList|HashMap|HashSet|LinkedList)\s*(?:<[^>]*>)?\s*\(/,
    severity: 'high',
    evidence: 'thread',
    reflection: null,
    message: line =>
      `${line.s.trim()} — a mutable singleton is shared by every request thread. Guard access or use a thread-safe collection.`,
  },
  {
    id: 'unbounded-update',
    name: 'Unbounded UPDATE without a WHERE clause',
    languages: ['sql'],
    pattern: /^\s*UPDATE\s+\w+\s+SET\b(?![\s\S]*\bWHERE\b)/i,
    severity: 'critical',
    evidence: 'where',
    reflection: null,
    message: line =>
      `${line.s.trim()} — rewrites every row in the table with no predicate. Scope it to the rows you mean or it is unrecoverable.`,
  },
  {
    id: 'param-validation',
    name: 'Request parameter accepted without validation',
    languages: ['java'],
    pattern: /@RequestParam\b/,
    severity: 'low',
    evidence: 'param',
    reflection: 'has-default-value',
    message: line =>
      `${line.s.trim()} — takes caller-supplied input. Validate range and type before it reaches the query.`,
  },
];

export function rulesFor(language) {
  return RULES.filter(rule => rule.languages.includes(language));
}

export function ruleById(id) {
  return RULES.find(rule => rule.id === id) || null;
}

// Deterministic rule dispatch. Only added lines are candidates — a comment on
// an unchanged line is noise by construction. Returns rule hits without
// applying reflection; the reflection pass is the caller's next step.
export function matchRules(file, addedLines) {
  const hits = [];
  for (const line of addedLines) {
    for (const rule of rulesFor(file.language)) {
      if (rule.pattern.test(line.s)) {
        hits.push({ ruleId: rule.id, file: file.path, line });
      }
    }
  }
  return hits;
}