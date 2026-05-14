import Anthropic from '@anthropic-ai/sdk';
import type { CitedSpan, Source, Verdict, VerdictStatus } from '@lumen/shared';

const VERIFIER_MODEL = process.env.VERIFIER_MODEL ?? 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are a strict fact-checker. Given a claim from an AI assistant's response and verbatim quotes extracted from the web sources it cited, decide whether the claim is supported by those quotes.

Categories:
- "supported": at least one quote clearly substantiates the claim.
- "partial": quotes partially support the claim but miss key qualifiers, numbers, or specifics.
- "unsupported": the quotes are not relevant to the claim, or no quote addresses it.
- "contradicted": at least one quote directly disagrees with the claim.

Quotes you return must be VERBATIM substrings of the provided quotes. If no verbatim quote fits, omit the quote fields.
Use ONLY the provided quotes. Do NOT rely on outside knowledge.
For purely rhetorical or transitional sentences ("Let me explain", "Here's what I found"), return "unsupported" with rationale "non-factual".`;

const VERDICT_SCHEMA = {
  type: 'object' as const,
  properties: {
    status: {
      type: 'string',
      enum: ['supported', 'partial', 'unsupported', 'contradicted'],
    },
    rationale: { type: 'string' },
    supportingSourceId: { type: 'string' },
    supportingQuote: { type: 'string' },
    conflictingSourceId: { type: 'string' },
    conflictingQuote: { type: 'string' },
  },
  required: ['status', 'rationale'],
  additionalProperties: false,
};

type VerifierInput = {
  claim: string;
  attachedCitations: CitedSpan[];
  allSources: Source[];
  allCitations: Map<string, string[]>;
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

export async function verifyClaim(input: VerifierInput): Promise<Verdict> {
  const sourceLines = input.allSources
    .map((s) => {
      const cited = input.allCitations.get(s.id) ?? [];
      const citedJoined =
        cited.length > 0
          ? cited.map((c) => JSON.stringify(c)).join('\n      ')
          : '(no quote attached to this source)';
      return `- id: ${s.id}\n  title: ${s.title}\n  url: ${s.url}\n  quotes:\n      ${citedJoined}`;
    })
    .join('\n');

  const attached =
    input.attachedCitations.length > 0
      ? input.attachedCitations
          .map((c) => `- source ${c.sourceId}: ${JSON.stringify(c.citedText)}`)
          .join('\n')
      : '(none — no quote attached to this sentence)';

  const userPrompt = `<claim>${input.claim}</claim>

<attached_quotes>
${attached}
</attached_quotes>

<all_sources>
${sourceLines}
</all_sources>

Call the record_verdict tool with your decision.`;

  try {
    const response = await client.messages.create({
      model: VERIFIER_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'record_verdict',
          description: 'Record the fact-check verdict for this claim.',
          input_schema: VERDICT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'record_verdict' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) {
      return { status: 'unsupported', rationale: 'verifier returned no tool call' };
    }
    return normalizeVerdict(toolUse.input as Record<string, unknown>);
  } catch (err) {
    return {
      status: 'unsupported',
      rationale: `verifier error: ${(err as Error).message}`,
    };
  }
}

function normalizeVerdict(obj: Record<string, unknown>): Verdict {
  return {
    status: normalizeStatus(obj.status),
    rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
    supportingSourceId:
      typeof obj.supportingSourceId === 'string' ? obj.supportingSourceId : undefined,
    supportingQuote:
      typeof obj.supportingQuote === 'string' ? obj.supportingQuote : undefined,
    conflictingSourceId:
      typeof obj.conflictingSourceId === 'string' ? obj.conflictingSourceId : undefined,
    conflictingQuote:
      typeof obj.conflictingQuote === 'string' ? obj.conflictingQuote : undefined,
  };
}

function normalizeStatus(s: unknown): VerdictStatus {
  if (s === 'supported' || s === 'partial' || s === 'unsupported' || s === 'contradicted') {
    return s;
  }
  return 'unsupported';
}

export class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}
