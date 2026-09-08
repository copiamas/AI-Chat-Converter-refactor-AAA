"""Testes do módulo de limpeza estrutural do HTML."""

from __future__ import annotations

from ai_converter_cli.cleaner import limpar_botoes_e_lixo, sanitizar_atributos
from bs4 import BeautifulSoup


def test_remove_scripts_e_styles() -> None:
    soup = BeautifulSoup(
        "<html><body><script>var x = 1</script><style>.a {}</style><p>texto</p></body></html>",
        "html.parser",
    )
    assert limpar_botoes_e_lixo(soup) == 2
    assert soup.find("script") is None
    assert soup.find("style") is None
    assert soup.get_text().strip() == "texto"


def test_remove_botoes_e_feedback() -> None:
    soup = BeautifulSoup(
        '<div class="message"><p>ok</p><div class="feedback-buttons">'
        "<button>Boa resposta</button></div></div>",
        "html.parser",
    )
    assert limpar_botoes_e_lixo(soup) == 2
    assert soup.get_text().strip() == "ok"


def test_remove_navegacao_mas_preserva_link_de_conteudo() -> None:
    soup = BeautifulSoup(
        "<header><a>Menu</a></header><div><a href='#x'>link no conteúdo</a></div>",
        "html.parser",
    )
    limpar_botoes_e_lixo(soup)
    assert soup.find("header") is None
    link_conteudo = soup.find("a")
    assert link_conteudo is not None
    assert link_conteudo.get_text() == "link no conteúdo"


def test_remove_formularios_e_inputs() -> None:
    soup = BeautifulSoup("<form><input name='q'></form><p>oi</p>", "html.parser")
    assert limpar_botoes_e_lixo(soup) == 1
    assert soup.get_text().strip() == "oi"


def test_limpar_preserva_texto_principal() -> None:
    soup = BeautifulSoup(
        "<div><button>OK</button><span>Olá mundo</span><nav><a>x</a></nav></div>",
        "html.parser",
    )
    limpar_botoes_e_lixo(soup)
    assert soup.get_text().strip() == "Olá mundo"


def test_limpar_sem_elementos_nao_quebra() -> None:
    soup = BeautifulSoup("<p>só texto</p>", "html.parser")
    assert limpar_botoes_e_lixo(soup) == 0
    assert soup.get_text() == "só texto"


def test_sanitizar_remove_comentarios_e_atributos() -> None:
    soup = BeautifulSoup(
        "<!-- comentário --><p class='x' onclick='alert(1)' data-testid='y'>texto</p>",
        "html.parser",
    )
    sanitizar_atributos(soup)
    paragrafo = soup.find("p")
    assert paragrafo is not None
    assert paragrafo.get("class") is None
    assert paragrafo.get("onclick") is None
    assert paragrafo.get("data-testid") is None
    assert "comentário" not in soup.get_text()


def test_sanitizar_mantem_href_e_title() -> None:
    soup = BeautifulSoup(
        '<a href="https://x" title="docs" target="_blank">link</a>',
        "html.parser",
    )
    sanitizar_atributos(soup)
    link = soup.find("a")
    assert link is not None
    assert link.get("href") == "https://x"
    assert link.get("title") == "docs"
    assert link.get("target") is None
