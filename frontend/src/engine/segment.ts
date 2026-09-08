import { isPureChrome } from "./noise";
import type { Block, BlockKind, Role } from "./types";

const SEMANTIC_SELECTOR =
  "h1,h2,h3,h4,h5,h6,p,li,dt,dd,pre,blockquote,figcaption,table";

const INLINE_ONLY = new Set(["STRONG", "B", "EM", "I", "CODE", "A", "SPAN", "DEL", "S", "MARK", "U", "SMALL", "SUB", "SUP"]);

const FENCE_LANGUAGE = /language-([a-z0-9+#-]+)/i;

function detectLanguage(el: Element): string | undefined {
  const classList = `${el.className} ${el.querySelector("code")?.className ?? ""}`;
  const match = FENCE_LANGUAGE.exec(classList);
  return match ? match[1].toLowerCase() : undefined;
}

function escapeFence(body: string): { body: string; fence: string } {
  const longest = body.match(/`{3,}/g);
  const max = longest ? Math.max(...longest.map((s) => s.length)) : 0;
  return { body, fence: "`".repeat(Math.max(3, max + 1)) };
}

function renderText(value: string): string {
  return value.replace(/\s+/g, " ");
}

/** Inline DOM -> Markdown, preserving emphasis, links, inline code and breaks. */
export function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return renderText(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName;

  if (tag === "BR") return "\n";
  if (tag === "IMG") {
    const alt = el.getAttribute("alt") ?? "imagem";
    const src = el.getAttribute("src") ?? "";
    return src ? `![${alt}](${src})` : `[${alt}]`;
  }

  const inner = Array.from(el.childNodes).map(inlineToMarkdown).join("");

  switch (tag) {
    case "STRONG":
    case "B":
      return inner.trim() ? `**${inner.trim()}**` : "";
    case "EM":
    case "I":
      return inner.trim() ? `*${inner.trim()}*` : "";
    case "DEL":
    case "S":
      return inner.trim() ? `~~${inner.trim()}~~` : "";
    case "CODE": {
      const raw = el.textContent ?? "";
      if (!raw.trim()) return "";
      return raw.includes("`") ? `\`\` ${raw} \`\`` : `\`${raw}\``;
    }
    case "A": {
      const href = el.getAttribute("href") ?? "";
      if (!inner.trim()) return "";
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) return inner;
      return `[${inner.trim()}](${href})`;
    }
    case "UL":
    case "OL":
      return inner; // handled by the list renderer
    default:
      return inner;
  }
}

function listMarker(el: Element): string {
  const parent = el.parentElement;
  if (!parent) return "-";
  if (parent.tagName === "OL") {
    const siblings = Array.from(parent.children).filter((c) => c.tagName === "LI");
    const position = siblings.indexOf(el) + 1;
    return `${position || 1}.`;
  }
  const isTask = el.classList.contains("contains-task-list") || el.querySelector("input[type='checkbox']");
  return isTask ? "- [ ]" : "-";
}

function renderTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return "";
  const cellsOf = (row: Element) =>
    Array.from(row.querySelectorAll("th,td")).map(
      (cell) => renderText(inlineToMarkdown(cell)).trim() || " ",
    );

  const header = cellsOf(rows[0]);
  const body = rows.slice(1).map(cellsOf);
  const width = Math.max(header.length, ...body.map((r) => r.length), 1);
  const pad = (row: string[]) => {
    const filled = [...row];
    while (filled.length < width) filled.push(" ");
    return `| ${filled.join(" | ")} |`;
  };

  const lines = [pad(header), `| ${header.map(() => "---").join(" | ")} |`];
  for (const row of body) lines.push(pad(row));
  return lines.join("\n");
}

/** Normalises a block's text: collapses runs of blank lines, trims edges. */
function tidy(lines: string[], maxBlank = 1): string {
  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (!line.trim()) {
      blanks += 1;
      if (blanks > maxBlank) continue;
      out.push("");
      continue;
    }
    blanks = 0;
    out.push(line.replace(/[ \t]+$/g, ""));
  }
  return out.join("\n").trim();
}

