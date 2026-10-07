// A reusable deterministic pipeline that runs the same way everywhere: in the
// browser, in the CLI report, and in the test suite. Every claim the article
// makes is asserted through these modules, not through the DOM.
import { RULES, rulesFor, ruleById, matchRules } from './rules.js';
import { DIFF, GROUND_TRUTH, NON_DEFECTS } from './fixture.js';
import { tokensForFile, formatTokens, TOKENS_PER_COMMENT } from './tokens.js';
import { runGeneralAgent } from './agent.js';
import {
  runPipeline,
  selectChangedFiles,
  groupFiles,
  diffLineToFile,
  reflect,
} from './pipeline.js';

export { RULES, rulesFor, ruleById, matchRules };
export { DIFF, GROUND_TRUTH, NON_DEFECTS };
export { tokensForFile, formatTokens, TOKENS_PER_COMMENT };
export { runGeneralAgent };
export { runPipeline, selectChangedFiles, groupFiles, diffLineToFile, reflect };

// One shared run: both reviews, plus the derived comparison the UI renders.
// `options` is forwarded to the pipeline only — the general agent has no knobs.
export function review(options) {
  const agent = runGeneralAgent();
  const pipeline = runPipeline(options);
  const tokenRatio = agent.tokens / pipeline.tokens;
  return { agent, pipeline, tokenRatio };
}

export function summarize(review) {
  const { agent, pipeline, tokenRatio } = review;
  const ground = GROUND_TRUTH.length;
  return {
    agentFindings: agent.findings.length,
    agentNoise: agent.noise,
    agentMissed: agent.missed,
    agentTokens: agent.tokens,
    agentPrecision: agent.totalComments ? agent.findings.length / agent.totalComments : 0,
    agentRecall: agent.findings.length / ground,
    pipelineFindings: pipeline.findings.length,
    pipelineNoise: pipeline.noise,
    pipelineMissed: pipeline.missed,
    pipelineTokens: pipeline.tokens,
    pipelinePrecision: pipeline.totalComments ? pipeline.findings.length / pipeline.totalComments : 0,
    pipelineRecall: pipeline.findings.length / ground,
    tokenRatio,
    filesReadAgent: agent.filesRead,
    filesReadPipeline: pipeline.filesRead,
    untouchedCount: DIFF.untouched.length,
  };
}