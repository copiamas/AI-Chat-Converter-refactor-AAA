/**
 * Domain model for the HTML -> Markdown chat conversion pipeline.
 *
 * Everything is immutable-by-convention and serialisable so it can be rendered,
 * diffed or snapshot-tested without touching the DOM again.
 */

export type Role = "user" | "assistant" | "system";

export type BlockKind =
  | "heading"
  | "paragraph"
  | "list-item"
  | "code"
  | "quote"
  | "table"
  | "text";

export type PlatformId = "auto" | "google-ai" | "chatgpt" | "generic";

export type RoleSource = "attributes" | "heuristic" | "mixed" | "none";

/** A single semantic unit extracted from the DOM, in document order. */
export interface Block {
  index: number;
  kind: BlockKind;
  text: string;
  /** Heading depth (h1 -> 1) when kind === "heading". */
  level?: number;
  /** List marker, e.g. "-" or "3." when kind === "list-item". */
  marker?: string;
  /** Inferred fence language when kind === "code". */
  lang?: string;
  /** Where the block came from, e.g. "p.model-response-text". */
  source: string;
  /** Explicit role metadata read from the DOM, when the platform provides it. */
  declaredRole: Role | null;
  /**
   * Layout-container evidence (`.query-content`, `.model-response-text`, ...).
   * Strong signal for the heuristic strategy, but never treated as declared
   * metadata: platform CSS class names are not a public contract.
   */
  containerRole?: Role | null;
}

/** A run of consecutive blocks attributed to the same speaker. */
export interface Turn {
  index: number;
  role: Role;
  lines: string[];
  confidence: number;
  signals: string[];
}

export interface Diagnostic {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
}

export interface PlatformProfile {
  id: Exclude<PlatformId, "auto">;
  label: string;
  /** Attributes that carry an explicit author role. */
  roleAttributes: string[];
  userContainers: string[];
  assistantContainers: string[];
  /** Selectors that only exist to serve the product UI, never the conversation. */
  removeSelectors: string[];
}

export interface ConvertOptions {
  platform: PlatformId;
  locale: "pt-BR" | "en-US";
  includeFrontMatter: boolean;
  includeTimestamp: boolean;
  includeStatsFooter: boolean;
  /** Drop blocks whose text is *only* known UI chrome. */
  aggressiveNoiseFilter: boolean;
  title?: string;
  /** Injectable clock keeps the pipeline deterministic for tests. */
  now?: Date;
}

export interface ConvertStats {
  inputBytes: number;
  sanitizedElements: number;
  noiseBlocksDropped: number;
  blocksExtracted: number;
  turns: number;
  userTurns: number;
  assistantTurns: number;
  words: number;
  chars: number;
  durationMs: number;
  roleSource: RoleSource;
  /** 0..1 heuristic confidence about how trustworthy the segmentation is. */
  confidence: number;
}

export interface ConvertResult {
  markdown: string;
  fileName: string;
  outputName: string;
  platform: PlatformProfile["id"];
  platformLabel: string;
  turns: Turn[];
  stats: ConvertStats;
  diagnostics: Diagnostic[];
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  platform: "auto",
  locale: "pt-BR",
  includeFrontMatter: true,
  includeTimestamp: true,
  includeStatsFooter: true,
  aggressiveNoiseFilter: true,
};
