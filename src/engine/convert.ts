import { buildDocument, countWords, formatStamp, safeOutputName } from "./markdown";
import { inferTitle, profileFor } from "./platforms";
import { groupTurns, resolveRoles } from "./roles";
import { sanitizeDocument } from "./sanitize";
import { extractBlocks } from "./segment";
import {
  DEFAULT_OPTIONS,
  type ConvertOptions,
  type ConvertResult,
  type Diagnostic,
  type PlatformProfile,
} from "./types";

export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** Typed failure instead of a raw traceback (legacy threw `PermissionError`...). */
export class ConversionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: Diagnostic[] = [],
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

export interface PipelineStage {
  id: string;
  label: string;
  detail: string;
}

export interface ConvertVerbose extends ConvertResult {
  stages: PipelineStage[];
}

/**
 * Stage 1..6 orchestration. Pure-ish (DOM + injected clock only), so it can be
 * executed in a browser, a worker or under Vitest without mocks.
 */
/** Callers may override only the knobs they care about. */
export type ConvertInput = Partial<ConvertOptions>;

export function convertHtmlToMarkdown(
  html: string,
  fileName: string,
  rawOptions: ConvertInput = {},
): ConvertVerbose {
  const options: ConvertOptions = { ...DEFAULT_OPTIONS, ...rawOptions };
  const started = performance.now();
  const diagnostics: Diagnostic[] = [];
  const stages: PipelineStage[] = [];
  const now = options.now ?? new Date();

  if (!html || !html.trim().length) {
    throw new ConversionError("EMPTY_INPUT", "O arquivo est\u00e1 vazio ou ileg\u00edvel.");
  }
  if (html.length > MAX_INPUT_BYTES) {
    throw new ConversionError(
      "INPUT_TOO_LARGE",
      `Arquivo maior que ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)} MB \u2014 processamento recusado por seguran\u00e7a.`,
    );
  }
  stages.push({ id: "ingest", label: "Ingest\u00e3o", detail: `${html.length.toLocaleString("pt-BR")} bytes lidos` });

  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.body) {
    throw new ConversionError("PARSE_FAILED", "N\u00e3o foi poss\u00edvel interpretar o HTML.", diagnostics);
  }
  if (doc.querySelector("parsererror")) {
    diagnostics.push({
      level: "warn",
      code: "MARKUP_RECOVERED",
      message: "HTML malformado detectado; o parser recuperou o que foi poss\u00edvel.",
    });
  }
  stages.push({
    id: "parse",
    label: "Parse",
    detail: `${doc.querySelectorAll("*").length.toLocaleString("pt-BR")} n\u00f3(s) no DOM`,
  });

  const profile: PlatformProfile = profileFor(options.platform, doc);
  stages.push({ id: "detect", label: "Detec\u00e7\u00e3o de plataforma", detail: profile.label });

  const sanitized = sanitizeDocument(doc, {
    aggressive: options.aggressiveNoiseFilter,
    extraSelectors: profile.removeSelectors,
  });
  diagnostics.push(...sanitized.diagnostics);
  stages.push({
    id: "sanitize",
    label: "Sanitiza\u00e7\u00e3o",
    detail: `${sanitized.removed} n\u00f3(s) de chrome removidos`,
  });

  const extraction = extractBlocks(doc.body, {
    aggressiveNoiseFilter: options.aggressiveNoiseFilter,
    userContainers: profile.userContainers,
    assistantContainers: profile.assistantContainers,
  });
  if (extraction.usedFallback) {
    diagnostics.push({
      level: "warn",
      code: "FALLBACK_EXTRACTOR",
      message:
        "P\u00e1gina sem elementos sem\u00e2nticos (p/li/pre). Extrator de fallback por n\u00f3s de texto foi usado.",
    });
  }
  if (extraction.blocks.length === 0) {
    throw new ConversionError(
      "NO_CONTENT",
      "Nenhum conte\u00fado de conversa encontrado. O arquivo pode ser uma p\u00e1gina de login ou um PDF salvo como HTML.",
      diagnostics,
    );
  }
  diagnostics.push({
    level: "info",
    code: "EXTRACT_OK",
    message: `${extraction.blocks.length} bloco(s) sem\u00e2ntico(s) extra\u00eddos (${extraction.dropped} descartado(s) como chrome).`,
  });
  stages.push({
    id: "extract",
    label: "Extra\u00e7\u00e3o sem\u00e2ntica",
    detail: `${extraction.blocks.length} bloco(s) \u00b7 ${extraction.dropped} descartado(s)`,
  });

  const resolution = resolveRoles(extraction.blocks, profile);
  diagnostics.push(...resolution.diagnostics);
  const { turns, confidence } = groupTurns(extraction.blocks, resolution.assignments);
  stages.push({
    id: "roles",
    label: "Atribui\u00e7\u00e3o de pap\u00e9is",
    detail: `${turns.length} turno(s) \u00b7 estrat\u00e9gia: ${resolution.source}`,
  });

  const userTurns = turns.filter((t) => t.role === "user").length;
  const assistantTurns = turns.filter((t) => t.role === "assistant").length;
  if (turns.length > 2 && (userTurns === 0 || assistantTurns === 0)) {
    diagnostics.push({
      level: "warn",
      code: "SINGLE_SPEAKER",
      message:
        "Apenas um interlocutor foi identificado. Revise o resultado: a heur\u00edstica pode n\u00e3o ter encontrado o ponto de virada.",
    });
  }

  const bodyPreview = turns.map((t) => t.lines.join("\n")).join("\n");
  const stamp = formatStamp(now, options.locale);
  const title = options.title?.trim() || inferTitle(doc, fileName, "Conversa Exportada");
  const markdown = buildDocument({
    turns,
    meta: { title, stamp, platform: profile.label, source: fileName },
    options,
    stats: {
      inputBytes: html.length,
      sanitizedElements: sanitized.removed,
      noiseBlocksDropped: extraction.dropped,
      blocksExtracted: extraction.blocks.length,
      turns: turns.length,
      userTurns,
      assistantTurns,
      words: countWords(bodyPreview),
      chars: bodyPreview.length,
      durationMs: 0,
      roleSource: resolution.source,
      confidence,
    },
    // stats.durationMs patched below
  });

  const durationMs = performance.now() - started;
  diagnostics.push({
    level: "info",
    code: "DONE",
    message: `Documento gerado em ${durationMs.toFixed(1)} ms.`,
  });
  stages.push({
    id: "render",
    label: "Renderiza\u00e7\u00e3o Markdown",
    detail: `${markdown.length.toLocaleString("pt-BR")} caracteres`,
  });

  return {
    markdown,
    fileName,
    outputName: safeOutputName(fileName),
    platform: profile.id,
    platformLabel: profile.label,
    turns,
    stats: {
      inputBytes: html.length,
      sanitizedElements: sanitized.removed,
      noiseBlocksDropped: extraction.dropped,
      blocksExtracted: extraction.blocks.length,
      turns: turns.length,
      userTurns,
      assistantTurns,
      words: countWords(bodyPreview),
      chars: bodyPreview.length,
      durationMs,
      roleSource: resolution.source,
      confidence,
    },
    diagnostics,
    stages,
  };
}

export { DEFAULT_OPTIONS, safeOutputName };
export type { ConvertResult, ConvertOptions, Diagnostic, PlatformProfile };
