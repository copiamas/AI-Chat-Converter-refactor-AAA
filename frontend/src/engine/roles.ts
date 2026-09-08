import type { Block, Diagnostic, PlatformProfile, Role, RoleSource, Turn } from "./types";

export interface RoleAssignment {
  role: Role;
  confidence: number;
  signals: string[];
}

interface Marker {
  re: RegExp;
  weight: number;
  label: string;
}

/**
 * Lexical evidence that a block was written by the human.
 *
 * The legacy implementation hard-coded three triggers copied from a *single*
 * conversation ("explique isso:", "agora essa essa aqui:"), which silently
 * mis-segmented every other chat. These lexicons are generic, weighted and
 * unit-testable.
 */
export const USER_MARKERS: readonly Marker[] = [
  { re: /^explique\s+/i, weight: 2.4, label: "imperativo:explique" },
  { re: /^(agora|e)\s+(essa|este|agora)/i, weight: 2.0, label: "transi\u00e7\u00e3o:agora-essa" },
  { re: /^contexto\s+da\s+pergunta/i, weight: 2.6, label: "marcador:contexto" },
  { re: /^(me\s+)?(explica|explique|cria|crie|faz|fa\u00e7a|monta|monte|gera|gere|lista|liste|resume|resuma|traduza|escreva|melhore|corrija|review|revise)\b/i, weight: 2.2, label: "imperativo" },
  { re: /^(como|qual|quais|quando|onde|quem|por que|porque|quanto)\b/i, weight: 1.8, label: "palavra-interrogativa" },
  { re: /^(posso|pode|poderia|consegue|consegue me|gostaria|queria|preciso|quero|tenho|estou)\b/i, weight: 1.6, label: "primeira-pessoa" },
  { re: /\b(meu|minha|meus|minhas|eu|estou tentando|t\u00f4 tentando|na minha)\b/i, weight: 0.6, label: "pronome-1a-pessoa" },
  { re: /^(explain|how (do|can|to)|can you|could you|write|create|give me|i need|i want|please|show me)\b/i, weight: 2.2, label: "imperativo:en" },
  { re: /\?(\s|$)/, weight: 1.6, label: "interroga\u00e7\u00e3o" },
];

