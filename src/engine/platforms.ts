import type { PlatformId, PlatformProfile } from "./types";

/**
 * Platform knowledge lives in data, not in `if` branches scattered through the
 * pipeline. Adding a new chat product = adding an entry here.
 */
export const PLATFORM_PROFILES: Record<PlatformProfile["id"], PlatformProfile> = {
  "google-ai": {
    id: "google-ai",
    label: "Google AI Mode / Search",
    roleAttributes: ["data-message-id"],
    userContainers: [".query-content", "[data-message-id='user']"],
    assistantContainers: [".model-response-text", "[data-message-id='assistant']"],
    removeSelectors: [
      ".search-suggestion",
      ".related-questions",
      ".sources-panel",
      ".aim-chip",
    ],
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    roleAttributes: ["data-message-author-role"],
    userContainers: ["[data-message-author-role='user']"],
    assistantContainers: ["[data-message-author-role='assistant']"],
    removeSelectors: [
      "[data-testid='composer-actions']",
      "[data-testid='conversation-turn-actions']",
      ".agent-turn-actions",
    ],
  },
  generic: {
    id: "generic",
    label: "HTML genérico",
    roleAttributes: [],
    userContainers: [".user-message", ".from-user", "#pergunta"],
    assistantContainers: [".assistant-message", ".from-assistant", ".resposta"],
    removeSelectors: [],
  },
};

/** Best-effort platform fingerprinting, used when `platform === "auto"`. */
export function detectPlatform(doc: Document): PlatformProfile {
  if (doc.querySelector("[data-message-author-role]")) return PLATFORM_PROFILES.chatgpt;
  if (
    doc.querySelector(".model-response-text") ||
    doc.querySelector(".query-content") ||
    doc.querySelector("[data-message-id]")
  ) {
    return PLATFORM_PROFILES["google-ai"];
  }
  if (doc.querySelector(".user-message, .assistant-message")) return PLATFORM_PROFILES.generic;
  return PLATFORM_PROFILES.generic;
}

export function profileFor(id: PlatformId, doc: Document): PlatformProfile {
  return id === "auto" ? detectPlatform(doc) : PLATFORM_PROFILES[id];
}

/** DOM title fallback chain, used for the front-matter title. */
export function inferTitle(doc: Document, fileName: string, fallback: string): string {
  const candidates = [
    doc.querySelector("meta[property='og:title']")?.getAttribute("content"),
    doc.querySelector("h1")?.textContent,
    doc.title,
  ];
  const found = candidates.map((c) => (c ?? "").replace(/\s+/g, " ").trim()).find(Boolean);
  if (found && found.length > 3) return found.slice(0, 120);
  return fileName.replace(/\.html?$/i, "") || fallback;
}
