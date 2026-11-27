export type DigestItem = {
  title: string;
  url: string;
  source: string;
  timestamp: string;
  description?: string;
  author?: string;
};

export type ToolResult = {
  items: DigestItem[];
  warnings?: string[];
};

export type RssSource = {
  name: string;
  url: string;
  limit: number;
  telegram?: string;
};

export type SourcesConfig = {
  rss: RssSource[];
  github_releases: {
    repos: string[];
  };
};

export type ReachabilityResult = {
  type: 'rss' | 'github';
  name: string;
  status: 'ok' | 'failed' | 'unverifiable';
  detail?: string;
};

export type SourcesValidation = {
  structure: { valid: boolean; errors: string[] };
  reachability: ReachabilityResult[];
  summary: { passed: number; failed: number; unverifiable: number };
};

export type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  author: { login: string } | null;
};

export type DeduplicationConfig = {
  window_days: number;
  title_similarity_threshold: number;
};

export type DeliveryConfig = {
  language: string;
  output_path: string;
  notification: boolean;
  deduplication: DeduplicationConfig;
};

export type DigestEntry = {
  url: string;
  title: string;
  date: string;
};

export type PreviousDigestResult = {
  window_days: number;
  digests_found: number;
  dates: string[];
  entries: DigestEntry[];
  warnings?: string[];
};

export type DuplicateStatus = 'exact_duplicate' | 'likely_duplicate' | 'unique';

export type DuplicateCheckItem = {
  title: string;
  url: string;
  source: string;
};

export type DuplicateMatch = {
  title: string;
  url: string;
  date: string;
};

export type DuplicateResult = {
  title: string;
  url: string;
  source: string;
  status: DuplicateStatus;
  matched_with: DuplicateMatch | null;
};

export type DuplicateCheckResponse = {
  results: DuplicateResult[];
  summary: {
    total: number;
    exact_duplicates: number;
    likely_duplicates: number;
    unique: number;
  };
};
