"""Testes de integração do conversor (arquivo HTML → Markdown)."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import pytest
from ai_converter_cli.converter import converter_arquivo
from ai_converter_cli.models import OpcoesConversao

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURA_REALISTA = FIXTURES / "chat_realista.html"

HTML_SEM_DIALOGO = "<html><body><p>só texto solto</p></body></html>"

HTML_MINIMO = """<html><body>
<div data-message-author-role="user"><p>Qual a capital do Brasil?</p></div>
<div data-message-author-role="assistant"><p>Brasília.</p></div>
</body></html>"""


def _copiar_fixture(tmp_path: Path) -> Path:
    origem = tmp_path / "conversa.html"
    shutil.copyfile(FIXTURA_REALISTA, origem)
    return origem


def test_converte_arquivo_completo(tmp_path: Path) -> None:
    origem = _copiar_fixture(tmp_path)
    resultado = converter_arquivo(origem, OpcoesConversao(diretorio=tmp_path))

    destino = tmp_path / "conversa.md"
    assert resultado.destino == destino
    assert destino.is_file()
    conteudo = destino.read_text(encoding="utf-8")

    assert "### 👤 Usuário" in conteudo
    assert "### 🤖 IA" in conteudo
    assert "merge sort" in conteudo
    assert "Brasília" not in conteudo
    assert "Boa resposta" not in conteudo
    assert "var fake" not in conteudo
    assert re.search(r"date: \d{2}/\d{2}/\d{4}", conteudo) is not None
    assert re.search(r"time: \d{2}:\d{2}:\d{2}", conteudo) is not None


def test_saida_intercala_usuario_e_ia(tmp_path: Path) -> None:
    origem = _copiar_fixture(tmp_path)
    converter_arquivo(origem, OpcoesConversao(diretorio=tmp_path))
    conteudo = (tmp_path / "conversa.md").read_text(encoding="utf-8")

    primeiro_usuario = conteudo.index("### 👤 Usuário")
    primeira_ia = conteudo.index("### 🤖 IA")
    segundo_usuario = conteudo.rindex("### 👤 Usuário")
    segunda_ia = conteudo.rindex("### 🤖 IA")
    assert primeiro_usuario < primeira_ia < segundo_usuario < segunda_ia


def test_arquivo_inexistente_levanta_file_not_found(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        converter_arquivo(tmp_path / "x.html", OpcoesConversao(diretorio=tmp_path))


def test_recusa_sobrescrever_sem_force(tmp_path: Path) -> None:
    origem = _copiar_fixture(tmp_path)
    (tmp_path / "conversa.md").write_text("já existe", encoding="utf-8")

    with pytest.raises(FileExistsError):
        converter_arquivo(origem, OpcoesConversao(diretorio=tmp_path))
    assert (tmp_path / "conversa.md").read_text(encoding="utf-8") == "já existe"


def test_force_sobrescreve_arquivo_existente(tmp_path: Path) -> None:
    origem = _copiar_fixture(tmp_path)
    (tmp_path / "conversa.md").write_text("já existe", encoding="utf-8")

    resultado = converter_arquivo(
        origem,
        OpcoesConversao(diretorio=tmp_path, sobreescrever=True),
    )
    conteudo = (tmp_path / "conversa.md").read_text(encoding="utf-8")
    assert resultado.conversa.quantidade_turnos == 4
    assert "já existe" not in conteudo


def test_html_original_embutido(tmp_path: Path) -> None:
    origem = _copiar_fixture(tmp_path)
    converter_arquivo(origem, OpcoesConversao(diretorio=tmp_path, html_original=True))
    conteudo = (tmp_path / "conversa.md").read_text(encoding="utf-8")
    assert "<details>" in conteudo
    assert "```html" in conteudo
    assert 'data-message-author-role="user"' in conteudo


def test_dialogo_vazio_gera_apenas_cabecalho(tmp_path: Path) -> None:
    origem = tmp_path / "vazia.html"
    origem.write_text(HTML_SEM_DIALOGO, encoding="utf-8")
    resultado = converter_arquivo(origem, OpcoesConversao(diretorio=tmp_path))

    assert resultado.conversa.vazio
    conteudo = (tmp_path / "vazia.md").read_text(encoding="utf-8")
    assert "Histórico de Conversa" in conteudo
    assert "### 👤 Usuário" not in conteudo


def test_sem_cabecalho_produz_apenas_dialogo(tmp_path: Path) -> None:
    origem = tmp_path / "minima.html"
    origem.write_text(HTML_MINIMO, encoding="utf-8")
    converter_arquivo(origem, OpcoesConversao(diretorio=tmp_path, gerar_cabecalho=False))
    conteudo = (tmp_path / "minima.md").read_text(encoding="utf-8")
    assert "title:" not in conteudo
    assert "Histórico de Conversa" not in conteudo
    assert "### 👤 Usuário" in conteudo
    assert "### 🤖 IA" in conteudo


def test_arquivo_htm_gera_md_correspondente(tmp_path: Path) -> None:
    origem = tmp_path / "pagina.htm"
    origem.write_text(HTML_MINIMO, encoding="utf-8")
    resultado = converter_arquivo(origem, OpcoesConversao(diretorio=tmp_path))
    assert resultado.destino == tmp_path / "pagina.md"
    assert resultado.destino.is_file()
