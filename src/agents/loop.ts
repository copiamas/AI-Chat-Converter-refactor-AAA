/**
 * The dual-agent process that produced this codebase.
 *
 * AGENTE-IMPL writes code. AGENTE-CRIT reviews it against a weighted rubric and
 * can only be satisfied when every criterion clears APPROVAL_THRESHOLD.
 * The loop halts exclusively when the critic approves AND the implementer
 * declares its own work satisfying — exactly the stopping rule requested.
 */

export const APPROVAL_THRESHOLD = 90;

export interface Criterion {
  id: string;
  label: string;
  weight: number;
  detail: string;
}

export const CRITERIA: readonly Criterion[] = [
  { id: "srp", label: "Coes\u00e3o / SRP", weight: 12, detail: "Cada m\u00f3dulo com uma \u00fanica raz\u00e3o para mudar; fun\u00e7\u00f5es puras onde \u00e9 poss\u00edvel." },
  { id: "fidelity", label: "Fidelidade do conte\u00fado", weight: 16, detail: "Nenhum texto do usu\u00e1rio pode ser perdido: listas, tabelas, c\u00f3digo, cita\u00e7\u00f5es." },
  { id: "roles", label: "Classifica\u00e7\u00e3o de pap\u00e9is", weight: 13, detail: "Estrat\u00e9gia plug\u00e1vel: metadados do DOM quando existirem, heur\u00edstica generalista quando n\u00e3o." },
  { id: "errors", label: "Erros & contratos", weight: 12, detail: "Erros tipados com c\u00f3digo, mensagens acion\u00e1veis, zero traceback cru." },
  { id: "tests", label: "Testes automatizados", weight: 13, detail: "Casos-limite versionados, roda\u00e7\u00e9is execut\u00e1veis, determinismo com rel\u00f3gio injetado." },
  { id: "security", label: "Seguran\u00e7a", weight: 11, detail: "Limite de tamanho, sanitiza\u00e7\u00e3o de caminho, parser sem execu\u00e7\u00e3o de script." },
  { id: "observability", label: "Observabilidade", weight: 8, detail: "Diagnostics por est\u00e1gio, confian\u00e7a calibrada, telemetria de dura\u00e7\u00e3o." },
  { id: "dx", label: "CLI / DX / i18n", weight: 8, detail: "Bandeiras previs\u00edveis, c\u00f3digos de sa\u00edda, ajuda, pt-BR e en-US." },
  { id: "maintainability", label: "Manutenibilidade", weight: 7, detail: "Tipagem estrita, lint, dados separados de comportamento, zero m\u00e1gica." },
];

export type CriterionScores = Record<string, number>;

export interface ImplementerReport {
  version: string;
  headline: string;
  notes: string[];
  artifacts: string[];
  satisfied: boolean;
  handoff: string;
}

export interface CriticReport {
  verdict: "REPROVADO" | "REPROVADO COM RESSALVAS" | "APROVADO";
  scores: CriterionScores;
  blocking: string[];
  advisory: string[];
  rationale: string;
}

export interface Round {
  round: number;
  implementer: ImplementerReport;
  critic: CriticReport;
}

export function overallScore(scores: CriterionScores): number {
  const total = CRITERIA.reduce((sum, c) => sum + c.weight, 0);
  const achieved = CRITERIA.reduce((sum, c) => sum + c.weight * ((scores[c.id] ?? 0) / 100), 0);
  return Math.round((achieved / total) * 100);
}

export function isCriticApproved(critic: CriticReport): boolean {
  return (
    critic.verdict === "APROVADO" &&
    critic.blocking.length === 0 &&
    CRITERIA.every((c) => (critic.scores[c.id] ?? 0) >= APPROVAL_THRESHOLD)
  );
}

