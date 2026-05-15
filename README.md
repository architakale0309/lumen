# Lumen

Chat with an internet-search-capable agent. A second model fact-checks every sentence against the retrieved sources — surfacing supported claims, unsupported claims, and disagreements between sources.

**Live demo:**

```
https://lumen-pjrt.onrender.com/#token=lumen-demo-dont-spam
```

[Open in browser ↗](https://lumen-pjrt.onrender.com/#token=lumen-demo-dont-spam)

> Free-tier hosting — first request after idle takes ~30s to wake. Please don't spam: this runs on a personal Anthropic API quota. For demo safety, `/api/chat` is rate-limited to 10 requests per IP per 15 minutes.

![Lumen screenshot](docs/demo-search-chat.png)

## What you're seeing

- **Primary agent** (Claude Opus 4.7 + `web_search` server tool) streams an answer and emits inline citations as it writes.
- **Sentence pipeline** (server) splits the streamed text on sentence boundaries.
- **Inline citations** from Claude include the verbatim `cited_text` from each source — no separate page-fetch step needed.
- **Verifier agent** (Claude Haiku 4.5) runs once per sentence over the attached quotes and returns a verdict:
  - ✓ **supported** — at least one source substantiates the claim
  - ~ **partial** — sources support the claim but miss qualifiers / numbers
  - ✗ **unsupported** — no source addresses this claim
  - ⚡ **contradicted** — a source disagrees with the claim
- **Sources stay synced** with the UI; hover any sentence for the verbatim supporting quote, click a contradicted sentence for a side-by-side conflict view.

## Setup

```bash
cd C:\Users\palad\lumen
npm install
cp server\.env.example server\.env       # then edit server\.env and set ANTHROPIC_API_KEY
npm run dev
```

Get an Anthropic API key at <https://console.anthropic.com/settings/keys>. The Claude API is pay-as-you-go; a Lumen-scale demo runs well under $1 on Haiku-only setups.

Open <http://localhost:5173>. The server runs on `:8787` and the client proxies `/api` to it.

## Running tests

Server-side unit tests use [Vitest](https://vitest.dev/). From the repo root:

```bash
npm test                          # run all tests once
npm --workspace server run test:watch   # watch mode while iterating
```

What's covered:

- `server/src/sentenceBuffer.test.ts` — regex sentence segmenter, including abbreviation guards (e.g. "Dr.", "U.S.") that should not trigger a split.

Tests do not call Claude — no API key required to run them.

## Linting

ESLint (flat config, v9) with TypeScript and React-hooks rules covers all three workspaces:

```bash
npm run lint        # check
npm run lint:fix    # auto-fix what's safe
```

## Configuration (server\.env)

```
ANTHROPIC_API_KEY=
PRIMARY_MODEL=claude-opus-4-7
VERIFIER_MODEL=claude-haiku-4-5
MAX_VERIFIER_CONCURRENCY=6
MAX_OUTPUT_TOKENS=4096
PORT=8787
RATE_LIMIT_MAX=10             # per-IP cap on /api/chat (defaults to 10 for the demo)
RATE_LIMIT_WINDOW_MS=900000   # window length in ms (defaults to 15 minutes)
```

## Project layout

```
lumen/
├── shared/src/index.ts             types shared between FE and BE (ServerEvent, Verdict, Source)
├── server/src/
│   ├── index.ts                    Hono app + /api/chat SSE endpoint
│   ├── chat.ts                     streams Claude + web_search; sentence pipeline; fires verifier
│   ├── sentenceBuffer.ts           regex segmenter with abbreviation guard
│   ├── verifier.ts                 Claude Haiku verifier (tool-use JSON) + concurrency semaphore
│   └── sse.ts                      SSE encoding helpers
└── client/src/
    ├── App.tsx                     header / layout
    ├── store.ts                    Zustand: messages, sentences, verdicts, sources
    ├── sse.ts                      consumed inside store.ts
    └── components/
        ├── Chat.tsx
        ├── Composer.tsx
        ├── Message.tsx             renders sentences + trust summary + sources
        ├── Sentence.tsx            tinted span + Radix Popover with quote
        └── ConflictModal.tsx       side-by-side disagreement viewer
```

## Tech stack & why

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vite + React 18 + TS | Required by prompt; Vite is fastest dev loop. |
| Styling | Tailwind | Speed of iteration; no design system overhead. |
| State | Zustand | Nested sentence/verdict updates benefit from a store; lighter than Redux. |
| Backend | Node + Hono + TS | First-class streaming primitives; smaller than Express. |
| Transport | Server-Sent Events | One-way streaming is all we need; trivial reconnect; no socket infra. |
| Primary LLM | Claude Opus 4.7 + `web_search` | Best-in-class reasoning, server-side web search, and inline `cited_text` for every claim — no separate page-fetch pipeline needed. |
| Verifier | Claude Haiku 4.5 | ~5–25× cheaper than Opus per token; verification is a narrow, structured task. Tool-use schema gives me JSON-schema-validated output for free. |

## Architectural decisions

- **Why a second model instead of one model self-checking?** Self-checking inherits the same priors that produced the hallucination. A separate model running with a stricter system prompt and a narrower task is cheaper, faster, and structurally more skeptical.
- **Why per-sentence and not per-claim?** Claims are messy to extract — sentences are the natural unit the model produces. Sentence boundaries also happen to be the resolution at which an interface can visually attribute trust.
- **Why Claude's native `web_search` tool?** The alternative (SerpAPI + custom fetching + Readability extraction) is a whole pipeline in itself. Claude's `web_search` returns search results *and* `cited_text` — verbatim source quotes attached inline to each cited span of the response. That removes an entire module from the system.
- **Why streaming + post-stream verifier dispatch?** Text deltas stream to the client in real time so the user sees the answer arrive. Citations land inline as `citations_delta` events and are mapped to sentences by character-range overlap. Verification fires after the stream completes, in parallel across sentences, gated by a concurrency semaphore — verdicts trickle in out of order and merge by stable sentence index.
- **Why Haiku for the verifier?** The verifier's job is a narrow tool-use call with a fixed JSON schema. Haiku 4.5 is the right tool for that: fast, cheap, structured-output-friendly. Opus would be overkill and ~25× the cost per token.
- **Why SSE over WebSockets?** This is one-way: server → client. SSE auto-reconnects, works over plain HTTP, and the protocol is two lines of JSON per event. WebSockets would buy nothing.

## Trade-offs (intentionally cut)

- **No auth, no persistence.** Single-user local demo; conversation state lives in React only.
- **Sentence-to-citation mapping is character-range overlap.** Claude attaches citations to text spans by index — I map a citation to a sentence if its span overlaps the sentence's range. Edge case: a citation that straddles two sentences gets attached to both, which is usually correct but occasionally noisy. **Prod fix:** stricter overlap thresholds, or feed the verifier the citation's exact span so it can decide attribution itself.
- **Sentence segmentation is regex + abbreviation list, not an NLP segmenter.** Will mis-split on rare abbreviations. **Prod fix:** swap for `compromise` or an embedding-based segmenter.
- **No verifier caching.** Same claim across turns re-pays the cost. **Prod fix:** hash(claim, citationIds) → verdict cache (Redis).
- **No evals.** Green checkmarks are only meaningful if we measure precision/recall on a labeled `(claim, source, verdict)` set. **Prod fix:** TruthfulQA-style benchmark plus an internal labeled set.
- **`web_search` max_uses is fixed at 5.** Enough for most queries; long-tail research questions may want more. **Prod fix:** dynamic budget based on query type, or use Claude's `task_budget` to give the model a total token allowance for the loop.
- **No rate limiting or prompt-injection scrub.** Web search results may contain adversarial content the verifier reads. **Prod fix:** sanitize tool results, run a separator-aware prompt template, per-IP throttles.
- **No prompt caching.** The system prompt is small and the conversation is short, so caching wouldn't pay off — but the verifier's system prompt is identical across every sentence, so for high-traffic deployments wrapping it in `cache_control: {type: "ephemeral"}` would be a free ~90% input-cost reduction.

## What I'd do next to productionize

- Embedding-based citation-to-sentence attribution (instead of pure range overlap).
- Evals + a labeled regression set with precision/recall over the four verdict classes.
- Postgres + Auth.js, conversation persistence, cross-session memory via pgvector.
- OpenTelemetry traces per request — primary stream, each verifier call, each tool call — with latency budgets.
- Verifier result cache + cancellation on user navigation away.
- Prompt caching on the verifier's system prompt for high-throughput deployments.
- A "show your work" mode that exposes the per-sentence verifier prompt/response for debugging trust.
