"""Leitor local de paginas HTML salvas e seu modelo intermediario."""

from __future__ import annotations

import hashlib
import mimetypes
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup, Tag

from .html_parser import extrair_conversa

MAX_HTML_BYTES = 20 * 1024 * 1024
Status = Literal["ready", "partial", "review", "failed"]


class ReaderError(ValueError):
    """Erro de entrada seguro para exibicao na interface."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Resource:
    original: str
    local_path: str | None
    kind: str
    status: Literal["found", "missing", "blocked", "remote"]


@dataclass(frozen=True)
class Block:
    id: str
    type: Literal["heading", "paragraph", "code", "table", "image", "link", "quote", "list"]
    text: str = ""
    level: int | None = None
    language: str | None = None
    href: str | None = None
    src: str | None = None
    alt: str | None = None
    rows: tuple[tuple[str, ...], ...] = ()


@dataclass(frozen=True)
class ReaderDocument:
    schema_version: int
    id: str
    source_path: str
    source_name: str
    title: str
    origin: str | None
    captured_at: str | None
    detected_type: str
    confidence: float
    status: Status
    blocks: tuple[Block, ...]
    turns: tuple[dict[str, str], ...]
    resources: tuple[Resource, ...]
    diagnostics: tuple[dict[str, str], ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def read_saved_page(source: Path) -> ReaderDocument:
    """Le um HTML local sem modificar a fonte e produz o modelo serializavel."""
    source = source.expanduser().resolve()
    if source.suffix.lower() not in {".html", ".htm"}:
        raise ReaderError("INVALID_TYPE", "Selecione um arquivo .html ou .htm.")
    if not source.is_file():
        raise ReaderError("NOT_FOUND", "O arquivo selecionado nao foi encontrado.")
    size = source.stat().st_size
    if size == 0:
        raise ReaderError("EMPTY_FILE", "O arquivo HTML esta vazio.")
    if size > MAX_HTML_BYTES:
        raise ReaderError("TOO_LARGE", "O HTML excede o limite de 20 MiB.")
    try:
        with source.open("rb") as handle:
            raw = handle.read(MAX_HTML_BYTES + 1)
    except OSError as exc:
        raise ReaderError("UNREADABLE", "Nao foi possivel ler o arquivo.") from exc
    if len(raw) > MAX_HTML_BYTES:
        raise ReaderError("TOO_LARGE", "O HTML excede o limite de 20 MiB.")
    text, encoding_warning = _decode(raw)
    soup = BeautifulSoup(text, "html.parser")
    if not soup.find(True):
        raise ReaderError("INVALID_HTML", "O arquivo nao contem uma pagina HTML valida.")

    diagnostics: list[dict[str, str]] = []
    if encoding_warning:
        diagnostics.append({"level": "warning", "code": "ENCODING_RECOVERED", "message": encoding_warning})
    if not soup.html or not soup.body:
        diagnostics.append({"level": "warning", "code": "MALFORMED_RECOVERED", "message": "HTML incompleto recuperado pelo leitor."})

    title = (soup.title.get_text(" ", strip=True) if soup.title else "") or source.stem
    origin = _origin(soup)
    captured_at = _captured_at(soup)
    detected_type, confidence = _detect_type(soup)
    conversation = extrair_conversa(soup)
    turns = tuple({"author": t.autor, "text": t.texto} for t in conversation.turnos)
    blocks = tuple(_extract_blocks(soup))
    resources = tuple(_resources(soup, source))
    missing = sum(r.status == "missing" for r in resources)
    blocked = sum(r.status in {"blocked", "remote"} for r in resources)
    if missing:
        diagnostics.append({"level": "warning", "code": "MISSING_RESOURCES", "message": f"{missing} recurso(s) local(is) nao encontrado(s)."})
    if blocked:
        diagnostics.append({"level": "warning", "code": "BLOCKED_RESOURCES", "message": f"{blocked} referencia(s) insegura(s) foi(ram) bloqueada(s)."})
    if confidence < 0.55:
        diagnostics.append({"level": "warning", "code": "LOW_CONFIDENCE", "message": "Estrutura generica: confira a autoria e a ordem dos blocos."})
    if not blocks and not turns:
        raise ReaderError("NO_CONTENT", "Nenhum conteudo legivel foi encontrado.")
    status: Status = "partial" if missing or blocked else "review" if confidence < 0.55 else "ready"
    digest = hashlib.sha256(raw).hexdigest()[:20]
    return ReaderDocument(1, digest, str(source), source.name, title, origin, captured_at,
                          detected_type, confidence, status, blocks, turns, resources,
                          tuple(diagnostics))


def _decode(raw: bytes) -> tuple[str, str | None]:
    for encoding in ("utf-8-sig", "utf-8"):
        try:
            return raw.decode(encoding), None
        except UnicodeDecodeError:
            pass
    return raw.decode("windows-1252", errors="replace"), "Codificacao original convertida para Unicode."


def _origin(soup: BeautifulSoup) -> str | None:
    canonical = soup.select_one('link[rel="canonical"]')
    if canonical and canonical.get("href"):
        return str(canonical["href"])
    meta = soup.select_one('meta[property="og:url"], meta[name="url"]')
    return str(meta["content"]) if meta and meta.get("content") else None


def _captured_at(soup: BeautifulSoup) -> str | None:
    meta = soup.select_one('meta[property="article:published_time"], time[datetime]')
    if meta:
        value = meta.get("content") or meta.get("datetime")
        if value:
            return str(value)
    return None


def _detect_type(soup: BeautifulSoup) -> tuple[str, float]:
    if soup.select_one('[data-message-author-role]'):
        return "ChatGPT", 0.96
    if soup.select_one("div.CKgc1d, div.mZJni"):
        return "Google Modo IA", 0.94
    if soup.select_one("main article"):
        return "Artigo", 0.68
    return "Pagina generica", 0.4


def _extract_blocks(soup: BeautifulSoup) -> list[Block]:
    root = soup.body or soup
    result: list[Block] = []
    selected = root.select("h1,h2,h3,h4,h5,h6,p,pre,blockquote,table,img,ul,ol")
    for index, node in enumerate(selected):
        if node.find_parent(["script", "style", "nav", "footer", "button"]):
            continue
        block = _block(node, f"block-{index}")
        if block and (block.text or block.src or block.rows):
            result.append(block)
        if node.name == "p":
            for link_index, anchor in enumerate(node.find_all("a", href=True)):
                result.append(Block(f"block-{index}-link-{link_index}", "link", anchor.get_text(" ", strip=True), href=str(anchor["href"])))
    return result


def _block(node: Tag, block_id: str) -> Block | None:
    text = node.get_text("\n" if node.name == "pre" else " ", strip=True)
    if node.name and node.name.startswith("h") and len(node.name) == 2:
        return Block(block_id, "heading", text, level=int(node.name[1]))
    if node.name == "pre":
        code = node.find("code")
        classes = code.get("class", []) if code else []
        language = next((str(c).removeprefix("language-") for c in classes if str(c).startswith("language-")), None)
        return Block(block_id, "code", text, language=language)
    if node.name == "table":
        rows = tuple(tuple(cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])) for row in node.find_all("tr"))
        return Block(block_id, "table", rows=rows)
    if node.name == "img":
        return Block(block_id, "image", src=str(node.get("src", "")), alt=str(node.get("alt", "")))
    kinds = {"blockquote": "quote", "ul": "list", "ol": "list", "p": "paragraph"}
    kind = kinds.get(node.name or "")
    return Block(block_id, kind, text) if kind else None  # type: ignore[arg-type]


def _resources(soup: BeautifulSoup, source: Path) -> list[Resource]:
    refs: list[tuple[str, str]] = []
    refs.extend((str(tag.get("src")), "image") for tag in soup.find_all("img", src=True))
    refs.extend((str(tag.get("href")), "stylesheet") for tag in soup.select('link[rel="stylesheet"][href]'))
    refs.extend((str(tag.get("src")), "media") for tag in soup.select("video[src],audio[src],source[src]"))
    result: list[Resource] = []
    for original, kind in refs:
        parsed = urlparse(original)
        if parsed.scheme in {"http", "https", "data"} or original.startswith("//"):
            result.append(Resource(original, None, kind, "remote"))
            continue
        if parsed.scheme and parsed.scheme != "file":
            result.append(Resource(original, None, kind, "blocked"))
            continue
        candidate = Path(unquote(parsed.path if parsed.scheme == "file" else original.split("?", 1)[0].split("#", 1)[0]))
        if candidate.is_absolute():
            result.append(Resource(original, None, kind, "blocked"))
            continue
        resolved = (source.parent / candidate).resolve()
        try:
            resolved.relative_to(source.parent.resolve())
        except ValueError:
            result.append(Resource(original, None, kind, "blocked"))
            continue
        result.append(Resource(original, str(resolved) if resolved.is_file() else None, mimetypes.guess_type(str(resolved))[0] or kind, "found" if resolved.is_file() else "missing"))
    return result
