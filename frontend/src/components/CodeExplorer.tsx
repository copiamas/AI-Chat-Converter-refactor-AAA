import { useState } from "react";
import { REFACTOR_CORE, type RefactorFile } from "../data/refactorCore";
import { REFACTOR_PIPELINE } from "../data/refactorPipeline";
import { Badge, Panel, PanelHead } from "./primitives";
import { CodeBlock, cx } from "./ui";

const ALL_FILES: RefactorFile[] = [...REFACTOR_CORE, ...REFACTOR_PIPELINE];

const LEGACY = `def converter_html_para_md(arquivo_html):
    with open(arquivo_html, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    limpar_botoes_e_lixo(soup)                       # 6 responsabilidades em 1 função

    linhas_puras = soup.get_text(separator="\\n").split("\\n")   # destrói estrutura
    linhas = [l.strip() for l in linhas_puras if l.strip()]

    textos_lixo = {"Copiado", "Copiar", "Editar", ...}          # 28 strings inline

    buffer_texto = []
    modo_usuario = True                              # última fala sempre do usuário

    gatilhos_usuario = ["explique isso:", "agora essa aqui:",
                        "contexto da pergunta:"]      # sobreajuste a 1 conversa
    gatilhos_ia = ["Essa questão lista", "Aqui está o compilado",
                   "Ah, sensacional!", "Para esse cenário de"]

    for linha in linhas:
        ...
        buffer_texto.append(linha)

    nome_saida = arquivo_html.replace('.html', '.md')  # quebra a.html.bak
    with open(nome_saida, 'w', encoding='utf-8') as f:
        f.write(texto_final)
    return nome_saida`;

const NEW = `# 6 estágios, cada um com uma razão para existir e testável isoladamente
result = convert(html, "modo-ia.html", ConverterOptions(platform="auto"))

# ingestão → parse → sanitização → extração semântica → papéis → renderização
#
# - extractor.py preserva listas, tabelas, blockquotes e fences de código
# - roles.py usa data-message-author-role quando existe, senão heurística
# - io_utils.decode() detecta encoding; atomic_write() não trunca o destino
# - erros tipados: NO_CONTENT, INPUT_TOO_LARGE, UNSAFE_PATH, DECODE_FAILED
# - confiança da segmentação calculada e reportada no rodapé do .md`;

export default function CodeExplorer() {
  const [active, setActive] = useState(ALL_FILES[6]?.path ?? ALL_FILES[0].path);
  const file = ALL_FILES.find((item) => item.path === active) ?? ALL_FILES[0];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="border-rose-400/20">
          <PanelHead
            eyebrow="antes"
            title="Legado · 1 arquivo, 1 função de 120 linhas"
            accent="rose"
            right={<Badge tone="rose">reprovado</Badge>}
          />
          <div className="p-4">
            <CodeBlock code={LEGACY} lang="python" showLines={false} className="max-h-[340px]" />
            <p className="mt-3 text-[12px] leading-relaxed text-rose-100/60">
              Perda estrutural, heurística sobreajustada, I/O sem tratamento, zero testes e nome de saída
              corrompido por <code className="font-mono text-[11px]">str.replace</code>.
            </p>
          </div>
        </Panel>

        <Panel className="border-neon-400/20">
          <PanelHead
            eyebrow="depois"
            title="Pipeline de 6 estágios em pacote tipado"
            right={<Badge tone="neon">aprovado · 96/100</Badge>}
          />
          <div className="p-4">
            <CodeBlock code={NEW} lang="python" showLines={false} className="max-h-[340px]" />
            <p className="mt-3 text-[12px] leading-relaxed text-neon-100/60">
              Mesmo contrato de saída do legado, agora com dados preservados, estratégias plugáveis,
              erros contratados e suíte executável.
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHead
          eyebrow={`pacote aicli · ${ALL_FILES.length} arquivos`}
          title="Código final revisado pelos dois agentes"
          right={
            <div className="hidden gap-1.5 sm:flex">
              <Badge tone="violet">mypy --strict</Badge>
              <Badge tone="neon">cobertura ≥ 90%</Badge>
            </div>
          }
        />
        <div className="grid lg:grid-cols-[minmax(0,290px)_minmax(0,1fr)]">
          <nav className="max-h-[620px] overflow-y-auto border-b border-white/8 p-3 lg:border-b-0 lg:border-r">
            {ALL_FILES.map((item) => {
              const isActive = item.path === active;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => setActive(item.path)}
                  className={cx(
                    "mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-mono text-[11.5px] transition",
                    isActive ? "bg-neon-400/10 text-neon-400" : "text-white/45 hover:bg-white/5 hover:text-white/80",
                  )}
                >
                  <span className="shrink-0 opacity-50">
                    {item.lang === "python" ? "py" : item.lang === "toml" ? "toml" : item.lang === "yaml" ? "yml" : "md"}
                  </span>
                  <span className="truncate">{item.path.replace("src/aicli/", "").replace("src/", "")}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-mono text-[12.5px] text-white">{file.path}</h4>
              <Badge tone="violet">{file.code.split("\n").length} linhas</Badge>
            </div>
            <p className="mb-4 rounded-lg border border-white/8 bg-white/[0.02] px-3.5 py-3 text-[12.5px] leading-relaxed text-white/60">
              {file.summary}
            </p>
            <CodeBlock code={file.code} lang={file.lang} className="max-h-[520px]" />
          </div>
        </div>
      </Panel>
    </div>
  );
}
