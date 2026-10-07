import { review, summarize, formatTokens, GROUND_TRUTH, DIFF } from '../app/index.js';

const { agent, pipeline, tokenRatio } = review();
const s = summarize(review());

console.log('AI Code Review Lab — deterministic pipeline vs general agent\n');

console.log(`Fixture: PR "${'feature/report-filter'}" — ${DIFF.files.length} changed files, ${GROUND_TRUTH.length} seeded real defects\n`);

console.log('=== General agent ===');
console.log(`  tokens burned:   ${agent.tokens} (${formatTokens(agent.tokens)})`);
console.log(`  files read:      ${agent.filesRead} (includes ${DIFF.untouched.length} untouched + 1 re-read)`);
console.log(`  comments posted: ${agent.totalComments}`);
console.log(`  real findings:   ${agent.findings.length}  (precision ${(s.agentPrecision*100).toFixed(0)}%, recall ${(s.agentRecall*100).toFixed(0)}%)`);
console.log(`  noise comments:  ${agent.noise}`);
console.log(`  missed defects:  ${agent.missed.join(', ') || 'none'}`);
for (const c of agent.comments) {
  const tag = c.anchorValid ? 'anchored' : 'MIS-ANCHORED';
  console.log(`    [${tag}] ${c.file}:${c.line} — ${c.text}`);
}

console.log('\n=== Deterministic pipeline + LLM ===');
console.log(`  tokens burned:   ${pipeline.tokens} (${formatTokens(pipeline.tokens)})`);
console.log(`  files read:      ${pipeline.filesRead} (changed files only, none untouched)`);
console.log(`  comments posted: ${pipeline.totalComments}`);
console.log(`  real findings:   ${pipeline.findings.length}  (precision ${(s.pipelinePrecision*100).toFixed(0)}%, recall ${(s.pipelineRecall*100).toFixed(0)}%)`);
console.log(`  noise comments:  ${pipeline.noise}`);
console.log(`  missed defects:  ${pipeline.missed.join(', ') || 'none'}`);
for (const d of pipeline.events.filter(e => e.kind === 'reflection-drop')) {
  console.log(`    [reflection-drop] ${d.path}:${d.line} — ${d.reason}`);
}
for (const c of pipeline.comments) {
  const tag = c.anchorValid ? 'anchored' : 'MIS-ANCHORED';
  console.log(`    [${tag}] ${c.file}:${c.line} — ${c.text}`);
}

console.log('\n=== Verdict ===');
console.log(`  token ratio:     ${tokenRatio.toFixed(1)}x (pipeline uses ${(100/tokenRatio).toFixed(0)}% of agent cost)`);
console.log(`  defects found:   ${pipeline.findings.length}/${GROUND_TRUTH.length} vs ${agent.findings.length}/${GROUND_TRUTH.length}`);
console.log(`  precision:       ${(s.pipelinePrecision*100).toFixed(0)}% vs ${(s.agentPrecision*100).toFixed(0)}%`);
console.log(`  noise:           ${pipeline.noise} vs ${agent.noise}`);

const ratio = tokenRatio;
const verdict =
  pipeline.findings.length > agent.findings.length &&
  pipeline.noise < agent.noise &&
  ratio >= 5;
console.log(
  verdict
    ? '\nPASS — deterministic plumbing + judgment inside wins on every axis.\n'
    : '\nFAIL — the deterministic pipeline did not beat wandering.\n',
);
process.exit(verdict ? 0 : 1);
