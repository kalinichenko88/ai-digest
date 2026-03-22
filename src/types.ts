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

export interface DeliveryConfig {
  language: string;
  output_path: string;
  notification: boolean;
}
