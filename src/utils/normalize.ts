export function normalizeUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const normalized =
      `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}

export function normalizeTitle(title: string): string {
  if (!title) return '';
  // Strip punctuation unless it sits between digits (keeps "3.5", "v1.2").
  return title
    .toLowerCase()
    .replace(/(?<!\d)[\p{P}\p{S}]|[\p{P}\p{S}](?!\d)/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
