import { ConversionError, convertHtmlToMarkdown } from "./convert";
import { CHATGPT_FIXTURE, EMPTY_FIXTURE, FIXTURES, GOOGLE_AI_FIXTURE } from "./fixtures";
import { safeOutputName } from "./markdown";
import { isPureChrome } from "./noise";
import { extractBlocks } from "./segment";
import { sanitizeDocument } from "./sanitize";
import { assignHeuristicRoles } from "./roles";

export type TestStatus = "pass" | "fail";

export interface TestResult {
  id: string;
  group: string;
  name: string;
  status: TestStatus;
  message?: string;
  ms: number;
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
}

function parse(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body;
}

type TestCase = { id: string; group: string; name: string; fn: () => void };

const TESTS: readonly TestCase[] = [
  {
    id: "T01",
    group: "Sanitiza\u00e7\u00e3o",
    name: "remove <script> e <style> sem tocar no texto do di\u00e1logo",
    fn: () => {
      const body = parse(GOOGLE_AI_FIXTURE);
      const report = sanitizeDocument(body, { aggressive: true });
      assert(!body.querySelector("script,style"), "script/style sobreviveram");
      assert(body.textContent?.includes("garbage collector"), "conte\u00fado leg\u00edtimo foi apagado");
      assert(report.removed > 0, "nenhum n\u00f3 removido");
    },
  },
  {
    id: "T02",
    group: "Sanitiza\u00e7\u00e3o",
    name: "descarta r\u00f3tulos de bot\u00f5es (Copiar / Boa resposta)",
    fn: () => {
      assert(isPureChrome("Copiar", true), "'Copiar' deveria ser chrome");
      assert(isPureChrome("uma c\u00f3pia desta conversa ser\u00e1 inclu\u00edda.", true), "boilerplate deveria ser chrome");
      assert(!isPureChrome("O garbage collector usa cookies de refer\u00eancia e muito texto real aqui para passar do limite de seguran\u00e7a configurado acima.", true), "resposta real marcada como chrome (falso positivo)");
    },
  },
  {
    id: "T03",
    group: "Extra\u00e7\u00e3o",
    name: "preserva bloco de c\u00f3digo com fence e linguagem",
    fn: () => {
      const { blocks } = extractBlocks(parse(GOOGLE_AI_FIXTURE), { aggressiveNoiseFilter: true });
      const code = blocks.find((b) => b.kind === "code");
      assert(!!code, "bloco de c\u00f3digo n\u00e3o encontrado");
      assert(code!.text.startsWith("```python"), `fence incorreto: ${code!.text.slice(0, 12)}`);
      assert(code!.text.includes("gc.collect()"), "corpo do c\u00f3digo perdido");
    },
  },
  {
    id: "T04",
    group: "Extra\u00e7\u00e3o",
    name: "converte listas ordenadas com numera\u00e7\u00e3o expl\u00edcita",
    fn: () => {
      const { blocks } = extractBlocks(parse(CHATGPT_FIXTURE), { aggressiveNoiseFilter: true });
      const item = blocks.find((b) => b.kind === "list-item" && b.text.startsWith("2."));
      assert(!!item, "numera\u00e7\u00e3o da lista ordenada foi perdida");
    },
  },
  {
    id: "T05",
    group: "Extra\u00e7\u00e3o",
    name: "renderiza tabela Markdown com cabe\u00e7alho e separador",
    fn: () => {
      const { blocks } = extractBlocks(parse(GOOGLE_AI_FIXTURE), { aggressiveNoiseFilter: true });
      const table = blocks.find((b) => b.kind === "table");
      assert(!!table, "tabela perdida");
      assert(table!.text.includes("| Cen\u00e1rio | Risco |"), "cabe\u00e7alho incorreto");
      assert(table!.text.includes("---"), "separador ausente");
    },
  },
  {
    id: "T06",
    group: "Pap\u00e9is",
    name: "Google AI Mode (sem metadados) produz 2 turnos de usu\u00e1rio",
    fn: () => {
      const result = convertHtmlToMarkdown(GOOGLE_AI_FIXTURE, "modo-ia.html", { now: new Date(2026, 0, 5, 9, 30, 0) });
      assertEqual(result.stats.turns >= 3, true, "quantidade de turnos");
      assert(result.stats.userTurns >= 2, `esperava >= 2 turnos de usu\u00e1rio, obtive ${result.stats.userTurns}`);
      assertEqual(result.stats.roleSource, "heuristic", "fonte dos pap\u00e9is");
    },
  },
  {
    id: "T07",
    group: "Pap\u00e9is",
    name: "ChatGPT (data-message-author-role) tem confian\u00e7a 100%",
    fn: () => {
      const result = convertHtmlToMarkdown(CHATGPT_FIXTURE, "chat.html");
      assertEqual(result.stats.roleSource, "attributes", "fonte dos pap\u00e9is");
      assertEqual(result.stats.confidence, 1, "confian\u00e7a");
      assertEqual(result.turns.length, 4, "turnos");
      assertEqual(result.turns[0].role, "user", "primeiro turno");
      assertEqual(result.turns[1].role, "assistant", "segundo turno");
    },
  },
  {
    id: "T08",
    group: "Pap\u00e9is",
    name: "heur\u00edstica classifica pergunta direta como usu\u00e1rio",
    fn: () => {
      const [first] = assignHeuristicRoles([
        { index: 0, kind: "paragraph", text: "Como fa\u00e7o para testar um pipeline de convers\u00e3o?", source: "p", declaredRole: null },
      ]);
      assertEqual(first.role, "user", "classifica\u00e7\u00e3o");
    },
  },
  {
    id: "T09",
    group: "Documento",
    name: "front-matter cont\u00e9m title, date, time e platform",
    fn: () => {
      const result = convertHtmlToMarkdown(GOOGLE_AI_FIXTURE, "x.html", { now: new Date(2026, 0, 5, 9, 30, 0) });
      assert(result.markdown.startsWith("---\n"), "front-matter ausente");
      assert(result.markdown.includes('date: 05/01/2026'), "data incorreta");
      assert(result.markdown.includes("time: 09:30:00"), "hora incorreta");
      assert(result.markdown.includes("platform:"), "plataforma ausente");
    },
  },
  {
    id: "T10",
    group: "Documento",
    name: "nenhum r\u00f3tulo de UI vaza para o Markdown final",
    fn: () => {
      const result = convertHtmlToMarkdown(GOOGLE_AI_FIXTURE, "x.html");
      for (const leaked of ["Compartilhar link p\u00fablico", "Boa resposta", "Copiar", "O Google pode usar os dados"]) {
        assert(!result.markdown.includes(leaked), `vazamento de chrome: ${leaked}`);
      }
    },
  },
  {
    id: "T11",
    group: "Documento",
    name: "turnos separados por '---' e sa\u00edda termina com newline",
    fn: () => {
      const result = convertHtmlToMarkdown(CHATGPT_FIXTURE, "chat.html");
      assert(result.markdown.includes("\n---\n"), "separador ausente");
      assert(result.markdown.endsWith("\n"), "arquivo deve terminar com \\n");
      assert(!/\n{4,}/.test(result.markdown), "excesso de linhas em branco");
    },
  },
  {
    id: "T12",
    group: "Robustez",
    name: "nomes de arquivo amb\u00edguos n\u00e3o s\u00e3o corrompidos",
    fn: () => {
      assertEqual(safeOutputName("export quebrado.HTML"), "export-quebrado.md", "extens\u00e3o mai\u00fascula");
      assertEqual(safeOutputName("a.html.bak"), "a.html.bak.md", "duplo sufixo");
      assertEqual(safeOutputName("relat\u00f3rio final.html"), "relatorio-final.md", "acentos");
      assertEqual(safeOutputName(""), "conversa.md", "nome vazio");
    },
  },
  {
    id: "T13",
    group: "Robustez",
    name: "entrada sem conversa falha com erro tipado NO_CONTENT",
    fn: () => {
      let code = "";
      try {
        convertHtmlToMarkdown(EMPTY_FIXTURE, "login.html");
      } catch (error) {
        code = error instanceof ConversionError ? error.code : "";
      }
      assertEqual(code, "NO_CONTENT", "c\u00f3digo do erro");
    },
  },
  {
    id: "T14",
    group: "Robustez",
    name: "entrada vazia \u00e9 rejeitada antes do parse",
    fn: () => {
      let code = "";
      try {
        convertHtmlToMarkdown("   ", "vazio.html");
      } catch (error) {
        code = error instanceof ConversionError ? error.code : "";
      }
      assertEqual(code, "EMPTY_INPUT", "c\u00f3digo do erro");
    },
  },
  {
    id: "T15",
    group: "Determinismo",
    name: "mesma entrada + rel\u00f3gio injetado = sa\u00edda byte a byte",
    fn: () => {
      const clock = new Date(2026, 0, 5, 9, 30, 0);
      const a = convertHtmlToMarkdown(GOOGLE_AI_FIXTURE, "x.html", { now: clock });
      const b = convertHtmlToMarkdown(GOOGLE_AI_FIXTURE, "x.html", { now: clock });
      assertEqual(a.markdown, b.markdown, "sa\u00edda determin\u00edstica");
    },
  },
  {
    id: "T16",
    group: "Determinismo",
    name: "todo fixture do cat\u00e1logo produz Markdown n\u00e3o vazio (exceto os esperados)",
    fn: () => {
      for (const fixture of FIXTURES) {
        if (fixture.id === "empty") continue;
        const result = convertHtmlToMarkdown(fixture.html, fixture.fileName);
        assert(result.markdown.length > 80, `${fixture.id}: documento suspeito`);
      }
    },
  },
];

export function runSelfTests(): TestResult[] {
  return TESTS.map((test) => {
    const started = performance.now();
    try {
      test.fn();
      return { ...test, status: "pass" as TestStatus, ms: performance.now() - started };
    } catch (error) {
      return {
        ...test,
        status: "fail" as TestStatus,
        message: error instanceof Error ? error.message : String(error),
        ms: performance.now() - started,
      };
    }
  });
}

export const TEST_COUNT = TESTS.length;
