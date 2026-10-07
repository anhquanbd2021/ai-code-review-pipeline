import test from 'node:test';
import assert from 'node:assert/strict';

import { review, summarize } from '../app/index.js';
import { runGeneralAgent } from '../app/agent.js';
import {
  runPipeline,
  selectChangedFiles,
  groupFiles,
  diffLineToFile,
  reflect,
} from '../app/pipeline.js';
import { GROUND_TRUTH, DIFF, NON_DEFECTS } from '../app/fixture.js';
import { RULES, rulesFor, ruleById, matchRules } from '../app/rules.js';

test('the pipeline finds all four seeded defects with zero noise', () => {
  const { pipeline, agent } = review();
  assert.equal(pipeline.findings.length, GROUND_TRUTH.length);
  assert.equal(pipeline.noise, 0);
  assert.deepEqual(pipeline.missed, []);
  // the agent misses the SQLi three files away and the NPE
  assert.ok(agent.missed.includes('sqli'), 'agent misses the SQLi');
  assert.ok(agent.missed.includes('npe'), 'agent misses the NPE');
});

test('deterministic pipeline beats the wandring agent: more findings, less noise, cheaper', () => {
  const { pipeline, agent } = review();
  const s = summarize(review());
  assert.ok(pipeline.findings.length > agent.findings.length);
  assert.ok(pipeline.noise < agent.noise);
  assert.ok(s.tokenRatio >= 5, `token ratio ${s.tokenRatio} should be >= 5 (article claims ~1/9)`);
  assert.equal(pipeline.filesRead, DIFF.files.length);
  assert.ok(agent.filesRead > pipeline.filesRead, 'agent reads more files (wanders into untouched)');
});

test('selection is deterministic: only modified files, untouched never read', () => {
  const selected = selectChangedFiles();
  assert.equal(selected.length, DIFF.files.filter((f) => f.status === 'modified').length);
  for (const f of selected) assert.equal(f.status, 'modified');
});

test('grouping batches java sources together, resources separately', () => {
  const groups = groupFiles(selectChangedFiles());
  const java = groups.find((g) => g.id === 'java');
  const xml = groups.find((g) => g.id === 'resources:xml');
  assert.ok(java && java.files.length >= 4);
  assert.ok(xml && xml.files.some((f) => f.path.endsWith('.xml')));
});

test('anchoring only accepts lines the diff actually changed', () => {
  const reportService = DIFF.files.find((f) => f.path.endsWith('ReportService.java'));
  assert.equal(diffLineToFile(reportService, 24), 24);
  assert.equal(diffLineToFile(reportService, 47), null, 'line 47 is not a changed line');
});

test('rule dispatch matches the seeded defects by language and pattern', () => {
  const sqli = ruleById('sqli-string-interpolation');
  const xmlFile = DIFF.files.find((f) => f.path.endsWith('.xml'));
  const hits = matchRules(xmlFile, xmlFile.added);
  assert.ok(hits.some((h) => h.ruleId === 'sqli-string-interpolation'));
  assert.match(xmlFile.added[0].s, sqli.pattern);
});

test('reflection drops the default-valued @RequestParam, keeps the NPE', () => {
  const controller = DIFF.files.find((f) => f.path.endsWith('ReportController.java'));
  const paramRule = ruleById('param-validation');
  const drop = reflect(paramRule, controller, controller.added[0]);
  assert.match(drop, /default/);

  const service = DIFF.files.find((f) => f.path.endsWith('ReportService.java'));
  // the NPE deref is not guarded on its receiver — reflect keeps it
  const keep = reflect(ruleById('npe-deref'), service, service.added[0]);
  assert.equal(keep, null);
});

test('every real finding is anchored to a changed line', () => {
  const { pipeline } = review();
  for (const c of pipeline.comments) {
    assert.equal(c.anchorValid, true, `${c.file}:${c.line} must anchor to a changed line`);
  }
});

test('NON_DEFECTS are not reported by the pipeline (no false positive on defaulted params)', () => {
  const { pipeline } = review();
  for (const nd of NON_DEFECTS) {
    const reported = pipeline.comments.find((c) => c.file === nd.file && c.line === nd.line);
    assert.equal(reported, undefined, `non-defect ${nd.file}:${nd.line} was reported`);
  }
});