function headKind(tagName: string): { kind: BlockKind; level?: number } {
  if (/^H[1-6]$/.test(tagName)) {
    return { kind: "heading", level: Number(tagName.slice(1)) };
  }
  if (tagName === "BLOCKQUOTE") return { kind: "quote" };
  return { kind: "paragraph" };
}

function pushBlock(
  blocks: Block[],
  el: Element,
  kind: BlockKind,
  text: string,
  extras: Partial<Block> = {},
  containerRole: Role | null = null,
): void {
  const value = text.trim();
  if (!value) return;
  blocks.push({
    index: blocks.length,
    kind,
    text: value,
    source: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/)[0]}` : ""),
    declaredRole: declaredRoleOf(el),
    containerRole,
    ...extras,
  });
}

/**
 * Reads an *explicit* author role from platform metadata.
 *
 * Class-name guessing does NOT belong here: it is a heuristic, and heuristics
 * live in `roles.ts`. Declared metadata is deterministic and is the only thing
 * allowed to claim `confidence = 1`.
 */
export function declaredRoleOf(el: Element): Role | null {
  const attr = el.closest("[data-message-author-role], [data-role]");
  const value = attr?.getAttribute("data-message-author-role") ?? attr?.getAttribute("data-role");
  if (value === "user" || value === "assistant" || value === "system") return value;
  return null;
}

/** Strong (but not declared) evidence from the platform's layout containers. */
export function containerRoleOf(
  el: Element,
  containers: { user?: readonly string[]; assistant?: readonly string[] },
): Role | null {
  const matches = (selectors?: readonly string[]) => {
    if (!selectors?.length) return false;
    return selectors.some((selector) => {
      try {
        return el.closest(selector) !== null;
      } catch {
        return false;
      }
    });
  };
  if (matches(containers.user)) return "user";
  if (matches(containers.assistant)) return "assistant";
  return null;
}

interface Candidate {
  el: Element;
  kind: BlockKind;
  level?: number;
  marker?: string;
  lang?: string;
  /** Raw text accumulated from inline siblings merged into this candidate. */
  accumulated?: string;
}

function collectCandidates(root: HTMLElement): Candidate[] {
  const accepted = new Set<Element>();
  const candidates: Candidate[] = [];

  for (const el of Array.from(root.querySelectorAll(SEMANTIC_SELECTOR))) {
    if (hasAcceptedAncestor(el, accepted)) continue;

    const tag = el.tagName;
    if (tag === "PRE") {
      accepted.add(el);
      candidates.push({ el, kind: "code", lang: detectLanguage(el) });
      continue;
    }
    if (tag === "TABLE") {
      accepted.add(el);
      candidates.push({ el, kind: "table" });
      continue;
    }
    if (tag === "LI" || tag === "DT" || tag === "DD") {
      accepted.add(el);
      candidates.push({ el, kind: "list-item", marker: listMarker(el) });
      continue;
    }
    // p / headings / blockquote: only accept true leaves so that nested
    // structures are handled by their own element instead of being flattened.
    if (el.querySelector(SEMANTIC_SELECTOR)) continue;
    if (!hasDirectText(el)) continue;
    accepted.add(el);
    const { kind, level } = headKind(tag);
    candidates.push({ el, kind, level });
  }

  return candidates;
}

function hasAcceptedAncestor(el: Element, accepted: Set<Element>): boolean {
  let cursor = el.parentElement;
  while (cursor) {
    if (accepted.has(cursor)) return true;
    cursor = cursor.parentElement;
  }
  return false;
}

function hasDirectText(el: Element): boolean {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim()) return true;
    if (child.nodeType === Node.ELEMENT_NODE && INLINE_ONLY.has((child as Element).tagName)) return true;
  }
  return false;
}

/**
 * Fallback for pages that wrap the conversation in bare <div>/<span> trees
 * with no semantic elements at all. Consecutive inline fragments belonging to
 * the same parent are merged back together so paragraphs are not shredded.
 */
function collectFromTextOwners(root: HTMLElement): Candidate[] {
  const accepted = new Set<Element>();
  const candidates: Candidate[] = [];

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (hasAcceptedAncestor(el, accepted)) continue;
    if (!hasDirectText(el)) continue;
    const previous = candidates[candidates.length - 1];
    const continuesInline =
      !!previous &&
      previous.el.parentElement === el.parentElement &&
      previous.el.nextElementSibling === el;
    accepted.add(el);
    if (continuesInline) {
      // `<p>A <strong>B</strong></p>` yields two text owners; keep them as a
      // single paragraph by accumulating the raw text on the first candidate.
      previous.accumulated = `${previous.accumulated ?? ""} ${el.textContent ?? ""}`;
      continue;
    }
    const { kind, level } = headKind(el.tagName);
    candidates.push({
      el,
      kind: kind === "paragraph" && el.tagName === "DIV" ? "text" : kind,
      level,
    });
  }

  return candidates;
}

export interface ExtractionReport {
  blocks: Block[];
  dropped: number;
  usedFallback: boolean;
}

/**
 * Stage 3 of the pipeline: DOM -> ordered semantic blocks.
 *
 * Replaces the legacy `soup.get_text(separator="\n")`, which irreversibly
 * destroyed lists, tables, code fences and paragraph boundaries.
 */
export function extractBlocks(
  root: HTMLElement,
  options: {
    aggressiveNoiseFilter: boolean;
    userContainers?: readonly string[];
    assistantContainers?: readonly string[];
  },
): ExtractionReport {
  let candidates = collectCandidates(root);
  let usedFallback = false;

  const textual = candidates.length;
  if (textual < 3) {
    const fallback = collectFromTextOwners(root);
    if (fallback.length > candidates.length) {
      candidates = fallback;
      usedFallback = true;
    }
  }

  const blocks: Block[] = [];
  let dropped = 0;

  for (const candidate of candidates) {
    let text: string;
    let kind = candidate.kind;
    let extras: Partial<Block> = {};
    const hint = containerRoleOf(candidate.el, {
      user: options.userContainers,
      assistant: options.assistantContainers,
    });

    if (kind === "code") {
      const raw = (candidate.el.textContent ?? "").replace(/\u00a0/g, " ");
      const { body, fence } = escapeFence(raw.replace(/\s+$/g, ""));
      text = `${candidate.lang ? fence + candidate.lang : fence}\n${body.replace(/^\n+/, "")}\n${fence}`;
      extras = { lang: candidate.lang };
    } else if (kind === "table") {
      text = renderTable(candidate.el);
    } else if (kind === "list-item") {
      const nested = Array.from(candidate.el.childNodes).map(inlineToMarkdown).join("");
      text = `${candidate.marker ?? "-"} ${tidy(nested.split("\n")).replace(/\n+/g, "\n  ")}`;
    } else if (kind === "quote") {
      text = tidy([inlineToMarkdown(candidate.el)])
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    } else if (kind === "heading") {
      text = renderText(inlineToMarkdown(candidate.el)).trim();
      extras = { level: candidate.level };
    } else if (candidate.accumulated !== undefined) {
      text = tidy(candidate.accumulated.split("\n"));
    } else {
      text = tidy([inlineToMarkdown(candidate.el)]);
    }

    if (kind !== "code" && isPureChrome(text, options.aggressiveNoiseFilter)) {
      dropped += 1;
      continue;
    }

    pushBlock(blocks, candidate.el, kind, text, extras, hint);
  }

  return { blocks: blocks.map((b, i) => ({ ...b, index: i })), dropped, usedFallback };
}
