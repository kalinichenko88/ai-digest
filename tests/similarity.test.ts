import { describe, expect, it } from 'vitest';

import { titleSimilarity } from '../src/utils/similarity.js';

describe('titleSimilarity', () => {
  it('returns 1 for identical titles', () => {
    expect(
      titleSimilarity('TypeScript 6.0 вышел', 'TypeScript 6.0 вышел'),
    ).toBe(1);
  });

  it('returns 1 for identical titles after normalization', () => {
    expect(
      titleSimilarity('TypeScript 6.0 Вышел!', 'typescript 6.0 вышел'),
    ).toBe(1);
  });

  it('returns high similarity for similar titles', () => {
    const score = titleSimilarity(
      'TypeScript 6.0 вышел официально',
      'TypeScript 6.0 вышел — прощай легаси',
    );
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it('returns low similarity for different titles', () => {
    const score = titleSimilarity(
      'TypeScript 6.0 вышел',
      'React 19 новые хуки',
    );
    expect(score).toBeLessThan(0.3);
  });

  it('handles one empty title', () => {
    expect(titleSimilarity('', 'TypeScript 6.0')).toBe(0);
  });

  it('handles both empty titles', () => {
    expect(titleSimilarity('', '')).toBe(0);
  });

  it('handles titles with only stop-like short words', () => {
    const score = titleSimilarity('a b c', 'a b c');
    expect(score).toBe(1);
  });

  it('catches TypeScript RC vs stable as likely duplicate', () => {
    const score = titleSimilarity(
      'TypeScript 6.0 RC — до финального релиза один шаг',
      'TypeScript 6.0 вышел официально',
    );
    expect(score).toBeGreaterThan(0);
  });
});
