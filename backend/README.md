# 🤖 AI Chat Converter CLI

CLI em **nível AAA** para transformar páginas HTML salvas de conversas com IA
(Google Modo IA / ChatGPT) em arquivos **Markdown limpos**, prontos para
documentação, anotações ou publicação.

Reescrita profissional do conversor original, com:

- **Arquitetura em camadas** — modelos de domínio, parser, limpeza, extração,
  montagem do Markdown, orquestração e interface separados em módulos.
- **Tipagem estática completa** (`mypy` estrito) e lint rigoroso (`ruff`).
- **100% de cobertura na lógica central** (meta de 95%+ com `pytest-cov`).
- **Duas estratégias de detecção de diálogo**: atributos das plataformas e
  fallback por marcadores textuais.
- **Preservação de formatação**: negrito, itálico, código, listas, links e blocos
  de código viram Markdown válido.
- **CLI mais segura e completa**: modo interativo, modo automático, seleção por
  ID, proteção contra sobrescrita e opção de embutir o HTML limpo.

---

## ✨ Funcionalidades

| Recurso | Descrição |
| --- | --- |
| Modo interativo | Lista os `.html` do diretório e pergunta qual processar |
| Modo automático (`--auto`) | Converte todos os arquivos de uma vez |
| Seleção por ID (`--indice`) | Converte um arquivo específico sem interação |
| Proteção contra sobrescrita | Recusa reescrever `.md` existentes sem `--force` |
| Front matter YAML | Título, data, hora e plataforma no topo do arquivo |
| Detecção por atributos | `data-message-author-role`, classes `user/assistant`, etc. |
| **Modo IA do Google (busca)** | Conversas embutidas em `div.sUKAcb`/`div.mZJni`/`div.CKgc1d`, com subtítulos, listas e timestamps |
| Limpeza de payloads | Remove blocos `TgQPHd|||[...]` e `qkimaf ...` que o Google injeta no HTML |
| Fallback textual | Marcadores como `explique isso:` e `Ah, sensacional!` |
| Markdown rico | `**negrito**`, `*itálico*`, `` `código` ``, listas, links, blocos ``` |
| HTML embutido (`--html-original`) | Anexa o HTML limpo ao final do `.md` |
| Segurança | Nunca apaga o HTML original; erro claro se o destino existir |

## 📦 Instalação

```bash
# dependências de desenvolvimento (lint, tipos, testes)
pip install -e ".[dev]"
```

## 🚀 Uso

```bash
# modo interativo (padrão): lista os arquivos e pergunta qual processar
ai-converter

# processa tudo no diretório atual
ai-converter --auto

# converte apenas o 2º arquivo listado, sobrescrevendo se necessário
ai-converter --indice 2 --force

# processa um diretório específico
ai-converter ~/Downloads/conversas

# sem cabeçalho YAML e com o HTML limpo embutido no final
ai-converter --indice 1 --sem-cabecalho --html-original
```

Sem instalação, use `python -m ai_converter_cli.cli`.

### Exemplos incluídos

```bash
cd exemplos
ai-converter --auto --force
```

Gera:
- `conversa_google_ia.md` (fallback textual) e `conversa_chatgpt.md` (atributos);
- `conversa_modo_ia_real.html` → `.md` (arquivo real de busca do Google com o
  Modo IA embutido: 5 perguntas e 5 respostas, com subtítulos e timestamps).

## 🔍 Como a detecção funciona

1. **Limpeza estrutural** — scripts, estilos, botões, menus, formulários e
   elementos de feedback são removidos; o texto do chat é preservado.
2. **Detecção por atributos** — blocos com `data-message-author-role`
   (`user`/`assistant`), classes `user-message`/`assistant-message` etc. são
   classificados diretamente.
3. **Fallback textual** — sem marcação, o texto é varrido em busca dos
   marcadores: usuário (`explique isso:`, `agora essa aqui:`,
   `contexto da pergunta:`) e IA (`Ah, sensacional!`, `Essa questão lista`,
   `Aqui está o compilado`, `Para esse cenário de`).
4. **Serialização rica** — negrito, itálico, código, listas, links e `pre`
   viram sintaxe Markdown; linhas em branco e espaços repetidos são colapsados
   sem tocar no conteúdo de blocos de código.

Linhas não classificadas são anexadas ao turno em andamento, preservando a
alternância original usuário → IA.

## 🧱 Estrutura do projeto

```
ai_converter_cli/
├── __init__.py          # versão do pacote
├── models.py            # Turno, Conversa, OpcoesConversao, ResultadoConversao
├── cleaner.py           # limpeza estrutural e sanitização de atributos
├── html_parser.py       # leitura, extração de turnos e serialização rica
├── markdown_builder.py  # montagem do documento Markdown (front matter etc.)
├── converter.py         # orquestração da conversão arquivo → arquivo
├── cli.py               # interface de linha de comando (rich)
└── textutils.py         # normalização de texto compartilhada
tests/                   # suíte completa (pytest)
exemplos/                # páginas HTML de exemplo para testar na hora
```

## ✅ Portões de qualidade (Agente Crítico)

```bash
ruff check .                     # lint — erros e avisos
ruff format --check .            # formatação consistente
mypy ai_converter_cli            # tipagem estática estrita
pytest --cov=ai_converter_cli --cov-report=term-missing   # testes + cobertura (≥95%)
```

## 📄 Licença

MIT