/** Lexical evidence that a block was written by the model. */
export const ASSISTANT_MARKERS: readonly Marker[] = [
  { re: /^(aqui (est\u00e1|est\u00e1 uma|va) |segue |segue abaixo|compilado)/i, weight: 2.4, label: "entrega:seguir" },
  { re: /^(claro|com certeza|perfeito|\u00f3timo|excelente|sensacional|ah,|entendido|show|beleza)\b/i, weight: 2.0, label: "acolhimento" },
  { re: /^(para esse|neste caso|nesse cen\u00e1rio|vamos (l\u00e1|come\u00e7ar)|resumo|em resumo|passo a passo)/i, weight: 1.8, label: "estrutura" },
  { re: /^(sure|certainly|here(?:'s| is)|great question|absolutely|of course|let's)\b/i, weight: 2.2, label: "acolhimento:en" },
  { re: /^(aten\u00e7\u00e3o|importante|observa\u00e7\u00e3o|nota|conclus\u00e3o|pr\u00f3ximo[s]? passos?)/i, weight: 1.2, label: "advert\u00eancia" },
  { re: /^\s*(#{1,6}\s|[-*]\s|\d+\.\s|>\s|```)/, weight: 1.6, label: "markdown" },
  { re: /\*\*[^*]+\*\*/, weight: 0.8, label: "negrito" },
];

export interface Scored {
  user: number;
  assistant: number;
  signals: string[];
}

export function scoreBlock(block: Block): Scored {
  const text = block.text;
  const signals: string[] = [];
  let user = 0;
  let assistant = 0;

  // Layout containers are strong evidence: the platform groups each side of the
  // conversation for visual reasons, which is far more stable than vocabulary.
  if (block.containerRole === "user") {
    user += 3.2;
    signals.push("+U:container");
  } else if (block.containerRole === "assistant") {
    assistant += 3.2;
    signals.push("+A:container");
  }

  for (const marker of USER_MARKERS) {
    if (marker.re.test(text)) {
      user += marker.weight;
      signals.push(`+U:${marker.label}`);
    }
  }
  for (const marker of ASSISTANT_MARKERS) {
    if (marker.re.test(text)) {
      assistant += marker.weight;
      signals.push(`+A:${marker.label}`);
    }
  }

  const length = text.length;
  if (length > 420) {
    assistant += 1.2;
    signals.push("+A:longo");
  } else if (length < 180) {
    user += 0.5;
    signals.push("+U:curto");
  }
  if (block.kind === "code") {
    assistant += 1.0;
    signals.push("+A:bloco-c\u00f3digo");
  }
  if (block.kind === "list-item") {
    assistant += 0.7;
    signals.push("+A:lista");
  }
  if (block.kind === "heading" && (block.level ?? 6) <= 3) {
    assistant += 0.6;
    signals.push("+A:t\u00edtulo");
  }
  if (/\b(obrigado|valeu|blz|entendi|perfeito, obrigado|top)\b/i.test(text) && length < 120) {
    user += 1.4;
    signals.push("+U:agradecimento");
  }

  return { user, assistant, signals };
}

const FLIP_THRESHOLD = 2.2;

/**
 * Heuristic strategy: a state machine with hysteresis. Blocks without strong
 * evidence inherit the current speaker, which mirrors how a conversation
 * alternates and prevents per-block flip-flopping.
 */
export function assignHeuristicRoles(blocks: readonly Block[], initial: Role = "user"): RoleAssignment[] {
  let current: Role = initial;
  return blocks.map((block) => {
    const scored = scoreBlock(block);
    const margin = scored.user - scored.assistant;
    // Hysteresis: a flip needs a clear margin *and* a winning score above the
    // threshold, so weak evidence inherits the current speaker.
    if (margin >= FLIP_THRESHOLD && scored.user >= FLIP_THRESHOLD) {
      current = "user";
    } else if (-margin >= FLIP_THRESHOLD && scored.assistant >= FLIP_THRESHOLD) {
      current = "assistant";
    }
    const confidence = Math.min(0.95, 0.55 + Math.abs(margin) / 12);
    return { role: current, confidence, signals: scored.signals.slice(0, 4) };
  });
}

/** Explicit strategy: trust platform metadata (`data-message-author-role`). */
export function assignDeclaredRoles(blocks: readonly Block[]): RoleAssignment[] {
  return blocks.map((block) => ({
    role: block.declaredRole ?? "assistant",
    confidence: block.declaredRole ? 1 : 0.4,
    signals: block.declaredRole ? ["meta:atributo"] : ["meta:ausente"],
  }));
}

export interface RoleResolution {
  assignments: RoleAssignment[];
  source: RoleSource;
  diagnostics: Diagnostic[];
}

/**
 * Composite resolver (Open/Closed + Dependency Inversion): metadata wins when
 * the platform provides it, otherwise the heuristic state machine takes over.
 */
export function resolveRoles(
  blocks: readonly Block[],
  profile: PlatformProfile,
): RoleResolution {
  const diagnostics: Diagnostic[] = [];
  const declared = blocks.filter((b) => b.declaredRole).length;

  if (blocks.length === 0) {
    return {
      assignments: [],
      source: "none",
      diagnostics: [
        { level: "warn", code: "NO_BLOCKS", message: "Nenhum bloco de texto foi encontrado no documento." },
      ],
    };
  }

  if (declared === blocks.length) {
    diagnostics.push({
      level: "info",
      code: "ROLES_DECLARED",
      message: `Pap\u00e9is lidos direto do DOM (${profile.label}) \u2014 confian\u00e7a m\u00e1xima.`,
    });
    return { assignments: assignDeclaredRoles(blocks), source: "attributes", diagnostics };
  }

  if (declared === 0) {
    diagnostics.push({
      level: "info",
      code: "ROLES_HEURISTIC",
      message: "Plataforma sem metadados de autoria \u2014 usando m\u00e1quina de estados l\u00e9xica.",
    });
    return { assignments: assignHeuristicRoles(blocks), source: "heuristic", diagnostics };
  }

  const assignments = blocks.map((block) =>
    block.declaredRole
      ? { role: block.declaredRole, confidence: 1, signals: ["meta:atributo"] }
      : assignHeuristicRoles([block])[0],
  );
  diagnostics.push({
    level: "warn",
    code: "ROLES_MIXED",
    message: `${declared}/${blocks.length} blocos com metadados; o restante foi inferido por heur\u00edstica.`,
  });
  return { assignments, source: "mixed", diagnostics };
}

/** Groups blocks into turns and reports an overall confidence for the run. */
export function groupTurns(
  blocks: readonly Block[],
  assignments: readonly RoleAssignment[],
): { turns: Turn[]; confidence: number } {
  const turns: Turn[] = [];

  blocks.forEach((block, i) => {
    const assignment = assignments[i];
    const last = turns[turns.length - 1];
    if (last && last.role === assignment.role) {
      last.lines.push(block.text);
      last.confidence = (last.confidence + assignment.confidence) / 2;
      last.signals = Array.from(new Set([...last.signals, ...assignment.signals])).slice(0, 6);
    } else {
      turns.push({
        index: turns.length,
        role: assignment.role,
        lines: [block.text],
        confidence: assignment.confidence,
        signals: [...assignment.signals],
      });
    }
  });

  const avg = turns.length
    ? turns.reduce((sum, turn) => sum + turn.confidence, 0) / turns.length
    : 0;
  // A conversation that only produced one speaker is suspicious.
  const singleSpeaker = turns.length > 2 && turns.every((t) => t.role === turns[0].role);
  const confidence = Math.max(0.35, Math.min(1, avg * (singleSpeaker ? 0.7 : 1)));

  return { turns, confidence };
}
