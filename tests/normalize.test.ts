import { describe, expect, it } from 'vitest';

import { normalizeTitle, normalizeUrl } from '../src/utils/normalize.js';

describe('normalizeUrl', () => {
  it('lowercases the URL', () => {
    expect(normalizeUrl('HTTPS://Example.COM/Path')).toBe(
      'https://example.com/path',
    );
  });

  it('strips trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe(
      'https://example.com/path',
    );
  });

  it('strips query params', () => {
    expect(normalizeUrl('https://example.com/path?utm_source=hn&ref=top')).toBe(
      'https://example.com/path',
    );
  });

  it('strips fragment', () => {
    expect(normalizeUrl('https://example.com/path#section')).toBe(
      'https://example.com/path',
    );
  });

  it('strips query params and fragment together', () => {
    expect(
      normalizeUrl('https://example.com/path?ref=hn#atom-everything'),
    ).toBe('https://example.com/path');
  });

  it('handles URL without path', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('');
  });

  it('returns original string for non-URL input', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('normalizeTitle', () => {
  it('lowercases the title', () => {
    expect(normalizeTitle('TypeScript 6.0 Вышел')).toBe('typescript 6.0 вышел');
  });

  it('strips punctuation', () => {
    expect(normalizeTitle('Hello, World! — Test...')).toBe('hello world test');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('hello   world   test')).toBe('hello world test');
  });

  it('handles empty string', () => {
    expect(normalizeTitle('')).toBe('');
  });

  it('handles cyrillic with punctuation', () => {
    expect(normalizeTitle('TypeScript 6.0 RC — до финального релиза!')).toBe(
      'typescript 6.0 rc до финального релиза',
    );
  });
});
