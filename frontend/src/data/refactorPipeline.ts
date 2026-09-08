import type { RefactorFile } from "./refactorCore";

export const REFACTOR_PIPELINE: RefactorFile[] = [
  {
    path: "src/aicli/roles.py",
    lang: "python",
    summary:
      "Estrat\u00e9gias plug\u00e1veis (Protocol) em vez de uma lista fixa de gatilhos: metadados do DOM vencem; heur\u00edstica com histerese cobre o resto.",
    code: `"""Author attribution via pluggable strategies.

Legacy code matched three literal phrases copied from a single conversation and
mis-segmented every other chat. Here: DOM metadata first, lexical state machine
with hysteresis second, both composable.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol, Sequence

from .extractor import Block

USER_MARKERS: tuple[tuple[re.Pattern[str], float, str], ...] = (
    (re.compile(r"^explique\\s+", re.I), 2.4, "imperativo:explique"),
    (re.compile(r"^(agora|e)\\s+(essa|este)", re.I), 2.0, "transicao"),
    (re.compile(r"^contexto\\s+da\\s+pergunta", re.I), 2.6, "marcador"),
    (re.compile(r"^(me\\s+)?(explica|explique|cria|crie|faz|fa\\u00e7a|monta|monte|gera|gere|liste|resume|traduza|escreva)\\b", re.I), 2.2, "imperativo"),
    (re.compile(r"^(como|qual|quais|quando|onde|quem|por que|porque|quanto)\\b", re.I), 1.8, "interrogativa"),
    (re.compile(r"^(posso|pode|poderia|consegue|gostaria|queria|preciso|quero|tenho|estou)\\b", re.I), 1.6, "primeira-pessoa"),
    (re.compile(r"^(explain|how (do|can|to)|can you|write|create|give me|i need|please)\\b", re.I), 2.2, "imperativo:en"),
    (re.compile(r"\\?(\\s|$)"), 1.6, "interrogacao"),
    (re.compile(r"\\b(obrigado|valeu|entendi|top)\\b", re.I), 1.4, "agradecimento"),
)

ASSISTANT_MARKERS: tuple[tuple[re.Pattern[str], float, str], ...] = (
    (re.compile(r"^(aqui (est\\u00e1|vai) |segue |segue abaixo|compilado)", re.I), 2.4, "entrega"),
    (re.compile(r"^(claro|com certeza|perfeito|\\u00f3timo|excelente|sensacional|ah,|entendido)", re.I), 2.0, "acolhimento"),
    (re.compile(r"^(para esse|neste caso|nesse cen\\u00e1rio|vamos|resumo|em resumo|passo a passo)", re.I), 1.8, "estrutura"),
    (re.compile(r"^(sure|certainly|here('s| is)|great question|absolutely|of course)", re.I), 2.2, "acolhimento:en"),
    (re.compile(r"^\\s*(#{1,6}\\s|[-*]\\s|\\d+\\.\\s|>\\s|\`\`\`)", re.M), 1.6, "markdown"),
    (re.compile(r"\\*\\*[^*]+\\*\\*"), 0.8, "negrito"),
)

FLIP_THRESHOLD = 2.2


@dataclass(frozen=True, slots=True)
class RoleAssignment:
    role: str
    confidence: float
    signals: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Turn:
    index: int
    role: str
    lines: tuple[str, ...]
    confidence: float
    signals: tuple[str, ...] = field(default_factory=tuple)


def score_block(block: Block) -> tuple[float, float, tuple[str, ...]]:
    user = 0.0
    assistant = 0.0
    signals: list[str] = []

    for pattern, weight, label in USER_MARKERS:
        if pattern.search(block.text):
            user += weight
            signals.append(f"+U:{label}")
    for pattern, weight, label in ASSISTANT_MARKERS:
        if pattern.search(block.text):
            assistant += weight
            signals.append(f"+A:{label}")

    length = len(block.text)
    if length > 420:
        assistant += 1.2
        signals.append("+A:longo")
    elif length < 180:
        user += 0.5
        signals.append("+U:curto")
    if block.kind == "code":
        assistant += 1.0
    elif block.kind == "list-item":
        assistant += 0.7
    elif block.kind == "heading" and (block.level or 6) <= 3:
        assistant += 0.6

    return user, assistant, tuple(signals)


class RoleStrategy(Protocol):
    """Structural interface: new platforms plug in without touching the pipeline."""

    id: str

    def assign(self, blocks: Sequence[Block]) -> list[RoleAssignment]: ...


class DeclaredRoleStrategy:
    """Trust the platform's own authorship metadata (confidence = 1)."""

    id = "attributes"

    def __init__(self, attribute: str) -> None:
        self.attribute = attribute

    def assign(self, blocks: Sequence[Block]) -> list[RoleAssignment]:
        return [
            RoleAssignment(block.declared_role or "assistant", 1.0, ("meta:atributo",))
            if block.declared_role
            else RoleAssignment("assistant", 0.4, ("meta:ausente",))
            for block in blocks
        ]


class HeuristicRoleStrategy:
    """Lexical state machine. Blocks without strong evidence keep the speaker."""

    id = "heuristic"

    def __init__(self, initial_role: str = "user") -> None:
        self.initial_role = initial_role

    def assign(self, blocks: Sequence[Block]) -> list[RoleAssignment]:
        current = self.initial_role
        assignments: list[RoleAssignment] = []
        for block in blocks:
            user, assistant, signals = score_block(block)
            margin = user - assistant
            if margin >= FLIP_THRESHOLD and user >= 3.0:
                current = "user"
            elif -margin >= FLIP_THRESHOLD and assistant >= 3.0:
                current = "assistant"
            confidence = min(0.95, 0.55 + abs(margin) / 12)
            assignments.append(RoleAssignment(current, confidence, signals[:4]))
        return assignments


class CompositeRoleStrategy:
    """Metadata when fully available, heuristics otherwise, mixed when partial."""

    id = "mixed"

    def __init__(self, declared: DeclaredRoleStrategy, heuristic: HeuristicRoleStrategy) -> None:
        self.declared = declared
        self.heuristic = heuristic

    def assign(self, blocks: Sequence[Block]) -> list[RoleAssignment]:
        if blocks and all(block.declared_role for block in blocks):
            self.id = "attributes"
            return self.declared.assign(blocks)
        if blocks and not any(block.declared_role for block in blocks):
            self.id = "heuristic"
            return self.heuristic.assign(blocks)
        self.id = "mixed"
        return [
            self.declared.assign([block])[0] if block.declared_role else self.heuristic.assign([block])[0]
            for block in blocks
        ]


def group_turns(blocks: Sequence[Block], assignments: Sequence[RoleAssignment]) -> tuple[list[Turn], float]:
    turns: list[Turn] = []
    for block, assignment in zip(blocks, assignments, strict=True):
        if turns and turns[-1].role == assignment.role:
            previous = turns[-1]
            turns[-1] = Turn(
                previous.index,
                previous.role,
                (*previous.lines, block.text),
                (previous.confidence + assignment.confidence) / 2,
                tuple(dict.fromkeys((*previous.signals, *assignment.signals)))[:6],
            )
        else:
            turns.append(
                Turn(len(turns), assignment.role, (block.text,), assignment.confidence, assignment.signals)
            )

    average = sum(turn.confidence for turn in turns) / len(turns) if turns else 0.0
    single_speaker = len(turns) > 2 and len({turn.role for turn in turns}) == 1
    return turns, max(0.35, min(1.0, average * (0.7 if single_speaker else 1.0)))`,
  },
  {
    path: "src/aicli/markdown_renderer.py",
    lang: "python",
    summary:
      "Documento = fun\u00e7\u00e3o pura de (turnos, metadados, op\u00e7\u00f5es). YAML escapado, locale pt-BR/en-US, rodap\u00e9 com confian\u00e7a.",
    code: `"""Pure Markdown rendering. No I/O, no DOM, fully snapshot-testable."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .config import GENERATOR
from .roles import Turn

ROLE_LABELS = {
    "pt-BR": {"user": "\\U0001F464 Usu\\u00e1rio", "assistant": "\\U0001F916 IA", "system": "\\u2699\\uFE0F Sistema"},
    "en-US": {"user": "\\U0001F464 User", "assistant": "\\U0001F916 AI", "system": "\\u2699\\uFE0F System"},
}

SECTION_TITLE = {
    "pt-BR": "# \\U0001F4DD Hist\\u00f3rico de Conversa",
    "en-US": "# \\U0001F4DD Conversation Transcript",
}


@dataclass(frozen=True, slots=True)
class RenderStats:
    words: int
    chars: int
    turns: int
    confidence: float
    blocks: int
    dropped: int


def _yaml(value: str) -> str:
    return '"' + value.replace("\\\\", "\\\\\\\\").replace('"', '\\\\"').replace("\\n", " ") + '"'


def _stamp(now: datetime, locale: str) -> tuple[str, str, str]:
    if locale == "pt-BR":
        date = now.strftime("%d/%m/%Y")
    else:
        date = now.strftime("%Y-%m-%d")
    return date, now.strftime("%H:%M:%S"), now.isoformat()


def render_front_matter(title: str, date: str, time: str, iso: str, platform: str, source: str, turns: int) -> str:
    return "\\n".join([
        "---",
        f"title: {_yaml(title)}",
        f"date: {date}",
        f"time: {time}",
        f"exported_at: {iso}",
        f"platform: {_yaml(platform)}",
        f"source: {_yaml(source)}",
        f"turns: {turns}",
        f"generator: {_yaml(f'{GENERATOR} v1.0.0')}",
        "---",
        "",
    ])


def render_turn(turn: Turn, locale: str) -> str:
    label = ROLE_LABELS.get(locale, ROLE_LABELS["pt-BR"])[turn.role]
    body = "\\n\\n".join(turn.lines)
    return f"### {label}\\n\\n{body}"


def build_document(
    turns: list[Turn],
    *,
    title: str,
    platform: str,
    source: str,
    locale: str = "pt-BR",
    now: datetime | None = None,
    include_front_matter: bool = True,
    include_timestamp: bool = True,
    include_stats_footer: bool = True,
    stats: RenderStats | None = None,
) -> str:
    moment = now or datetime.now().astimezone()
    date, time, iso = _stamp(moment, locale)
    parts: list[str] = []

    if include_front_matter:
        parts.append(render_front_matter(title, date, time, iso, platform, source, len(turns)).rstrip())
    parts.append(SECTION_TITLE.get(locale, SECTION_TITLE["pt-BR"]))
    if include_timestamp:
        connector = "\\u00e0s" if locale == "pt-BR" else "at"
        parts.append(f"> **{('Data da Exporta\\u00e7\\u00e3o' if locale == 'pt-BR' else 'Exported on')}:** {date} {connector} {time}")

    parts.append("\\n\\n---\\n\\n".join(render_turn(turn, locale) for turn in turns))

    if include_stats_footer and stats is not None:
        parts.append(
            "---\\n"
            f"_{GENERATOR} v1.0.0 \\u00b7 {stats.turns} turno(s) \\u00b7 {stats.words} palavra(s) \\u00b7 "
            f"confian\\u00e7a da segmenta\\u00e7\\u00e3o: {round(stats.confidence * 100)}%_"
        )

    document = "\\n\\n".join(part for part in parts if part)
    document = reblank(document)
    return document.rstrip() + "\\n"


def reblank(text: str) -> str:
    """Collapse 4+ blank lines to a single blank line."""
    lines: list[str] = []
    blanks = 0
    for line in text.splitlines():
        if not line.strip():
            blanks += 1
            if blanks > 1:
                continue
        else:
            blanks = 0
        lines.append(line.rstrip())
    return "\\n".join(lines)`,
  },
  {
    path: "src/aicli/converter.py",
    lang: "python",
    summary:
      "Pipeline de 6 est\u00e1gios com telemetria e diagnostics. Nada de I/O: recebe str, devolve resultado \u2014 test\u00e1vel sem fixture em disco.",
    code: `"""Orchestration: ingest -> parse -> sanitize -> extract -> roles -> render."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Sequence

from bs4 import BeautifulSoup

from .config import MAX_INPUT_BYTES, MAX_NODES, PROFILES, ConverterOptions
from .errors import ConversionError, EmptyInputError, InputTooLargeError, NoContentError
from .extractor import Block, extract_blocks
from .markdown_renderer import RenderStats, build_document
from .paths import safe_output_name
from .roles import CompositeRoleStrategy, DeclaredRoleStrategy, HeuristicRoleStrategy, RoleStrategy, group_turns
from .sanitizer import sanitize


@dataclass(frozen=True, slots=True)
class Diagnostic:
    level: str          # info | warn | error
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class Stage:
    id: str
    label: str
    detail: str


@dataclass(frozen=True, slots=True)
class ConversionResult:
    markdown: str
    output_name: str
    platform: str
    turns: int
    user_turns: int
    assistant_turns: int
    words: int
    chars: int
    duration_ms: float
    confidence: float
    role_source: str
    stages: tuple[Stage, ...] = field(default_factory=tuple)
    diagnostics: tuple[Diagnostic, ...] = field(default_factory=tuple)


def detect_platform(soup: BeautifulSoup) -> str:
    if soup.find(attrs={"data-message-author-role": True}):
        return "chatgpt"
    if soup.select(".model-response-text") or soup.select(".query-content"):
        return "google-ai"
    return "generic"


def convert(
    html: str,
    source_name: str,
    options: ConverterOptions | None = None,
    *,
    strategy: RoleStrategy | None = None,
) -> ConversionResult:
    """Convert raw HTML into a Markdown transcript. Raises ConversionError."""
    options = options or ConverterOptions()
    started = perf_counter()
    diagnostics: list[Diagnostic] = []
    stages: list[Stage] = []

    if not html or not html.strip():
        raise EmptyInputError("O arquivo est\\u00e1 vazio ou ileg\\u00edvel.")
    if len(html.encode("utf-8")) > MAX_INPUT_BYTES:
        raise InputTooLargeError(
            f"Entrada com {len(html):,} caracteres excede o limite configurado.",
            hint="Exporte apenas a conversa necess\\u00e1ria ou aumente MAX_INPUT_BYTES deliberadamente.",
        )

    soup = BeautifulSoup(html, "html.parser")
    if len(list(soup.find_all(True))) > MAX_NODES:
        raise InputTooLargeError("Documento com n\\u00famero excessivo de n\\u00f3s.", hint="Poss\\u00edvel HTML ofuscado.")

    profile_id = options.platform if options.platform != "auto" else detect_platform(soup)
    profile = PROFILES.get(profile_id, PROFILES["generic"])
    stages.append(Stage("detect", "Detec\\u00e7\\u00e3o de plataforma", profile.label))

    report = sanitize(
        soup,
        aggressive=options.aggressive_noise_filter,
        extra=(*options.extra_remove_selectors, *profile.remove_selectors),
    )
    diagnostics.append(Diagnostic("info", "SANITIZE_OK", f"{report.removed} n\\u00f3(s) de chrome removidos."))
    stages.append(Stage("sanitize", "Sanitiza\\u00e7\\u00e3o", f"{report.removed} n\\u00f3(s)"))

    body = soup.body or soup
    blocks: Sequence[Block] = extract_blocks(body, aggressive=options.aggressive_noise_filter)
    if not blocks:
        raise NoContentError(
            "Nenhum conte\\u00fado de conversa encontrado.",
            hint="O arquivo pode ser uma p\\u00e1gina de login ou um PDF salvo como HTML.",
        )
    diagnostics.append(Diagnostic("info", "EXTRACT_OK", f"{len(blocks)} bloco(s) sem\\u00e2ntico(s)."))
    stages.append(Stage("extract", "Extra\\u00e7\\u00e3o sem\\u00e2ntica", f"{len(blocks)} bloco(s)"))

    resolver: RoleStrategy = strategy or CompositeRoleStrategy(
        DeclaredRoleStrategy(profile.role_attribute or "data-message-author-role"),
        HeuristicRoleStrategy(),
    )
    assignments = resolver.assign(blocks)
    turns, confidence = group_turns(blocks, assignments)
    diagnostics.append(Diagnostic("info", "ROLES", f"Estrat\\u00e9gia {resolver.id}: {len(turns)} turno(s)."))
    if len(turns) > 2 and len({turn.role for turn in turns}) == 1:
        diagnostics.append(Diagnostic(
            "warn", "SINGLE_SPEAKER", "Apenas um interlocutor identificado; revise a segmenta\\u00e7\\u00e3o."
        ))
    stages.append(Stage("roles", "Pap\\u00e9is", f"{len(turns)} turno(s) \\u00b7 {resolver.id}"))

    body_text = "\\n".join(line for turn in turns for line in turn.lines)
    words = len(body_text.split())
    now = options.now or datetime.now().astimezone()
    markdown = build_document(
        turns,
        title=infer_title(soup, source_name),
        platform=profile.label,
        source=source_name,
        locale=options.locale,
        now=now,
        include_front_matter=options.include_front_matter,
        include_timestamp=options.include_timestamp,
        include_stats_footer=options.include_stats_footer,
        stats=RenderStats(words=words, chars=len(body_text), turns=len(turns), confidence=confidence, blocks=len(blocks), dropped=report.removed),
    )
    stages.append(Stage("render", "Renderiza\\u00e7\\u00e3o Markdown", f"{len(markdown):,} caracteres"))

    user_turns = sum(1 for turn in turns if turn.role == "user")
    return ConversionResult(
        markdown=markdown,
        output_name=safe_output_name(source_name),
        platform=profile.id,
        turns=len(turns),
        user_turns=user_turns,
        assistant_turns=len(turns) - user_turns,
        words=words,
        chars=len(body_text),
        duration_ms=(perf_counter() - started) * 1000,
        confidence=confidence,
        role_source=resolver.id,
        stages=tuple(stages),
        diagnostics=tuple(diagnostics),
    )


def infer_title(soup: BeautifulSoup, source_name: str) -> str:
    og = soup.find("meta", attrs={"property": "og:title"})
    candidates = [
        og.get("content") if og else None,
        soup.h1.get_text(strip=True) if soup.h1 else None,
        soup.title.get_text(strip=True) if soup.title else None,
    ]
    found = next((str(c).strip() for c in candidates if c and str(c).strip()), "")
    if len(found) > 3:
        return found[:120]
    return Path(source_name).stem or "Conversa Exportada"


__all__ = ["convert", "detect_platform", "ConversionResult", "Diagnostic", "Stage", "ConversionError"]`,
  },
  {
    path: "src/aicli/cli.py",
    lang: "python",
    summary:
      "CLI previs\u00edvel: bandeiras expl\u00edcitas, c\u00f3digos de sa\u00edda, processamento em lote, --stdout para pipes, logging com n\u00edveis e degrada\u00e7\u00e3o sem TTY.",
    code: `"""Operator-facing surface. Thin on purpose: all logic lives in the package."""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from rich.console import Console

from .config import ConverterOptions
from .converter import ConversionError, convert
from .errors import EXIT_OK, EXIT_NO_INPUT, EXIT_USAGE
from .io_utils import atomic_write, decode
from .paths import resolve_output_path

console = Console()
log = logging.getLogger("aicli")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="aicli",
        description="Converte p\\u00e1ginas HTML salvas de chats de IA em Markdown limpo.",
    )
    parser.add_argument("inputs", nargs="*", help="Arquivos .html (padr\\u00e3o: todos do diret\\u00f3rio atual).")
    parser.add_argument("--all", action="store_true", help="Processa todos os .html encontrados.")
    parser.add_argument("--output-dir", type=Path, default=Path("."), help="Diret\\u00f3rio de destino (padr\\u00e3o: atual).")
    parser.add_argument("--stdout", action="store_true", help="Imprime o Markdown em vez de gravar arquivos.")
    parser.add_argument("--platform", choices=["auto", "chatgpt", "google-ai", "generic"], default="auto")
    parser.add_argument("--locale", choices=["pt-BR", "en-US"], default="pt-BR")
    parser.add_argument("--no-front-matter", action="store_true")
    parser.add_argument("--no-timestamp", action="store_true")
    parser.add_argument("--no-noise-filter", action="store_true", help="Mant\\u00e9m r\\u00f3tulos de UI amb\\u00edguos.")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--quiet", "-q", action="store_true")
    parser.add_argument("--version", action="version", version="aicli 1.0.0")
    return parser


def discover(directory: Path = Path(".")) -> list[Path]:
    return sorted(p for p in directory.glob("*.html") if p.is_file())


def convert_file(path: Path, options: ConverterOptions) -> str:
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise ConversionError(f"Arquivo n\\u00e3o encontrado: {path}") from exc
    except OSError as exc:
        raise ConversionError(f"Falha de leitura em {path}: {exc}") from exc

    decoded = decode(data)
    for warning in decoded.warnings:
        log.warning("%s: %s", path.name, warning)
    return convert(decoded.text, path.name, options).markdown


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else (logging.ERROR if args.quiet else logging.INFO),
        format="%(levelname)s %(name)s: %(message)s",
    )

    targets = [Path(item) for item in args.inputs] or discover()
    if args.all and not args.inputs:
        targets = discover()
    if not targets:
        console.print("[bold red]\\u274c Nenhum arquivo .html encontrado.[/bold red]")
        console.print("   [dim]Dica: salve a conversa com Ctrl+S (p\\u00e1gina completa) e rode novamente.[/dim]")
        return EXIT_NO_INPUT

    options = ConverterOptions(
        platform=args.platform,
        locale=args.locale,
        include_front_matter=not args.no_front_matter,
        include_timestamp=not args.no_timestamp,
        aggressive_noise_filter=not args.no_noise_filter,
    )

    failures = 0
    with console.status("Processando...") if not args.quiet else _nullcontext():
        for target in targets:
            if not target.exists():
                console.print(f"[bold red]\\u2717 n\\u00e3o encontrado:[/bold red] {target}")
                failures += 1
                continue
            try:
                markdown = convert_file(target, options)
            except ConversionError as exc:
                console.print(f"[bold red]\\u2717 {target.name}: {exc.code}[/bold red] \\u2014 {exc}")
                if exc.hint:
                    console.print(f"   [dim]\\u2192 {exc.hint}[/dim]")
                failures += 1
                continue
            if args.stdout:
                console.print(markdown, markup=False, highlight=False)
                continue
            destination = resolve_output_path(target.name, args.output_dir)
            atomic_write(destination, markdown)
            console.print(f"[bold green]\\u2714[/bold green] {target.name} \\u2192 [bold]{destination.resolve()}[/bold]")

    if failures:
        console.print(f"[bold yellow]{failures} arquivo(s) falharam.[/bold yellow]")
        return EXIT_USAGE
    return EXIT_OK


class _NullContext:
    def __enter__(self) -> "_NullContext":
        return self

    def __exit__(self, *exc: object) -> None:
        return None


def _nullcontext() -> _NullContext:
    return _NullContext()


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())`,
  },
  {
    path: "tests/test_fidelity.py",
    lang: "python",
    summary:
      "A rede de prote\u00e7\u00e3o que o legado n\u00e3o tinha: fidelidade de c\u00f3digo/tabela/lista, aus\u00eancia de vaziamento de UI e determinismo com rel\u00f3gio injetado.",
    code: `"""Fidelity contract: nothing the user wrote may be lost or invented."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from aicli.config import ConverterOptions
from aicli.converter import convert
from aicli.errors import EmptyInputError, NoContentError
from aicli.paths import safe_output_name

FIXTURES = Path(__file__).parent / "fixtures"
CLOCK = datetime(2026, 1, 5, 9, 30, 0)


@pytest.fixture(scope="module")
def google_html() -> str:
    return (FIXTURES / "google-ai-mode.html").read_text(encoding="utf-8")


def test_removes_script_and_style_but_keeps_content(google_html: str) -> None:
    result = convert(google_html, "x.html", ConverterOptions(now=CLOCK))
    assert "window.__BOOTSTRAP" not in result.markdown
    assert "garbage collector" in result.markdown


def test_code_block_keeps_fence_language_and_body(google_html: str) -> None:
    result = convert(google_html, "x.html")
    assert "\\\`\\\`\\\`python" in result.markdown
    assert "gc.collect()" in result.markdown


def test_ordered_list_numbering_is_preserved() -> None:
    html = '<article data-message-author-role="assistant"><ol><li>um</li><li>dois</li></ol></article>'
    result = convert(html, "lista.html")
    assert "1. um" in result.markdown
    assert "2. dois" in result.markdown


def test_table_becomes_markdown_table() -> None:
    html = "<table><tr><th>a</th></tr><tr><td>b</td></tr></table>"
    result = convert(html, "tabela.html")
    assert "| a |" in result.markdown
    assert "| --- |" in result.markdown


def test_ui_chrome_never_leaks(google_html: str) -> None:
    result = convert(google_html, "x.html")
    for leaked in ("Compartilhar link p\\u00fablico", "Boa resposta", "Copiar", "O Google pode usar os dados"):
        assert leaked not in result.markdown


def test_front_matter_and_footer(google_html: str) -> None:
    result = convert(google_html, "x.html", ConverterOptions(now=CLOCK))
    assert result.markdown.startswith("---\\n")
    assert "date: 05/01/2026" in result.markdown
    assert "time: 09:30:00" in result.markdown
    assert "confian\\u00e7a da segmenta\\u00e7\\u00e3o" in result.markdown


def test_deterministic_with_injected_clock(google_html: str) -> None:
    options = ConverterOptions(now=CLOCK)
    assert convert(google_html, "x.html", options).markdown == convert(google_html, "x.html", options).markdown


def test_empty_input_raises_typed_error() -> None:
    with pytest.raises(EmptyInputError):
        convert("   ", "vazio.html")


def test_page_without_conversation_raises_no_content() -> None:
    with pytest.raises(NoContentError):
        convert("<html><body><form><input name=\\"email\\"></form></body></html>", "login.html")


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("export quebrado.HTML", "export-quebrado.md"),
        ("a.html.bak", "a.html.bak.md"),
        ("relat\\u00f3rio final.html", "relatorio-final.md"),
        ("", "conversa.md"),
    ],
)
def test_safe_output_name(source: str, expected: str) -> None:
    assert safe_output_name(source) == expected`,
  },
  {
    path: "tests/test_limits.py",
    lang: "python",
    summary:
      "Cobertura do bloqueio C-302: limite de tamanho recusa DoS com erro tipado e documento grande converte em tempo aceit\u00e1vel.",
    code: `"""Resource-safety guarantees (critic blocking issue C-301/C-302)."""
from __future__ import annotations

import time

import pytest

from aicli.config import ConverterOptions
from aicli.converter import convert
from aicli.errors import InputTooLargeError
from aicli.converter import MAX_INPUT_BYTES_SAFE


def test_oversized_input_is_refused_with_typed_error() -> None:
    huge = "<p>x</p>" * 3_000_000
    with pytest.raises(InputTooLargeError) as excinfo:
        convert(huge, "grande.html")
    assert excinfo.value.code == "INPUT_TOO_LARGE"


def test_large_but_valid_document_completes_quickly() -> None:
    html = "".join(
        f'<article data-message-author-role="user"><p>pergunta {i} sobre pipeline?</p></article>'
        f'<article data-message-author-role="assistant"><p>resposta {i} com detalhes.</p></article>'
        for i in range(2_000)
    )
    started = time.perf_counter()
    result = convert(html, "grande.html", ConverterOptions(platform="chatgpt"))
    elapsed = time.perf_counter() - started
    assert result.turns >= 3_000
    assert elapsed < 5.0


def test_max_limit_constant_is_documented() -> None:
    assert MAX_INPUT_BYTES_SAFE == 20 * 1024 * 1024`,
  },
  {
    path: "docs/OUTPUT.md",
    lang: "markdown",
    summary:
      "O Markdown deixou de ser efeito colateral e virou contrato p\u00fablico versionado \u2014 qualquer mudan\u00e7a de formato exige atualizar este arquivo e o golden test.",
    code: `# Formato de sa\u00edda (contrato p\u00fablico)

Toda sa\u00edda \\u00e9 UTF-8, termina com uma \\u00fanica quebra de linha e segue esta ordem:

\`\`\`markdown
---
title: "T\u00edtulo da p\u00e1gina ou do arquivo"
date: 05/01/2026          # pt-BR; en-US usa 2026-01-05
time: 09:30:00
exported_at: 2026-01-05T09:30:00-03:00
platform: "Google AI Mode / Search"
source: "modo-ia.html"
turns: 4
generator: "ai-chat-converter v1.0.0"
---

# \U0001F4DD Hist\u00f3rico de Conversa

> **Data da Exporta\u00e7\u00e3o:** 05/01/2026 \u00e0s 09:30:00

### \U0001F464 Usu\u00e1rio

explique isso: ...

---

### \U0001F916 IA

Aqui est\u00e1...

---
_ai-chat-converter v1.0.0 \u00b7 4 turno(s) \u00b7 812 palavra(s) \u00b7 confian\u00e7a da segmenta\u00e7\u00e3o: 92%_
\`\`\`

## Regras

1. **Nada de chrome de UI.** R\u00f3tulos como "Copiar" ou "Boa resposta" nunca aparecem.
2. **Estrutura preservada.** Listas, tabelas, cita\u00e7\u00f5es e fences de c\u00f3digo sobrevivem ao pipeline.
3. **Front-matter v\u00e1lido em YAML.** Sempre com aspas escapadas; \`date\` segue o locale escolhido.
4. **Confian\u00e7a expl\u00edcita.** Quando a segmenta\u00e7\u00e3o for duvidosa, o rodap\u00e9 mostra menos de 80%.
5. **Erros n\u00e3o geram arquivo.** Falha de decoding, entrada vazia ou sem conte\u00fado interrompe com exit code > 0.

## C\u00f3digos de sa\u00edda

| C\u00f3digo | Significado |
| --- | --- |
| 0 | Sucesso |
| 2 | Argumento inv\u00e1lido / falha parcial em lote |
| 3 | Nenhum arquivo de entrada encontrado |
| 4 | Falha de decodifica\u00e7\u00e3o |
| 5 | Entrada vazia ou sem conte\u00fado de conversa |
| 6 | Recusa de seguran\u00e7a (tamanho, caminho) |
| 7 | Erro de I/O inesperado |`,
  },
];
