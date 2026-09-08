/**
 * Lexicon of product chrome that must never leak into an exported document.
 *
 * Extracted from the legacy implementation, where it lived as an inline `set`
 * inside a 120-line function. Kept here as data so it can be unit tested,
 * translated and extended without touching pipeline code (Open/Closed).
 */

/** Elements that exist for layout / behaviour only. */
export const STRUCTURAL_NOISE: readonly string[] = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "canvas",
  "svg",
  "link",
  "meta",
  "form",
  "input",
  "select",
  "textarea",
  "button",
  "nav",
  "header",
  "footer",
  "aside",
  "dialog",
  "video",
  "audio",
];

/** Product-specific chrome, matched as CSS selectors. */
export const APP_CHROME: readonly string[] = [
  ".feedback-buttons",
  ".sharing-links",
  ".action-buttons",
  ".share-panel",
  "[data-testid='copy-button']",
  "[data-testid='share-button']",
  "[aria-label='Copiar']",
  "[aria-label='Copy']",
  "[role='toolbar']",
  ".sr-feedback",
  ".model-response-footer",
  ".conversation-actions",
];

/** Exact UI strings, matched case-insensitively after trimming. */
export const NOISE_TEXT: readonly string[] = [
  "Copiado",
  "Copiar",
  "Copy",
  "Copied",
  "Editar",
  "Edit",
  "Compartilhar link público",
  "Boa resposta",
  "Good response",
  "Resposta ruim",
  "Bad response",
  "Mais",
  "More",
  "Sobre esta resposta",
  "Economizou tempo",
  "Limpar",
  "Útil",
  "Abrangente",
  "Outro",
  "Incorreto",
  "Inadequado",
  "Não funciona direito",
  "Não",
  "Enviar",
  "Agradecemos a informação",
  "Facebook",
  "Gmail",
  "Reddit",
  "WhatsApp",
  "LinkedIn",
  "Telegram",
  "Regenerar",
  "Regenerate",
  "Nova conversa",
  "New chat",
  "You said:",
  "ChatGPT said:",
  "Você disse:",
  "A IA pode cometer erros. Por isso, cheque as respostas",
  "Uma cópia desta conversa será incluída.",
  "Este link público é válido por 7 dias e compartilha uma conversa, incluindo as informações pessoais que você adicionou.",
];

/**
 * Substring patterns that mark legal / consent boilerplate.
 *
 * Kept deliberately narrow: a broad `/cookie/i` would destroy a genuine answer
 * that merely mentions cookies (that was a real false positive caught in
 * review), so only label-shaped consent strings match.
 */
export const NOISE_PATTERNS: readonly RegExp[] = [
  /o google pode usar os dados/i,
  /solicita\u00e7\u00e3o de remo\u00e7\u00e3o judicial/i,
  /a ia pode cometer erros/i,
  /chatgpt pode cometer erros/i,
  /chatgpt can make mistakes/i,
  /ai mode pode cometer erros/i,
  /link p\u00fablico \u00e9 v\u00e1lido por/i,
  /ao continuar, voc\u00ea concorda/i,
  /^(cookies?|usamos cookies|aceitar cookies|gerenciar cookies)$/i,
];

const noiseSet = new Set(NOISE_TEXT.map((value) => value.toLocaleLowerCase("pt-BR")));

/**
 * A block is "pure chrome" when its entire text is a known UI label or
 * boilerplate. Length guards keep a genuine answer that merely *contains* the
 * word "cookie" from being destroyed.
 */
export function isPureChrome(text: string, aggressive = true): boolean {
  const value = text.trim();
  if (!value) return true;
  const normalized = value.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  if (noiseSet.has(normalized)) return true;
  if (!aggressive) return false;
  if (normalized.length > 160) return false;
  return NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** True when the block is short enough to plausibly be a button label. */
export function looksLikeLabel(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 64) return false;
  if (value.includes("\n")) return false;
  return noiseSet.has(value.toLocaleLowerCase("pt-BR").replace(/\s+/g, " "));
}
