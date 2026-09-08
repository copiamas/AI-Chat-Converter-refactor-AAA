"""Limpeza estrutural do HTML: remove elementos de interface sem tocar no texto do chat."""

from __future__ import annotations

from bs4 import BeautifulSoup, Comment

#: Seletores CSS removidos integralmente (estrutura de layout e interface).
SELETORES_ESTRUTURA: tuple[str, ...] = (
    "script",
    "style",
    "noscript",
    "nav",
    "header",
    "footer",
    "button",
    "svg",
    "iframe",
    "embed",
    "object",
    "template",
    ".feedback-buttons",
    ".sharing-links",
    ".action-buttons",
    ".menu",
    ".toolbar",
    ".popover",
    ".dropdown-menu",
    ".spinner",
    ".skeleton",
    # Modo IA do Google (página de pesquisa): diálogos de compartilhamento e
    # controles "Mostrar menos"/"Mostrar tudo" são lixo de interface.
    ".wNVCsd",
    ".N6Axvb",
    ".ub891",
    ".LvLtCb",
)

#: Elementos de navegação/formulário removidos integralmente.
ELEMENTOS_NAVEGACAO: tuple[str, ...] = ("form", "input", "select", "textarea")

#: Atributos sempre descartados do HTML final (mesmo em conteúdo preservado).
ATRIBUTOS_DESCARTADOS: tuple[str, ...] = (
    "id",
    "class",
    "style",
    "onclick",
    "onload",
    "onerror",
    "data-testid",
    "data-test-id",
    "role",
    "tabindex",
    "aria-label",
    "aria-hidden",
    "aria-labelledby",
    "aria-describedby",
    "target",
    "rel",
    "data-message-id",
    "data-slate-node",
    "data-slate-object",
    "data-node-index",
    "data-content-editable-root",
    "data-lexical-editor",
)


def limpar_botoes_e_lixo(soup: BeautifulSoup) -> int:
    """Remove elementos estruturais e de interface, retornando a quantidade removida.

    Scripts, estilos, botões, menus e elementos de feedback são removidos por
    completo. Links de navegação global são removidos junto com seus containers;
    links dentro do conteúdo da conversa são preservados para virar links
    Markdown na etapa de extração.
    """
    removidos = 0
    for seletor in SELETORES_ESTRUTURA:
        for elemento in list(soup.select(seletor)):
            elemento.decompose()
            removidos += 1
    for nome in ELEMENTOS_NAVEGACAO:
        for elemento in list(soup.find_all(nome)):
            elemento.decompose()
            removidos += 1
    return removidos


def sanitizar_atributos(soup: BeautifulSoup) -> None:
    """Remove comentários e atributos irrelevantes do documento (em memória).

    Roda depois da extração do diálogo; preserva apenas o essencial para o
    HTML que eventualmente é embutido no Markdown final.
    """
    for no in soup.descendants:
        if isinstance(no, Comment):
            no.extract()
    for tag in soup.find_all():
        for atributo in list(tag.attrs):
            if atributo in ATRIBUTOS_DESCARTADOS:
                del tag.attrs[atributo]