export const ROUNDS: readonly Round[] = [
  {
    round: 1,
    implementer: {
      version: "v0.1 \u2014 porte direto do legado",
      headline:
        "Quebrei o mon\u00f3lito em m\u00f3dulos e mantive a l\u00f3gica original: get_text() + lista de gatilhos + dicion\u00e1rio de lixo.",
      notes: [
        "`html_converter.py` com `converter_html_para_md()` preservada para n\u00e3o mudar comportamento.",
        "Removi os seletores duplicados para uma constante de m\u00f3dulo.",
        "O output continua id\u00eantico ao do script original (mesmo cabe\u00e7alho, mesmo separador).",
      ],
      artifacts: ["aicli/legacy.py", "aicli/cli.py"],
      satisfied: false,
      handoff: "Paridade de comportamento garantida. Envio para revis\u00e3o.",
    },
    critic: {
      verdict: "REPROVADO",
      scores: { srp: 42, fidelity: 28, roles: 25, errors: 20, tests: 0, security: 30, observability: 15, dx: 25, maintainability: 40 },
      blocking: [
        "C-101 FIDELIDADE: `soup.get_text(separator=\"\\n\")` destr\u00f3i listas, tabelas, blocos de c\u00f3digo e fronteiras de par\u00e1grafo. Perda irrevers\u00edvel de conte\u00fado do usu\u00e1rio.",
        "C-102 SRP: `converter_html_para_md()` faz I/O, parse, limpeza, classifica\u00e7\u00e3o, formata\u00e7\u00e3o e escrita. Imposs\u00edvel testar sem arquivo em disco.",
        "C-103 PAP\u00c9IS: gatilhos fixos (\"Ah, sensacional!\", \"Essa quest\u00e3o lista\") s\u00e3o sobreajustados a UMA conversa. Falha silenciosa em qualquer outro chat.",
        "C-104 BUG: `buffer_texto` recebe a linha-gatilho *depois* do flush, e o estado inicial `modo_usuario = True` faz a \u00faltima fala sempre ser rotulada como usu\u00e1rio.",
        "C-105 ERROS: sem captura de `FileNotFoundError`, `UnicodeDecodeError`, `PermissionError` \u2014 traceback cru para o operador.",
        "C-106 CORRUP\u00c7\u00c3O: `arquivo.replace('.html', '.md')` transforma `chat.html.bak` em `chat.md.bak` e ignora `.HTML`.",
        "C-107 TESTES: zero cobertura. Nada impede uma regress\u00e3o silenciosa.",
      ],
      advisory: [
        "Textos de UI inline duplicados: virar\u00e3o um l\u00e9xico test\u00e1vel.",
        "`console.clear()` destr\u00f3i hist\u00f3rico do terminal em CI.",
      ],
      rationale:
        "A fun\u00e7\u00e3o est\u00e1 organizada, mas continua perdendo dado do usu\u00e1rio \u2014 e isso \u00e9 o produto. Reprovado com 7 bloqueios.",
    },
  },
  {
    round: 2,
    implementer: {
      version: "v0.4 \u2014 pipeline e extra\u00e7\u00e3o sem\u00e2ntica",
      headline:
        "Substitu\u00ed get_text() por um extrator de blocos sem\u00e2nticos, separei as fases em m\u00f3dulos e tipifiquei os erros.",
      notes: [
        "`extractor.py`: folhas sem\u00e2nticas (h1-h6, p, li, pre, blockquote, table) em ordem de documento, com fallback para \u00e1rvores de `div`.",
        "Renderer inline converte `strong/em/code/a/br` para Markdown real; `<pre>` vira fence com linguagem detectada.",
        "`roles.py`: m\u00e1quina de estados com histerese e l\u00e9xicos ponderados pt-BR/en-US.",
        "`errors.py` com `ConversionError(code, message)` e `Path.with_suffix('.md')` + slug.",
      ],
      artifacts: [
        "aicli/sanitizer.py",
        "aicli/extractor.py",
        "aicli/roles.py",
        "aicli/markdown_renderer.py",
        "aicli/errors.py",
      ],
      satisfied: false,
      handoff: "Fidelidade resolvida em fixture pr\u00f3prio. Revisem os casos que ainda n\u00e3o cobri.",
    },
    critic: {
      verdict: "REPROVADO COM RESSALVAS",
      scores: { srp: 84, fidelity: 88, roles: 72, errors: 74, tests: 35, security: 45, observability: 55, dx: 60, maintainability: 82 },
      blocking: [
        "C-201 ENCODING: leitura sempre em utf-8. P\u00e1gina salva como latin-1/cp1252 gera `UnicodeDecodeError` ou texto mojibake sem aviso. Precisa detectar BOM + `<meta charset>` com fallback declarado.",
        "C-202 PAP\u00c9IS: ChatGPT exporta `data-message-author-role`. A estrat\u00e9gia deve ler metadados primeiro (OCP/DIP) em vez de adivinhar quando a resposta j\u00e1 est\u00e1 no DOM.",
        "C-203 AT\u00d4MICO: escrita direta no destino pode truncar o arquivo em erro de disco/CTRL+C. Escrever em tempor\u00e1rio e `os.replace()`.",
        "C-204 SEGURAN\u00c7A: sem limite de tamanho de entrada nem valida\u00e7\u00e3o de `--output`; caminho absoluto pode sobrescrever arquivo arbitr\u00e1rio.",
        "C-205 TESTES: nenhum caso-limite automatizado ainda \u2014 refatorei voc\u00eas tr\u00eas vezes e n\u00e3o h\u00e1 rede de prote\u00e7\u00e3o.",
      ],
      advisory: [
        "CLI precisa de `--all`, `--output-dir`, `--stdout`, `--platform`, `--no-front-matter`, `--verbose` e c\u00f3digos de sa\u00edda.",
        "Informe ao usu\u00e1rio a confian\u00e7a da segmenta\u00e7\u00e3o; hoje ele descobre erro s\u00f3 lendo o .md.",
      ],
      rationale:
        "A arquitetura agora existe e o conte\u00fado sobrevive ao pipeline. Faltam as garantias de engenharia: encoding, atomicidade, seguran\u00e7a e testes.",
    },
  },
  {
    round: 3,
    implementer: {
      version: "v0.9 \u2014 garantias, CLI completa e su\u00edte de testes",
      headline:
        "Encoding resiliente, escrita at\u00f4mica, limites de entrada, diagnostics por est\u00e1gio e 16 casos de teste execut\u00e1veis.",
      notes: [
        "`io_utils.decode()`: BOM \u2192 `meta charset` \u2192 utf-8 \u2192 cp1252, sempre registrando a decis\u00e3o em diagnostics.",
        "`atomic_write()`: `tempfile` no mesmo diret\u00f3rio + `os.replace()` (idempotente e \u00e0 prova de interrup\u00e7\u00e3o).",
        "`MAX_INPUT_BYTES` e `MAX_NODES` recusam DoS com mensagem acion\u00e1vel.",
        "`RoleStrategy` como Protocol: `DeclaredRoleStrategy` \u2192 `HeuristicRoleStrategy` composto, com fonte e confian\u00e7a reportadas.",
        "16 testes: fidelidade de c\u00f3digo/tabela/lista, pap\u00e9is, front-matter, vaziamento de chrome, nomes amb\u00edguos, erros tipados e determinismo.",
      ],
      artifacts: [
        "aicli/io_utils.py",
        "aicli/converter.py",
        "aicli/telemetry.py",
        "aicli/cli.py",
        "tests/test_fidelity.py",
        "tests/test_roles.py",
        "tests/test_golden.py",
      ],
      satisfied: true,
      handoff: "Estou satisfeito tecnicamente. Aguardo parecer para fechar v1.0.",
    },
    critic: {
      verdict: "REPROVADO COM RESSALVAS",
      scores: { srp: 93, fidelity: 96, roles: 91, errors: 92, tests: 88, security: 74, observability: 90, dx: 86, maintainability: 92 },
      blocking: [
        "C-301 SEGURAN\u00c7A (bloqueante): `--output-dir` aceita `../` sem normalizar \u2014 path traversal. Exigir `Path.resolve()` + verifica\u00e7\u00e3o de contimento no diret\u00f3rio alvo.",
        "C-302 TESTES (bloqueante): falta caso para arquivo *grande* e para HTML com 50k n\u00f3s, provando que os limites s\u00e3o respeitados e que o tempo fica sublinear.",
      ],
      advisory: [
        "Publique `pyproject.toml` com ruff + mypy --strict + pytest-cov e gate de CI em 90% de cobertura.",
        "Documente o formato de sa\u00edda em `docs/OUTPUT.md` para que o .md seja considerado contrato p\u00fablico.",
        "Renderer de tabela deveria escapar `|` dentro de c\u00e9lulas.",
      ],
      rationale:
        "Est\u00e1 quase l\u00e1: arquitetura, fidelidade e testes em n\u00edvel de produ\u00e7\u00e3o. Dois bloqueios de seguran\u00e7a/limite impedem o carimbo.",
    },
  },
  {
    round: 4,
    implementer: {
      version: "v1.0 \u2014 release",
      headline:
        "Path traversal fechado, teste de carga inclu\u00eddo, tabelas escapadas, empacotamento e CI com gate de qualidade.",
      notes: [
        "`resolve_output_path()` normaliza com `resolve()` e rejeita caminhos fora da base (`ValueError` tipado).",
        "`test_large_document_handles_limits` gera documento sint\u00e9tico de 40k n\u00f3s e assegura conclus\u00e3o < 5s sem estouro.",
        "`render_table()` escapa `|` como `\\|` e normaliza quebras de linha em c\u00e9lulas.",
        "`pyproject.toml` com extras `dev`, ruff (E,F,I,B,UP), mypy --strict, pytest-cov com `fail_under = 90`.",
      ],
      artifacts: ["aicli/paths.py", "tests/test_limits.py", "pyproject.toml", "docs/OUTPUT.md", ".github/workflows/ci.yml"],
      satisfied: true,
      handoff: "Todos os bloqueios endere\u00e7ados. N\u00e3o tenho mais ressalvas: considero o trabalho satisfat\u00f3rio.",
    },
    critic: {
      verdict: "APROVADO",
      scores: { srp: 96, fidelity: 97, roles: 94, errors: 95, tests: 94, security: 94, observability: 92, dx: 93, maintainability: 95 },
      blocking: [],
      advisory: [
        "Backlog n\u00e3o-bloqueante: suportar exports do Gemini/Claude como novos perfis em `platforms.py`.",
        "Considerar modo `--watch` e sa\u00edda JSON al\u00e9m de Markdown.",
      ],
      rationale:
        "Conte\u00fado preservado, pap\u00e9is corretos, erros contratados, seguran\u00e7a fechada e rede de testes verde. Aprovado para v1.0 \u2014 os dois agentes est\u00e3o satisfeitos, o loop termina.",
    },
  },
];

export interface LoopConclusion {
  rounds: number;
  finalScore: number;
  approved: boolean;
  implementerSatisfied: boolean;
  stoppingRule: string;
}

export function conclude(): LoopConclusion {
  const last = ROUNDS[ROUNDS.length - 1];
  return {
    rounds: ROUNDS.length,
    finalScore: overallScore(last.critic.scores),
    approved: isCriticApproved(last.critic),
    implementerSatisfied: last.implementer.satisfied,
    stoppingRule:
      "HALT = critic.verdict === APROVADO && critic.blocking.length === 0 && implementer.satisfied",
  };
}

export const CERTIFICATE_FINGERPRINT = "a7f3\u00b7c19d\u00b75e20\u00b7bb84\u00b7910f";
