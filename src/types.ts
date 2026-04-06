export interface DigestItem {
  title: string;
  url: string;
  source: string;
  timestamp: string;
  description?: string;
  author?: string;
}

export interface ToolResult {
  items: DigestItem[];
  warnings?: string[];
}

export interface RssSource {
  name: string;
  url: string;
  limit: number;
}

export interface SourcesConfig {
  rss: RssSource[];
  github_releases: {
    repos: string[];
  };
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  author: { login: string } | null;
}

export interface DeduplicationConfig {
  window_days: number;
  title_similarity_threshold: number;
}

export interface DeliveryConfig {
  language: string;
  output_path: string;
  notification: boolean;
  deduplication?: DeduplicationConfig;
}

export interface DigestEntry {
  url: string;
  title: string;
  date: string;
}

export interface PreviousDigestResult {
  window_days: number;
  digests_found: number;
  dates: string[];
  entries: DigestEntry[];
  urls: string[];
}

export type DuplicateStatus = 'exact_duplicate' | 'likely_duplicate' | 'unique';

export interface DuplicateCheckItem {
  title: string;
  url: string;
  source: string;
}

export interface DuplicateMatch {
  title: string;
  url: string;
  date: string;
}

export interface DuplicateResult {
  title: string;
  url: string;
  source: string;
  status: DuplicateStatus;
  matched_with: DuplicateMatch | null;
}

export interface DuplicateCheckResponse {
  results: DuplicateResult[];
  summary: {
    total: number;
    exact_duplicates: number;
    likely_duplicates: number;
    unique: number;
  };
}
