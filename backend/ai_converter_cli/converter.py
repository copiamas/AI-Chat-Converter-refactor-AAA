"""Orquestração da conversão de um arquivo HTML para Markdown."""

from __future__ import annotations

from pathlib import Path

from bs4 import BeautifulSoup

from .cleaner import sanitizar_atributos
from .html_parser import extrair_conversa, ler_e_limpar
from .markdown_builder import construir_markdown
from .models import SUFIXO_MARKDOWN, OpcoesConversao, ResultadoConversao


def converter_arquivo(origem: Path, opcoes: OpcoesConversao) -> ResultadoConversao:
    """Converte um arquivo HTML em Markdown e grava o arquivo de saída.

    O arquivo gerado usa o mesmo nome da origem com a extensão `.md`.

    Raises:
        FileNotFoundError: se o arquivo de origem não existir.
        FileExistsError: se o destino já existir sem `sobreescrever`.
        OSError: se houver falha de leitura ou escrita.
    """
    if not origem.is_file():
        raise FileNotFoundError(f"Arquivo não encontrado: {origem}")
    destino = (opcoes.caminho_saida / origem.name).with_suffix(SUFIXO_MARKDOWN)
    if destino.exists() and not opcoes.sobreescrever:
        raise FileExistsError(
            f"O arquivo de destino já existe: {destino} (use --force para sobrescrever)."
        )

    documento = ler_e_limpar(origem)
    conversa = extrair_conversa(documento.soup)
    sanitizar_atributos(documento.soup)

    markdown = construir_markdown(conversa, opcoes)
    if opcoes.html_original:
        markdown += "\n\n" + _bloco_html_original(documento.soup)

    destino.write_text(markdown, encoding="utf-8")
    return ResultadoConversao(
        origem=origem,
        destino=destino,
        conversa=conversa,
        removidos=documento.removidos,
    )


def _bloco_html_original(soup: BeautifulSoup) -> str:
    """HTML já limpo, embutido no Markdown dentro de um bloco colapsável."""
    html = soup.prettify()
    return (
        "<details>\n<summary>HTML original (limpo)</summary>\n\n```html\n"
        + html
        + "\n```\n</details>"
    )
