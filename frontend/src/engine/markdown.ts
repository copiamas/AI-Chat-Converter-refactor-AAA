import type { ConvertOptions, ConvertStats, Role, Turn } from "./types";

export const GENERATOR = { name: "ai-chat-converter", version: "1.0.0" } as const;

export const ROLE_LABELS: Record<
  ConvertOptions["locale"],
  Record<Role, string>
> = {
  "pt-BR": {
    user: "\uD83D\uDC64 Usu\u00e1rio",
    assistant: "\uD83E\uDD16 IA",
    system: "\u2699\uFE0F Sistema",
  },
  "en-US": {
    user: "\uD83D\uDC64 User",
    assistant: "\uD83E\uDD16 AI",
    system: "\u2699\uFE0F System",
  },
};

const pad = (value: number) => String(value).padStart(2, "0");

export interface Stamp {
  date: string;
  time: string;
  iso: string;
}

/** Injectable clock + locale aware formatting keeps snapshots reproducible. */
export function formatStamp(now: Date, locale: ConvertOptions["locale"]): Stamp {
  const date =
    locale === "pt-BR"
      ? `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
      : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return {
    date,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    iso: now.toISOString(),
  };
}

export function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}'\u2019-]+/gu);
  return matches ? matches.length : 0;
}

export interface DocumentMeta {
  title: string;
  stamp: Stamp;
  platform: string;
  source: string;
}

function renderFrontMatter(meta: DocumentMeta, turnCount: number): string {
  return [
    "---",
    `title: ${yamlString(meta.title)}`,
    `date: ${meta.stamp.date}`,
    `time: ${meta.stamp.time}`,
    `exported_at: ${meta.stamp.iso}`,
    `platform: ${yamlString(meta.platform)}`,
    `source: ${yamlString(meta.source)}`,
    "language: pt-BR",
    `turns: ${turnCount}`,
    `generator: ${yamlString(`${GENERATOR.name} v${GENERATOR.version}`)}`,
    "---",
    "",
  ].join("\n");
}

function renderTurn(turn: Turn, locale: ConvertOptions["locale"]): string {
  const label = ROLE_LABELS[locale][turn.role];
  const body = turn.lines.join("\n\n");
  return `### ${label}\n\n${body}`;
}

const SECTION_TITLES: Record<ConvertOptions["locale"], string> = {
  "pt-BR": "# \uD83D\uDCDD Hist\u00f3rico de Conversa",
  "en-US": "# \uD83D\uDCDD Conversation Transcript",
};

export interface BuildInput {
  turns: readonly Turn[];
  meta: DocumentMeta;
  options: ConvertOptions;
  stats: ConvertStats;
}

export function buildDocument({ turns, meta, options, stats }: BuildInput): string {
  const parts: string[] = [];

  if (options.includeFrontMatter) {
    parts.push(renderFrontMatter(meta, turns.length).trimEnd());
  }

  parts.push(SECTION_TITLES[options.locale]);

  if (options.includeTimestamp) {
    const at = options.locale === "pt-BR" ? "\u00e0s" : "at";
    parts.push(
      `> **${
        options.locale === "pt-BR" ? "Data da Exporta\u00e7\u00e3o" : "Exported on"
      }:** ${meta.stamp.date} ${at} ${meta.stamp.time}`,
    );
  }

  parts.push(
    turns
      .map((turn) => renderTurn(turn, options.locale))
      .join("\n\n---\n\n"),
  );

  if (options.includeStatsFooter) {
    const confidence = Math.round(stats.confidence * 100);
    parts.push(
      [
        "---",
        `_${GENERATOR.name} v${GENERATOR.version} \u00b7 ${turns.length} turno(s) \u00b7 ${stats.words} palavra(s) \u00b7 confian\u00e7a da segmenta\u00e7\u00e3o: ${confidence}%_`,
      ].join("\n"),
    );
  }

  return `${parts.join("\n\n").replace(/\n{4,}/g, "\n\n\n").trimEnd()}\n`;
}

/**
 * Replaces the legacy `arquivo.replace(".html", ".md")`, which corrupted names
 * such as `chat.html.bak` (producing `chat.md.bak`) and ignored `.HTML`.
 */
export function safeOutputName(input: string): string {
  const base = input.split(/[/\\]/).pop() ?? "conversa";
  const withoutHtml = base.replace(/\.html?$/i, "");
  const slug = withoutHtml
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const stem = slug || "conversa";
  return `${stem}.md`;
}
