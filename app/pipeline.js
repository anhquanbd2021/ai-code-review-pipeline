import { DIFF, GROUND_TRUTH } from './fixture.js';
import { rulesFor, ruleById } from './rules.js';
import { tokensForFile, TOKENS_PER_COMMENT } from './tokens.js';

// The deterministic harness. Everything here is code, not a model: file
// selection is a diff filter, grouping is a directory lookup, rule dispatch
// is a language match, anchoring is position math, and reflection is a
// re-check of a comment before it ships. The LLM is only asked to write the
// insight on top of code that already decided *what* to look at and *where*.

// The LLM reads each selected file's full context once, for judgment the diff
// hides. This is the only per-file cost the pipeline pays beyond reading the
// added lines — and it never touches an untouched file.
const WHOLE_FILE_CONTEXT_TOKENS = 300;

// ---- File selection: which files belong in this review, from the diff ----
export function selectChangedFiles() {
  return DIFF.files.filter((f) => f.status === 'modified');
}

// ---- Grouping: batch related changed files into coherent units ----
// Java sources form one unit (service + repository + controller + limiter),
// resources form others (mapper xml, template html). The model sees coherent
// neighbours instead of a flat list.
export function groupFiles(files) {
  const groups = new Map();
  for (const f of files) {
    const key = f.language === 'java' ? 'java' : `resources:${f.language}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return [...groups.entries()].map(([id, fileList]) => ({ id, files: fileList }));
}

// ---- Anchoring: diff-position math done in code, never in prose ----
// A comment may only land on a line the diff actually changed. Returns the
// line number if it is a real changed line, otherwise null.
export function diffLineToFile(file, line) {
  return file.changed.includes(line) ? line : null;
}

// ---- Reflection: deterministic re-check before a comment is posted ----
// Returns a drop reason string, or null to keep the comment.
export function reflect(rule, file, line) {
  if (!rule.reflection) return null;

  if (rule.reflection === 'has-default-value') {
    if (/defaultValue\s*=/.test(line.s)) {
      return 'parameter has an explicit default and is framework-bounded — no finding';
    }
    return null;
  }

  if (rule.reflection === 'null-guard') {
    // A null-guard on the *receiver* would make this safe. Guarding a sibling
    // (e.g. requireNonNull(region)) does not protect the return of
    // mapper.label(region) — so a guard anywhere in context is not enough; the
    // dereferenced accessor's own result must be the thing that is checked.
    const receiver = line.s.match(/^\s*(?:return\s+)?([\w.]+\([^)]*\))\.\w+\s*\(/);
    if (receiver) {
      const target = receiver[1];
      const nearby = [...file.context, ...file.contextAfter].map((c) => c.s).join('\n');
      const guarded =
        new RegExp(`requireNonNull\\(\\s*${escapeRe(target)}`).test(nearby) ||
        new RegExp(`${escapeRe(target)}\\s*!=\\s*null`).test(nearby);
      if (guarded) return 'the dereferenced accessor is already null-guarded above';
    }
    return null;
  }

  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- The full pipeline: select -> group -> match -> anchor -> reflect ----
// Options let the demo UI toggle the plumbing live: `disabledRules` removes
// rules from the pack (institutional knowledge gone), `reflection: false`
// ships every generated comment without the pre-post re-check.
export function runPipeline({ disabledRules = [], reflection = true } = {}) {
  const events = [];
  const files = selectChangedFiles();
  const groups = groupFiles(files);
  let tokens = 0;

  // Deterministic read of every changed file, exactly once, added lines only.
  for (const f of files) {
    const cost = tokensForFile(f.path, f.added);
    tokens += cost;
    events.push({ kind: 'read', path: f.path, cost, note: 'added lines, once' });
  }

  // LLM reads each selected file's full context once — the judgment step.
  for (const f of files) {
    tokens += WHOLE_FILE_CONTEXT_TOKENS;
    events.push({ kind: 'judge', path: f.path, cost: WHOLE_FILE_CONTEXT_TOKENS, note: 'whole-file context, once' });
  }

  // Rule dispatch per language, over added lines only.
  const byPath = new Map(files.map((f) => [f.path, f]));
  const hits = [];
  for (const f of files) {
    for (const line of f.added) {
      for (const rule of rulesFor(f.language)) {
        if (disabledRules.includes(rule.id)) continue;
        if (rule.pattern.test(line.s)) {
          hits.push({ ruleId: rule.id, file: f.path, line });
        }
      }
    }
  }

  // Anchor + reflect. A dropped comment still cost its generation tokens, but
  // never ships — that is the point of the reflection pass.
  const comments = [];
  let dropped = 0;
  for (const hit of hits) {
    const rule = ruleById(hit.ruleId);
    const file = byPath.get(hit.file);
    const anchored = diffLineToFile(file, hit.line.line);
    const dropReason = reflection ? reflect(rule, file, hit.line) : null;
    tokens += TOKENS_PER_COMMENT;
    if (dropReason) {
      dropped += 1;
      events.push({ kind: 'reflection-drop', path: hit.file, line: hit.line.line, ruleId: rule.id, reason: dropReason });
      continue;
    }
    comments.push({
      file: hit.file,
      line: anchored,
      text: rule.message(hit.line),
      anchorValid: anchored !== null,
      ruleId: rule.id,
      severity: rule.severity,
      messageKind: rule.evidence,
      score: 'hit',
    });
  }

  // Score against ground truth, not self-report: a posted comment that names
  // no real defect is noise (what reflection exists to prevent), and a defect
  // no comment lands on is missed (what a gutted rule pack causes).
  const isReal = (c) => GROUND_TRUTH.some((g) => g.file === c.file && g.line === c.line);
  for (const c of comments) c.score = isReal(c) ? 'hit' : 'noise';
  const findings = comments.filter(isReal);
  const missed = GROUND_TRUTH
    .filter((g) => !findings.some((c) => c.file === g.file && c.line === g.line))
    .map((g) => g.id);

  return {
    name: 'Deterministic pipeline + LLM',
    tokens,
    events,
    groups,
    comments,
    totalComments: comments.length,
    findings,
    noise: comments.length - findings.length,
    missed,
    dropped,
    filesRead: files.length,
  };
}