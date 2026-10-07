# AI Code Review Lab — companion demo

Interactive lab for the article *AI Code Review Fails at the Plumbing, Not
the Model*. Feed a seeded buggy diff through two reviewers side by side —
a general agent that wanders the repo, and a deterministic pipeline with an
LLM inside it — and watch token burn, precision, and comment anchoring.

Zero dependencies — Node 20+ only. The review logic is plain ES modules
(`app/`) shared by the browser UI, the CLI report, and the test suite.

## What the lab proves

| Claim from the article | What the demo shows |
|---|---|
| **Wrong context** — the agent wanders files | The agent reads 5 untouched files (and re-reads one); the pipeline never touches them. |
| **Vibe comments** — high recall, terrible precision | The agent posts "consider error handling" on already-guarded code; the pipeline posts zero noise. |
| **Lost anchoring** — comments land on wrong lines | The agent anchors to line 47 (a comment); the pipeline's position math lands every comment on a real changed line. |
| **Deterministic + judgment beats wandering, ~1/9 the tokens** | The pipeline burns one-ninth the tokens, finds all 4 defects, posts no noise. |

## The fixture

One PR, `feature/report-filter`, with 4 seeded real defects:

- SQL injection — `${sortColumn}` in `ReportMapper.xml` (3 files away)
- Stored XSS — `${item.label}` in `report.html`
- NPE — `.trim()` on a possibly-null `mapper.label()`
- Thread-safety — unsynchronised static `ArrayList` in `RateLimiter`

## Run it

```text
npm start        # serve the lab on :3000
npm test         # pipeline, agent, rules, anchoring, server
npm run report   # side-by-side CLI report on the article's claims
npm run check    # both
```

## Honest limits

- The "LLM" and "general agent" are **deterministic simulations** — no real
  model, no network, no cost. Seeds fixed in `app/fixture.js`.
- Token accounting is approximate: it models context-read + comment-write
  cost so the *ratio* holds, not the absolute bill.
- One reflection case is modeled (the default-valued `@RequestParam`); real
  reflection passes are richer.

This is an educational demo, not a production reviewer.