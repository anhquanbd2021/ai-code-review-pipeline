import { DIFF } from './fixture.js';
import { TOKENS_PER_COMMENT } from './tokens.js';

// The baseline every deterministic pipeline beats: a general coding agent
// pointed at the PR. It wanders — it reads files in whatever order it thinks
// of, re-reads what it has seen, and leans on prose instead of position math.

const VAGUE_COMMENTS = [
  'Consider adding error handling here.',
  'Could this be null?',
  'Might be worth a unit test for this change.',
  'This looks like it could break under load.',
];

function seededPick(seed, arr) {
  return arr[seed % arr.length];
}

// `wander` models the agent's file selection. Crucially, it *cannot* know
// which files matter without reading them — so it reads them all, including
// the five untouched ones, and it reads some of them twice.
export function runGeneralAgent() {
  const events = [];
  let tokens = 0;
  const read = (file, note) => {
    const cost = file.tokens || tokensForAdded(file);
    tokens += cost;
    events.push({ kind: 'read', path: file.path, cost, note });
  };

  // Wanders: touches the untouched files first (wrong context), re-reads one.
  for (const f of DIFF.untouched) read(f, 'wander: opened to "get context"');
  read(DIFF.untouched[0], 'wander: re-read (forgot)');

  // Then the changed files, in stumble order.
  const changed = DIFF.files.slice(0, 2).concat(DIFF.files.slice(2).reverse());
  for (const f of changed) read(f, 'wander: skimmed diff hunk');

  // Produces five comments. Three are vibes, one is anchored to a wrong line,
  // one real finding on the wrong line — and the SQLi three files away is
  // never reached because the agent lost track before the repository file.
  const comments = [
    {
      file: 'src/main/java/com/acme/report/ReportController.java',
      line: 33,
      text: seededPick(0, VAGUE_COMMENTS),
      anchorValid: false,
      messageKind: 'vague',
    },
    {
      file: 'src/main/java/com/acme/report/ReportService.java',
      line: 47, // a line the diff never touched
      text: seededPick(1, VAGUE_COMMENTS),
      anchorValid: false,
      messageKind: 'vague',
    },
    {
      file: 'src/main/resources/templates/report.html',
      line: 47,
      text: 'This value might need escaping before render.',
      anchorValid: true,
      messageKind: 'xss',
      score: 'partial',
    },
    {
      file: 'src/main/java/com/acme/report/ReportService.java',
      line: 22, // guarded code — Object.requireNonNull above
      text: seededPick(2, VAGUE_COMMENTS),
      anchorValid: false,
      messageKind: 'vague',
    },
    {
      file: 'src/main/java/com/acme/report/RateLimiter.java',
      line: 20,
      text: 'Static state in a web app is usually a bad idea.',
      anchorValid: false,
      messageKind: 'thread',
      score: 'partial',
    },
  ];
  for (const c of comments) tokens += TOKENS_PER_COMMENT;

  // Score against ground truth.
  const findings = comments.filter(c => c.score === 'partial');
  const noise = comments.length - findings.length;
  const missed = ['sqli', 'npe'].map(id => id); // the SQLi, and the trim() NPE

  return {
    name: 'General agent',
    tokens,
    events,
    comments,
    totalComments: comments.length,
    findings,
    noise,
    missed,
    filesRead: changed.length + DIFF.untouched.length + 1,
    line: 61,
  };
}

function tokensForAdded(file) {
  return file.added ? file.added.reduce((s, l) => s + Math.ceil(l.s.length / 4), 0) : 120;
}