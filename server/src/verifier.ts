import { GoogleGenAI, Type } from '@google/genai';
import type { CitedSpan, Source, Verdict, VerdictStatus } from '@lumen/shared';

const VERIFIER_MODEL = process.env.VERIFIER_MODEL ?? 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are a strict fact-checker. Given a claim from an AI assistant's response and snippets extracted from the web sources it was grounded against, decide whether the claim is supported by those snippets.

Categories:
- "supported": at least one snippet clearly substantiates the claim.
- "partial": snippets partially support the claim but miss key qualifiers, numbers, or specifics.
- "unsupported": the snippets are not relevant to the claim, or no snippet addresses it.
- "contradicted": at least one snippet directly disagrees with the claim.

Quotes must be VERBATIM substrings of the provided snippets. If no verbatim quote fits, omit the quote fields.
Use ONLY the provided snippets. Do NOT rely on outside knowledge.
For purely rhetorical or transitional sentences ("Let me explain", "Here's what I found"), return "unsupported" with rationale "non-factual".`;

const VERDICT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      enum: ['supported', 'partial', 'unsupported', 'contradicted'],
    },
    rationale: { type: Type.STRING },
    supportingSourceId: { type: Type.STRING },
    supportingQuote: { type: Type.STRING },
    conflictingSourceId: { type: Type.STRING },
    conflictingQuote: { type: Type.STRING },
  },
  required: ['status', 'rationale'],
};

type VerifierInput = {
  claim: string;
  attachedCitations: CitedSpan[];
  allSources: Source[];
  allCitations: Map<string, string[]>;
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

export async function verifyClaim(input: VerifierInput): Promise<Verdict> {
  const sourceLines = input.allSources
    .map((s) => {
      const cited = input.allCitations.get(s.id) ?? [];
      const citedJoined =
        cited.length > 0
          ? cited.map((c) => JSON.stringify(c)).join('\n      ')
          : '(no snippet extracted from this source)';
      return `- id: ${s.id}\n  title: ${s.title}\n  url: ${s.url}\n  snippets:\n      ${citedJoined}`;
    })
    .join('\n');

  const attached =
    input.attachedCitations.length > 0
      ? input.attachedCitations
          .map((c) => `- source ${c.sourceId}: ${JSON.stringify(c.citedText)}`)
          .join('\n')
      : '(none — no snippet matched this sentence)';

  const userPrompt = `<claim>${input.claim}</claim>

<attached_snippets>
${attached}
</attached_snippets>

<all_sources>
${sourceLines}
</all_sources>

Return JSON only.`;

  let raw: string;
  try {
    const response = await ai.models.generateContent({
      model: VERIFIER_MODEL,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: VERDICT_SCHEMA,
      },
    });
    raw = response.text ?? '';
  } catch (err) {
    return {
      status: 'unsupported',
      rationale: `verifier error: ${(err as Error).message}`,
    };
  }

  return parseVerdict(raw);
}

function parseVerdict(raw: string): Verdict {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { status: 'unsupported', rationale: 'verifier returned no JSON' };
    }
    try {
      obj = JSON.parse(match[0]);
    } catch {
      return { status: 'unsupported', rationale: 'verifier returned invalid JSON' };
    }
  }
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
