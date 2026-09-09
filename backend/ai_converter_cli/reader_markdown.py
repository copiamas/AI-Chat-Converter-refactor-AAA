"""Exportacao Markdown do modelo intermediario do leitor."""

from __future__ import annotations

from pathlib import Path

from .reader import Block, ReaderDocument


def document_to_markdown(document: ReaderDocument) -> str:
    lines = ["---", f'title: "{_yaml(document.title)}"', f'source: "{_yaml(document.source_name)}"',
             f'type: "{_yaml(document.detected_type)}"', f'status: "{document.status}"']
    if document.origin:
        lines.append(f'origin: "{_yaml(document.origin)}"')
    if document.captured_at:
        lines.append(f'captured_at: "{_yaml(document.captured_at)}"')
    lines.extend(["---", "", f"# {document.title}", ""])
    if document.turns:
        for turn in document.turns:
            lines.extend([f"## {turn['author']}", "", turn["text"], ""])
    else:
        for block in document.blocks:
            rendered = _render_block(block)
            if rendered:
                lines.extend([rendered, ""])
    return "\n".join(lines).rstrip() + "\n"


def export_markdown(document: ReaderDocument, destination: Path) -> Path:
    destination = destination.expanduser().resolve()
    if destination.suffix.lower() != ".md":
        destination = destination.with_suffix(".md")
    if destination.exists():
        raise FileExistsError(f"O destino ja existe: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open("x", encoding="utf-8", newline="") as handle:
            handle.write(document_to_markdown(document))
    except FileExistsError:
        raise FileExistsError(f"O destino ja existe: {destination}") from None
    return destination


def _render_block(block: Block) -> str:
    if block.type == "heading": return f"{'#' * (block.level or 2)} {block.text}"
    if block.type == "code": return f"```{block.language or ''}\n{block.text}\n```"
    if block.type == "quote": return "\n".join(f"> {line}" for line in block.text.splitlines())
    if block.type == "image": return f"![{block.alt or ''}]({block.src or ''})"
    if block.type == "link": return f"[{block.text or block.href}]({block.href})"
    if block.type == "table" and block.rows:
        width = max(len(row) for row in block.rows)
        rows = [list(row) + [""] * (width - len(row)) for row in block.rows]
        return "\n".join(["| " + " | ".join(rows[0]) + " |", "| " + " | ".join(["---"] * width) + " |", *("| " + " | ".join(row) + " |" for row in rows[1:])])
    return block.text


def _yaml(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
