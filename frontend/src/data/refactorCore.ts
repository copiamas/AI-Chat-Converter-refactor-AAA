export interface RefactorFile {
  path: string;
  lang: "python" | "toml" | "markdown" | "yaml";
  summary: string;
  code: string;
}

export const REFACTOR_CORE: RefactorFile[] = [
  {
    path: "pyproject.toml",
    lang: "toml",
    summary:
      "Empacotamento + gates de qualidade. `fail_under = 90` impede merge sem cobertura; ruff e mypy --strict rodam no CI.",
    code: `[build-system]
requires = ["hatchling>=1.25"]
build-backend = "hatchling.build"

[project]
name = "ai-chat-converter"
version = "1.0.0"
description = "Converte p\u00e1ginas HTML salvas de chats de IA em Markdown limpo e estruturado."
readme = "README.md"
requires-python = ">=3.11"
license = { text = "MIT" }
dependencies = [
  "beautifulsoup4>=4.12",
  "charset-normalizer>=3.3",
  "rich>=13.7",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "pytest-cov>=5.0",
  "ruff>=0.6",
  "mypy>=1.10",
  "types-beautifulsoup4",
]

[project.scripts]
aicli = "aicli.cli:main"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM", "C4", "RUF"]
ignore = ["E501"]

[tool.mypy]
strict = true
warn_unreachable = true
disallow_untyped_defs = true

[tool.pytest.ini_options]
addopts = "-q --cov=aicli --cov-report=term-missing"
testpaths = ["tests"]

[tool.coverage.report]
fail_under = 90
show_missing = true`,
  },
  {
    path: "src/aicli/config.py",
    lang: "python",
    summary:
      "Dados imutveis em vez de m\u00e1gica espalhada: seletores, l\u00e9xico de chrome, perfis de plataforma e limites. Frozen dataclasses = zero muta\u00e7\u00e3o acidental.",
    code: `"""Static configuration: selectors, chrome lexicon, platform profiles, limits.

Everything the legacy implementation kept as inline literals now lives here as
immutable data, so behaviour changes never require touching pipeline code.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_NODES = 400_000
OUTPUT_SUFFIX = ".md"
GENERATOR = "ai-chat-converter"

STRUCTURAL_NOISE: tuple[str, ...] = (
    "script", "style", "noscript", "template", "iframe", "object", "embed",
    "canvas", "svg", "link", "meta", "form", "input", "select", "textarea",
    "button", "nav", "header", "footer", "aside", "dialog", "video", "audio",
)

APP_CHROME: tuple[str, ...] = (
    ".feedback-buttons", ".sharing-links", ".action-buttons", ".share-panel",
    "[data-testid='copy-button']", "[data-testid='share-button']",
    "[aria-label='Copiar']", "[aria-label='Copy']", "[role='toolbar']",
    ".model-response-footer", ".conversation-actions",
)

NOISE_TEXT: frozenset[str] = frozenset({
    "copiado", "copiar", "copy", "copied", "editar", "edit",
    "compartilhar link p\u00fablico", "boa resposta", "good response",
    "resposta ruim", "bad response", "mais", "more", "sobre esta resposta",
    "economizou tempo", "limpar", "\u00fatil", "abrangente", "outro", "incorreto",
    "inadequado", "n\u00e3o funciona direito", "n\u00e3o", "enviar",
    "agradecemos a informa\u00e7\u00e3o", "facebook", "gmail", "reddit", "whatsapp",
    "linkedin", "regenerar", "regenerate", "nova conversa", "new chat",
    "you said:", "chatgpt said:", "voc\u00ea disse:",
    "a ia pode cometer erros. por isso, cheque as respostas",
    "uma c\u00f3pia desta conversa ser\u00e1 inclu\u00edda.",
})

NOISE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"o google pode usar os dados", re.I),
    re.compile(r" solicita\u00e7\u00e3o de remo\u00e7\u00e3o judicial", re.I),
    re.compile(r"a ia pode cometer erros", re.I),
    re.compile(r"chatgpt pode cometer erros", re.I),
    re.compile(r"chatgpt can make mistakes", re.I),
    re.compile(r"link p\u00fablico \u00e9 v\u00e1lido por", re.I),
    re.compile(r"ao continuar, voc\u00ea concorda", re.I),
)

MAX_CHROME_LENGTH = 160  # guard: never nuke a real answer that mentions "cookie"


@dataclass(frozen=True, slots=True)
class PlatformProfile:
    """Per-product knowledge. Adding a chat product = adding an entry."""

    id: str
    label: str
    role_attribute: str | None = None
    user_containers: tuple[str, ...] = ()
    assistant_containers: tuple[str, ...] = ()
    remove_selectors: tuple[str, ...] = ()


PROFILES: dict[str, PlatformProfile] = {
    "chatgpt": PlatformProfile(
        id="chatgpt",
        label="ChatGPT",
        role_attribute="data-message-author-role",
        user_containers=("[data-message-author-role='user']",),
        assistant_containers=("[data-message-author-role='assistant']",),
        remove_selectors=("[data-testid='composer-actions']",),
    ),
    "google-ai": PlatformProfile(
        id="google-ai",
        label="Google AI Mode / Search",
        role_attribute="data-message-id",
        user_containers=(".query-content",),
        assistant_containers=(".model-response-text",),
        remove_selectors=(".search-suggestion", ".related-questions", ".sources-panel"),
    ),
    "generic": PlatformProfile(id="generic", label="HTML gen\u00e9rico"),
}


@dataclass(frozen=True, slots=True)
class ConverterOptions:
    """Immutable run configuration. \`now\` is injected for reproducible tests."""

    platform: str = "auto"
    locale: str = "pt-BR"
    include_front_matter: bool = True
    include_timestamp: bool = True
    include_stats_footer: bool = True
    aggressive_noise_filter: bool = True
    now: datetime | None = None
    extra_remove_selectors: tuple[str, ...] = field(default_factory=tuple)`,
  },
  {
    path: "src/aicli/errors.py",
    lang: "python",
    summary:
      "Erros tipados com c\u00f3digo est\u00e1vel e dica de a\u00e7\u00e3o. A CLI mapeia c\u00f3digo \u2192 exit code, ent\u00e3o shell scripts conseguem reagir.",
    code: `"""Typed failures with stable machine-readable codes."""
from __future__ import annotations

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_NO_INPUT = 3
EXIT_DECODE = 4
EXIT_EMPTY = 5
EXIT_SECURITY = 6
EXIT_IO = 7


class ConversionError(Exception):
    """Base class: carries a code, an operator-facing message and a hint."""

    code = "CONVERSION_FAILED"
    exit_code = EXIT_IO

    def __init__(self, message: str, *, hint: str | None = None) -> None:
        super().__init__(message)
        self.hint = hint


class EmptyInputError(ConversionError):
    code = "EMPTY_INPUT"
    exit_code = EXIT_EMPTY


class DecodeError(ConversionError):
    code = "DECODE_FAILED"
    exit_code = EXIT_DECODE


class NoContentError(ConversionError):
    code = "NO_CONTENT"
    exit_code = EXIT_EMPTY


class InputTooLargeError(ConversionError):
    code = "INPUT_TOO_LARGE"
    exit_code = EXIT_SECURITY


class UnsafePathError(ConversionError):
    code = "UNSAFE_PATH"
    exit_code = EXIT_SECURITY


class MissingFileError(ConversionError):
    code = "FILE_NOT_FOUND"
    exit_code = EXIT_NO_INPUT`,
  },
  {
    path: "src/aicli/io_utils.py",
    lang: "python",
    summary:
      "Leitura resiliente a encoding (BOM \u2192 meta charset \u2192 utf-8 \u2192 cp1252, sempre auditada) e escrita at\u00f4mica via os.replace.",
    code: `"""Encoding-tolerant reading and crash-safe writing.

Legacy code did \`open(path, encoding="utf-8")\` and truncated the destination on
failure. Both behaviours are fixed here and covered by tests.
"""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from bs4 import BeautifulSoup

from .errors import DecodeError

_BOMS: tuple[tuple[bytes, str], ...] = (
    (b"\\xef\\xbb\\xbf", "utf-8-sig"),
    (b"\\xff\\xfe\\x00\\x00", "utf-32-le"),
    (b"\\x00\\x00\\xfe\\xff", "utf-32-be"),
    (b"\\xff\\xfe", "utf-16-le"),
    (b"\\xfe\\xff", "utf-16-be"),
)


@dataclass(frozen=True, slots=True)
class Decoded:
    text: str
    encoding: str
    confident: bool
    warnings: tuple[str, ...] = ()


def _declared_charset(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    meta = soup.find("meta", attrs={"charset": True}) or soup.find(
        "meta", attrs={"http-equiv": "Content-Type"}
    )
    if meta is None:
        return None
    content = meta.get("content") or meta.get("charset") or ""
    if "charset=" in content:
        return content.split("charset=")[-1].strip().strip("'\\\"")
    return str(meta.get("charset")) or None


def decode(data: bytes) -> Decoded:
    """Decode bytes, preferring explicit signals over guesses."""
    warnings: list[str] = []

    for bom, encoding in _BOMS:
        if data.startswith(bom):
            return Decoded(data.decode(encoding), encoding, True)

    utf8 = data.decode("utf-8", errors="strict") if _is_valid_utf8(data) else None
    if utf8 is not None:
        declared = _declared_charset(utf8)
        if declared and declared.lower().replace("-", "") not in {"utf8", "utf8sig"}:
            warnings.append(
                f"charset declarado \u00e9 {declared!r}, mas os bytes s\u00e3o UTF-8 v\u00e1lidos; usando UTF-8."
            )
        return Decoded(utf8, "utf-8", declared is None, tuple(warnings))

    try:
        text = data.decode("cp1252")
    except UnicodeDecodeError as exc:  # pragma: no cover - defensive
        raise DecodeError(
            "N\u00e3o foi poss\u00edvel decodificar o arquivo como UTF-8 ou cp1252.",
            hint="Re-exporte a p\u00e1gina pelo navegador (UTF-8) e tente novamente.",
        ) from exc

    warnings.append("Arquivo n\u00e3o \u00e9 UTF-8; decodificado como cp1252. Confira acentua\u00e7\u00e3o.")
    return Decoded(text, "cp1252", False, tuple(warnings))


def _is_valid_utf8(data: bytes) -> bool:
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def atomic_write(destination: Path, content: str) -> None:
    """Write via a sibling temp file + os.replace so the target never truncates."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="\\n", dir=destination.parent,
        prefix=f".{destination.name}.", suffix=".tmp", delete=False,
    )
    try:
        with handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(handle.name, destination)
    except BaseException:
        Path(handle.name).unlink(missing_ok=True)
        raise`,
  },
  {
    path: "src/aicli/paths.py",
    lang: "python",
    summary:
      "Corrige `.replace('.html', '.md')` (que gerava `chat.md.bak`) e fecha o path traversal apontado pelo cr\u00edtico no ciclo 3.",
    code: `"""Filename and destination safety."""
from __future__ import annotations

import unicodedata
from pathlib import Path

from .config import OUTPUT_SUFFIX
from .errors import UnsafePathError

_ILLEGAL = '/\\\\:*?"<>|'


def safe_output_name(source: str) -> str:
    """Deterministic, filesystem-safe output name for any input name.

    >>> safe_output_name("export quebrado.HTML")
    'export-quebrado.md'
    >>> safe_output_name("a.html.bak")
    'a.html.bak.md'
    """
    base = Path(source).name or "conversa"
    lowered = base.lower()
    stem = ""
    if lowered.endswith(".html") or lowered.endswith(".htm"):
        stem = base[: -len(".html")] if lowered.endswith(".html") else base[: -len(".htm")]
    stem = stem or base
    normalized = unicodedata.normalize("NFKD", stem)
    cleaned = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    cleaned = "".join("-" if ch in _ILLEGAL or ch.isspace() else ch for ch in cleaned)
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return f"{cleaned or 'conversa'}{OUTPUT_SUFFIX}"


def resolve_output_path(source: str, output_dir: Path) -> Path:
    """Resolve a destination, refusing to escape the requested directory."""
    base = output_dir.expanduser().resolve()
    base.mkdir(parents=True, exist_ok=True)
    candidate = (base / safe_output_name(source)).resolve()
    if base != candidate and base not in candidate.parents:
        raise UnsafePathError(
            f"{candidate} escapa do diret\u00f3rio de sa\u00edda {base}.",
            hint="Use --output-dir com um caminho normalizado.",
        )
    return candidate`,
  },
  {
    path: "src/aicli/sanitizer.py",
    lang: "python",
    summary:
      "Regra invariante: remover chrome, nunca conte\u00fado. R\u00f3tulos s\u00f3 s\u00e3o apagados quando o n\u00f3 \u00e9 integralmente um r\u00f3tulo conhecido.",
    code: `"""Remove product chrome without ever destroying conversation content."""
from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

from .config import (
    APP_CHROME,
    MAX_CHROME_LENGTH,
    NOISE_PATTERNS,
    NOISE_TEXT,
    STRUCTURAL_NOISE,
)


@dataclass(frozen=True, slots=True)
class SanitizeReport:
    removed: int
    emptied: int


def _normalized(text: str) -> str:
    return " ".join(text.strip().lower().split())


def is_pure_chrome(text: str, aggressive: bool = True) -> bool:
    """True when the whole string is a known UI label or legal boilerplate."""
    value = _normalized(text)
    if not value:
        return True
    if value in NOISE_TEXT:
        return True
    if not aggressive or len(value) > MAX_CHROME_LENGTH:
        return False
    return any(pattern.search(value) for pattern in NOISE_PATTERNS)


def sanitize(soup: BeautifulSoup, *, aggressive: bool = True, extra: tuple[str, ...] = ()) -> SanitizeReport:
    selectors = (*STRUCTURAL_NOISE, *APP_CHROME, *extra)
    removed = 0
    for selector in selectors:
        for node in soup.select(selector):
            node.decompose()
            removed += 1

    emptied = 0
    if aggressive:
        for node in list(soup.find_all(True)):
            if not isinstance(node, Tag) or node.decomposed:
                continue
            if node.find(["p", "li", "pre", "table", "h1", "h2", "h3", "h4", "h5", "h6"]):
                continue
            text = node.get_text(" ", strip=True)
            if text and is_pure_chrome(text):
                node.decompose()
                removed += 1

    # Bottom-up pruning of empty containers keeps the turn list free of blanks.
    changed = True
    while changed:
        changed = False
        for node in list(soup.find_all(["div", "span", "p", "section", "article"])):
            if not isinstance(node, Tag) or node.decomposed:
                continue
            if node.find(["img", "video", "hr"]):
                continue
            if not node.get_text(strip=True) and not node.find(True):
                node.decompose()
                emptied += 1
                changed = True

    return SanitizeReport(removed=removed, emptied=emptied)`,
  },
  {
    path: "src/aicli/extractor.py",
    lang: "python",
    summary:
      "O cora\u00e7\u00e3o do refactor: substitui `get_text()` por blocos sem\u00e2nticos em ordem de documento \u2014 listas numeradas, tabelas e fences sobrevivem.",
    code: `"""Semantic DOM -> ordered blocks.

Replaces \`soup.get_text(separator="\\n")\`, which flattened lists, tables, code
and paragraph boundaries into an unrecoverable line soup.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterator

from bs4 import NavigableString, Tag

LEAF_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,pre,blockquote,figcaption,table"
HEADINGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
_FENCE_LANG = re.compile(r"language-([a-z0-9+#-]+)", re.I)


@dataclass(frozen=True, slots=True)
class Block:
    index: int
    kind: str                       # heading | paragraph | list-item | code | quote | table
    text: str
    source: str = ""
    level: int | None = None
    declared_role: str | None = None
    extras: dict[str, str] = field(default_factory=dict)


def declared_role(tag: Tag) -> str | None:
    """Read authorship metadata when the platform provides it."""
    carrier = tag.find_parent(attrs={"data-message-author-role": True})
    if carrier is not None:
        value = carrier.get("data-message-author-role")
        if value in {"user", "assistant", "system"}:
            return str(value)
    if tag.find_parent(class_=re.compile(r"query-content")):
        return "user"
    if tag.find_parent(class_=re.compile(r"model-response-text")):
        return "assistant"
    return None


def _inline(node: NavigableString | Tag) -> str:
    if isinstance(node, NavigableString):
        return " ".join(str(node).split())
    if node.name == "br":
        return "\\n"
    if node.name == "img":
        alt = node.get("alt") or "imagem"
        src = node.get("src") or ""
        return f"![{alt}]({src})" if src else f"[{alt}]"

    inner = "".join(_inline(child) for child in node.children)  # type: ignore[arg-type]
    name = (node.name or "").lower()
    if name in {"strong", "b"} and inner.strip():
        return f"**{inner.strip()}**"
    if name in {"em", "i"} and inner.strip():
        return f"*{inner.strip()}*"
    if name in {"del", "s"} and inner.strip():
        return f"~~{inner.strip()}~~"
    if name == "code" and inner.strip():
        return f"\`{str(node.get_text())}\`" if "\`" not in node.get_text() else f"\`\` {node.get_text()} \`\`"
    if name == "a" and inner.strip():
        href = str(node.get("href") or "")
        if not href or href.startswith(("javascript:", "#")):
            return inner.strip()
        return f"[{inner.strip()}]({href})"
    return inner


def _list_marker(item: Tag) -> str:
    parent = item.parent
    if parent is not None and (parent.name or "").lower() == "ol":
        siblings = [c for c in parent.children if isinstance(c, Tag) and c.name == "li"]
        return f"{siblings.index(item) + 1}."
    return "-"


def _fence(tag: Tag) -> tuple[str, str]:
    body = tag.get_text().rstrip()
    classes = " ".join(tag.get("class", []) or [])
    code = tag.find("code")
    if code is not None:
        classes += " " + " ".join(code.get("class", []) or [])
    match = _FENCE_LANG.search(classes)
    fence = "\`\`\`"
    while fence in body:
        fence += "\`"
    lang = match.group(1).lower() if match else ""
    return fence, (fence + lang if lang else fence)


def _table(tag: Tag) -> str:
    rows = [r for r in tag.find_all("tr") if isinstance(r, Tag)]
    if not rows:
        return ""
    def cells(row: Tag) -> list[str]:
        return [
            _cell(c) for c in row.find_all(["th", "td"])
        ]
    def _cell(cell: Tag) -> str:
        text = " ".join(_inline(cell).split())
        return text.replace("|", "\\\\|") or " "
    header = cells(rows[0])
    body_rows = [cells(row) for row in rows[1:]]
    width = max(len(header), *(len(row) for row in body_rows), 1)
    header += [" "] * (width - len(header))
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
    for row in body_rows:
        row += [" "] * (width - len(row))
        lines.append("| " + " | ".join(row) + " |")
    return "\\n".join(lines)


def _candidates(body: Tag) -> Iterator[Tag]:
    accepted: list[Tag] = []
    for tag in body.select(LEAF_SELECTOR):
        if any(tag in parent.descendants for parent in accepted):
            continue
        name = (tag.name or "").lower()
        if name == "pre":
            accepted.append(tag)
            yield tag
            continue
        if name == "table":
            accepted.append(tag)
            yield tag
            continue
        if name in {"li", "dt", "dd"}:
            accepted.append(tag)
            yield tag
            continue
        if tag.select(LEAF_SELECTOR):
            continue
        if not tag.get_text(strip=True):
            continue
        accepted.append(tag)
        yield tag


def extract_blocks(body: Tag, *, aggressive: bool = True) -> list[Block]:
    blocks: list[Block] = []
    for tag in _candidates(body):
        name = (tag.name or "").lower()
        role = declared_role(tag)
        index = len(blocks)

        if name == "pre":
            fence, opening = _fence(tag)
            text = f"{opening}\\n{tag.get_text().strip()}\\n{fence}"
            blocks.append(Block(index, "code", text, "pre", declared_role=role))
            continue
        if name == "table":
            text = _table(tag)
            if text:
                blocks.append(Block(index, "table", text, "table", declared_role=role))
            continue
        if name in {"li", "dt", "dd"}:
            text = " ".join(_inline(tag).split())
            if text:
                blocks.append(
                    Block(index, "list-item", f"{_list_marker(tag)} {text}", name, declared_role=role)
                )
            continue

        text = "\\n".join(line.strip() for line in _inline(tag).split("\\n")).strip()
        if not text or is_pure_chrome(text, aggressive):
            continue
        if name in HEADINGS:
            blocks.append(Block(index, "heading", text, name, HEADINGS[name], role))
        elif name == "blockquote":
            quoted = "\\n".join(f"> {line}" for line in text.splitlines())
            blocks.append(Block(index, "quote", quoted, name, declared_role=role))
        else:
            blocks.append(Block(index, "paragraph", text, name, declared_role=role))

    return blocks`,
  },
];
