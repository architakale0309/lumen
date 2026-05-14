# Lumen

Chat with an internet-search-capable agent. A second model fact-checks every sentence against the retrieved sources — surfacing supported claims, unsupported claims, and disagreements between sources.

**Live demo:**

```
https://lumen-pjrt.onrender.com/#token=lumen-demo-dont-spam
```

[Open in browser ↗](https://lumen-pjrt.onrender.com/#token=lumen-demo-dont-spam)

> Free-tier hosting — first request after idle takes ~30s to wake. Please don't spam: this runs on a personal Gemini API quota.

![Lumen screenshot](docs/demo-search-chat.png)

## What you're seeing

- **Primary agent** (Gemini 2.5 Pro + `googleSearch` grounding tool) streams an answer.
- **Sentence pipeline** (server) splits the streamed text on sentence boundaries.
- **Page fetcher** retrieves the grounded source URLs, extracts main content via Mozilla Readability, and finds the best-matching sentence in each source for every claim — this gives us the verbatim quote that Gemini's grounding API doesn't return.
- **Verifier agent** (Gemini 2.5 Flash) runs once per sentence over the extracted snippets and returns a verdict:
  - ✓ **supported** — at least one source substantiates the claim
  - ~ **partial** — sources support the claim but miss qualifiers / numbers
  - ✗ **unsupported** — no source addresses this claim
  - ⚡ **contradicted** — a source disagrees with the claim
- **Sources stay synced** with the UI; hover any sentence for the verbatim supporting quote, click a contradicted sentence for a side-by-side conflict view.

## Setup

```bash
cd C:\Users\palad\lumen
npm install
cp server\.env.example server\.env       # then edit server\.env and set GEMINI_API_KEY
npm run dev
```

Get a Gemini API key at <https://aistudio.google.com/apikey> (free tier available).

Open <http://localhost:5173>. The server runs on `:8787` and the client proxies `/api` to it.

## Running tests

Server-side unit tests use [Vitest](https://vitest.dev/). From the repo root:

```bash
npm test                          # run all tests once
npm --workspace server run test:watch   # watch mode while iterating
```

What's covered:

- `server/src/sentenceBuffer.test.ts` — regex sentence segmenter, including abbreviation guards (e.g. "Dr.", "U.S.") that should not trigger a split.
- `server/src/pageFetcher.test.ts` — Readability extraction + snippet matching against source HTML.

Tests do not call Gemini — no API key required to run them.

## Linting

ESLint (flat config, v9) with TypeScript and React-hooks rules covers all three workspaces:

```bash
npm run lint        # check
npm run lint:fix    # auto-fix what's safe
```

## Configuration (server\.env)

```
GEMINI_API_KEY=
PRIMARY_MODEL=gemini-2.5-pro
VERIFIER_MODEL=gemini-2.5-flash
MAX_VERIFIER_CONCURRENCY=6
PORT=8787
```

## Project layout

```
lumen/
├── shared/src/index.ts             types shared between FE and BE (ServerEvent, Verdict, Source)
├── server/src/
│   ├── index.ts                    Hono app + /api/chat SSE endpoint
│   ├── chat.ts                     streams Gemini + googleSearch; sentence pipeline; fires verifier
│   ├── pageFetcher.ts              fetches grounded URLs, extracts text via Readability, snippet-matches
│   ├── sentenceBuffer.ts           regex segmenter with abbreviation guard
│   ├── verifier.ts                 Gemini Flash verifier (JSON schema) + concurrency semaphore
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
| Primary LLM | Gemini 2.5 Pro + `googleSearch` | Native server-side grounding via Google Search; free tier available. |
| Source extraction | Mozilla Readability + jsdom | Pulls clean article text from grounded URLs so the verifier can see real source content. |
| Verifier | Gemini 2.5 Flash | ~10× cheaper than Pro; verification is a narrow, structured task with JSON-schema output. |

## Architectural decisions

- **Why a second model instead of one model self-checking?** Self-checking inherits the same priors that produced the hallucination. A separate model running with a stricter system prompt and a narrower task is cheaper, faster, and structurally more skeptical.
- **Why per-sentence and not per-claim?** Claims are messy to extract — sentences are the natural unit the model produces. Sentence boundaries also happen to be the resolution at which an interface can visually attribute trust.
- **Why post-stream verifier dispatch?** Gemini emits `groundingMetadata` only at the end of the stream (unlike Anthropic, which interleaves citations with text). So the verifier fires after the response completes, in parallel across sentences — verdicts still trickle in out of order and merge into rendered sentences by stable index.
- **Why Gemini's native `googleSearch` grounding?** The alternative (SerpAPI + custom fetching for search itself) means managing search keys and ranking. The built-in tool gives us Google-quality search results with grounding metadata mapping response segments to source URLs. Gemini's free tier is also generous enough for a demo.
- **Why a separate page-fetcher step?** Gemini's grounding tells us *which* URLs back a claim but doesn't return source-side quotes (unlike Anthropic's `cited_text`). So we refetch the grounded URLs, run Readability to extract main content, and snippet-match each model claim against source sentences — recovering the verbatim-quote UX.
- **Why SSE over WebSockets?** This is one-way: server → client. SSE auto-reconnects, works over plain HTTP, and the protocol is two lines of JSON per event. WebSockets would buy nothing.

## Trade-offs (intentionally cut)

- **No auth, no persistence.** Single-user local demo; conversation state lives in React only.
- **Page fetcher is best-effort.** Paywalled, JS-rendered, or bot-blocked pages return no snippet — those sentences fall back to "unsupported". **Prod fix:** headless-browser pool (Playwright) with stealth; per-domain handlers for paywalled sites.
- **Snippet matching uses word-overlap, not semantic similarity.** A paraphrased claim against semantically-equivalent source text can miss. **Prod fix:** embed sentences with a small model (e.g. `text-embedding-004`) and cosine-rank.
- **Sentence segmentation is regex + abbreviation list, not an NLP segmenter.** Will mis-split on rare abbreviations. **Prod fix:** swap for `compromise` or an embedding-based segmenter.
- **Cross-source contradiction** is bounded by what the snippet matcher surfaces — a source whose contradicting span has low word-overlap with the claim won't be matched and the sentence will look supported. **Prod fix:** embedding-based retrieval over source text.
- **No verifier caching.** Same claim across turns re-pays the cost. **Prod fix:** hash(claim, sourceIds) → verdict cache (Redis).
- **No evals.** Green checkmarks are only meaningful if we measure precision/recall on a labeled `(claim, source, verdict)` set. **Prod fix:** TruthfulQA-style benchmark, plus an internal labeled set.
- **No streaming verifier JSON.** Could progressively reveal the verdict's quote field, but adds complexity for small UX gain.
- **No rate limiting or prompt-injection scrub.** Fetched pages may contain adversarial content the verifier reads. **Prod fix:** strip HTML, run a separator-aware prompt template, per-IP throttles.

## What I'd do next to productionize

- Playwright-based source fetching for paywalled / JS-rendered pages (biggest quality lift).
- Embedding-based snippet matching instead of word-overlap.
- Evals + a labeled regression set.
- Postgres + Auth.js, conversation persistence, cross-session memory via pgvector.
- OpenTelemetry traces per request — primary stream, each verifier call, each tool call — with latency budgets.
- Verifier result cache + cancellation on user navigation away.
- A "show your work" mode that exposes the per-sentence verifier prompt/response for debugging trust.
