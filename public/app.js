import { review, summarize, formatTokens, GROUND_TRUTH, DIFF, RULES } from '/app/index.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => `&#${m.charCodeAt(0)};`);

const SEVERITY_TAG = { critical: 'tag-bad', high: 'tag-warn', low: 'tag-info' };

function renderComment(c) {
  const cls = `comment ${c.anchorValid ? 'anchored' : 'misanchored'}${c.score === 'noise' ? ' noise' : ''}`;
  const tags = [
    `<span class="tag ${c.anchorValid ? 'tag-ok' : 'tag-bad'}">${c.anchorValid ? 'anchored' : 'MIS-ANCHORED'}</span>`,
  ];
  if (c.severity) tags.push(`<span class="tag ${SEVERITY_TAG[c.severity] || 'tag-info'}">${c.severity}</span>`);
  if (c.score === 'noise') tags.push('<span class="tag tag-warn">noise</span>');
  return `<li class="${cls}">
    <div class="comment-head"><span class="file">${esc(c.file)}</span><span class="line">:${esc(c.line)}</span>
      ${tags.join('')}</div>
    <p class="comment-text">${esc(c.text)}</p>
  </li>`;
}

// Rule toggles: every rule whose languages appear in this fixture's diff.
const fixtureLangs = new Set(DIFF.files.map((f) => f.language));
const DEMO_RULES = RULES.filter((r) => r.languages.some((l) => fixtureLangs.has(l)));

$('rule-toggles').innerHTML = DEMO_RULES.map((r) => `
  <label class="control" for="rule-${r.id}">
    <input type="checkbox" class="rule-toggle" id="rule-${r.id}" checked>
    <span class="control-text"><b>${esc(r.name)}</b>
      <span class="control-sub">${esc(r.severity)} · ${esc(r.languages.join(', '))}</span></span>
  </label>`).join('');

function currentOptions() {
  return {
    reflection: $('opt-reflection').checked,
    disabledRules: DEMO_RULES.filter((r) => !$(`rule-${r.id}`).checked).map((r) => r.id),
  };
}

function render() {
  const r = review(currentOptions());
  const s = summarize(r);

  const pct = (n) => `${(n * 100).toFixed(0)}%`;
  $('fixture-title').textContent = `PR "${DIFF.head}"`;
  $('fixture-meta').textContent =
    `${DIFF.files.length} changed files · ${GROUND_TRUTH.length} seeded real defects · ${DIFF.untouched.length} untouched files`;

  // Agent column
  $('agent-tokens').textContent = formatTokens(s.agentTokens);
  $('agent-files').textContent = s.filesReadAgent;
  $('agent-comments').textContent = s.agentFindings;
  $('agent-noise').textContent = s.agentNoise;
  $('agent-precision').textContent = pct(s.agentPrecision);
  $('agent-recall').textContent = pct(s.agentRecall);
  $('agent-missed').textContent = s.agentMissed.length
    ? s.agentMissed.join(', ') : 'none';
  $('agent-comments-list').innerHTML = r.agent.comments.map(renderComment).join('');

  // Pipeline column
  $('pipe-tokens').textContent = formatTokens(s.pipelineTokens);
  $('pipe-files').textContent = s.filesReadPipeline;
  $('pipe-comments').textContent = s.pipelineFindings;
  $('pipe-noise').textContent = s.pipelineNoise;
  $('pipe-precision').textContent = pct(s.pipelinePrecision);
  $('pipe-recall').textContent = pct(s.pipelineRecall);
  $('pipe-missed').textContent = s.pipelineMissed.length
    ? s.pipelineMissed.join(', ') : 'none';
  $('pipe-comments-list').innerHTML = r.pipeline.comments.map(renderComment).join('');
  $('pipe-drops').innerHTML = r.pipeline.events
    .filter((e) => e.kind === 'reflection-drop')
    .map((e) => `<li class="drop">reflection dropped <span class="file">${esc(e.path)}:${esc(e.line)}</span> — ${esc(e.reason)}</li>`)
    .join('');

  // Verdict
  $('ratio').textContent = s.tokenRatio.toFixed(1);
  $('ratio-pct').textContent = `${(100 / s.tokenRatio).toFixed(0)}%`;
}

document.querySelector('.controls').addEventListener('change', render);
render();
