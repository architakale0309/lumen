import { describe, expect, it } from 'vitest';
import { findBestSnippet } from './pageFetcher.js';

describe('findBestSnippet', () => {
  it('returns the sentence with the most claim-word overlap', () => {
    const claim = 'The James Webb Space Telescope detected water vapor on a distant exoplanet.';
    const sources = [
      'A new study about distant galaxies in early universe imaging.',
      'The James Webb Space Telescope detected water vapor in the atmosphere of exoplanet WASP-39b.',
      'Webb has reshaped how astronomers understand star formation regions.',
    ];
    const best = findBestSnippet(claim, sources);
    expect(best).toBe(sources[1]);
  });

  it('returns null when overlap is below the threshold', () => {
    const claim = 'Quantum entanglement violates Bell inequality bounds.';
    const sources = [
      'Cats are popular pets in households around the world.',
      'A short overview of medieval European cookbooks.',
    ];
    expect(findBestSnippet(claim, sources)).toBeNull();
  });

  it('truncates long winning snippets to ~240 chars with an ellipsis', () => {
    const claim = 'Lumen verifies sentences against retrieved web sources.';
    const longSentence =
      'Lumen verifies sentences against retrieved web sources by extracting article content, ' +
      'matching the claim against source-side text, and producing a structured verdict that the UI ' +
      'can render inline, so the user can immediately tell which sentences are grounded and which ' +
      'are hallucinated, which is the trust problem this whole project is trying to solve in practice.';
    const result = findBestSnippet(claim, [longSentence]);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(240);
    expect(result!.endsWith('…')).toBe(true);
  });

  it('ignores stopwords so trivial overlap does not count', () => {
    const claim = 'The cat sat on the mat with the hat.';
    // Source shares only stopwords with the claim — should not match.
    const stopwordOnlySource =
      'The other one with the and a but not has had been the of for with by from this that these those.';
    expect(findBestSnippet(claim, [stopwordOnlySource])).toBeNull();
  });

  it('returns null for an empty claim or empty source list', () => {
    expect(findBestSnippet('', ['Some source sentence.'])).toBeNull();
    expect(findBestSnippet('A real claim.', [])).toBeNull();
  });
});
