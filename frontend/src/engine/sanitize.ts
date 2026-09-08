import { APP_CHROME, STRUCTURAL_NOISE, isPureChrome, looksLikeLabel } from "./noise";
import type { Diagnostic } from "./types";

export interface SanitizeReport {
  removed: number;
  diagnostics: Diagnostic[];
}

const BLOCKISH = new Set([
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "UL",
  "OL",
  "LI",
  "P",
  "PRE",
  "TABLE",
  "TBODY",
  "THEAD",
  "TR",
  "TD",
  "TH",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
]);

function removeSelector(root: ParentNode, selector: string): number {
  let removed = 0;
  let nodes: Element[];
  try {
    nodes = Array.from(root.querySelectorAll(selector));
  } catch {
    return 0; // invalid selector in a profile must never break the run
  }
  for (const node of nodes) {
    node.parentElement?.removeChild(node);
    removed += 1;
  }
  return removed;
}

/**
 * Stage 2 of the pipeline.
 *
 * Rule #1: never delete content. Only chrome (elements that exist to serve the
 * product UI) and empty containers are removed, and removal of *text* happens
 * exclusively for nodes that are entirely composed of a known UI label.
 */
export function sanitizeDocument(
  root: Document | HTMLElement,
  options: { aggressive: boolean; extraSelectors?: readonly string[] },
): SanitizeReport {
  const diagnostics: Diagnostic[] = [];
  const host = root instanceof Document ? root.documentElement : root;
  if (!host) return { removed: 0, diagnostics };

  const selectors = [
    ...STRUCTURAL_NOISE,
    ...APP_CHROME,
    ...(options.extraSelectors ?? []),
  ];
  let removed = removeSelector(host, selectors.join(","));

  // Elements whose *entire* text is a UI label ("Copiar", "Boa resposta", ...).
  if (options.aggressive) {
    const walker = Array.from(host.querySelectorAll<HTMLElement>("*"));
    for (const node of walker) {
      if (!node.isConnected) continue;
      if (node.querySelector("p,li,pre,table,h1,h2,h3,h4,h5,h6")) continue;
      const text = node.textContent ?? "";
      if (text.trim() && looksLikeLabel(text)) {
        node.parentElement?.removeChild(node);
        removed += 1;
      }
    }
  }

  // Prune empty leaves bottom-up so we do not emit blank turns.
  let pruned = 0;
  let guard = 0;
  let previous = -1;
  while (pruned !== previous && guard < 24) {
    previous = pruned;
    guard += 1;
    const leaves = Array.from(host.querySelectorAll<HTMLElement>("*")).reverse();
    for (const node of leaves) {
      if (!node.isConnected || !BLOCKISH.has(node.tagName)) continue;
      if (node.querySelector("img,video,canvas,hr")) continue;
      const hasText = (node.textContent ?? "").trim().length > 0;
      const hasElementChildren = node.children.length > 0;
      if (!hasText && !hasElementChildren) {
        node.parentElement?.removeChild(node);
        pruned += 1;
      }
    }
  }
  removed += pruned;

  // Containers that only wrap chrome labels left behind by the previous pass.
  if (options.aggressive) {
    for (const node of Array.from(host.querySelectorAll<HTMLElement>("div,span"))) {
      if (!node.isConnected) continue;
      if (node.querySelector("p,li,pre,table,h1,h2,h3,h4,h5,h6,img")) continue;
      const text = (node.textContent ?? "").trim();
      if (text && isPureChrome(text, true)) {
        node.parentElement?.removeChild(node);
        removed += 1;
      }
    }
  }

  diagnostics.push({
    level: "info",
    code: "SANITIZE_OK",
    message: `${removed} n\u00f3(s) de interface removidos antes da extra\u00e7\u00e3o sem\u00e2ntica.`,
  });

  return { removed, diagnostics };
}
