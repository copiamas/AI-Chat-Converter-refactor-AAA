"""Testes do construtor de Markdown."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ai_converter_cli.markdown_builder import construir_markdown
from ai_converter_cli.models import Conversa, OpcoesConversao, Turno


def _opcoes(**alteracoes: object) -> OpcoesConversao:
    padrao: dict[str, object] = {"diretorio": Path(".")}
    padrao.update(alteracoes)
    return OpcoesConversao(**padrao)  # type: ignore[arg-type]


def test_cabecalho_completo() -> None:
    agora = datetime(2026, 8, 27, 14, 30, 5)
    markdown = construir_markdown(Conversa(), _opcoes(), agora=agora)

    assert 'title: "Conversa Exportada via AI Converter CLI"' in markdown
    assert "date: 27/08/2026" in markdown
    assert "time: 14:30:05" in markdown
    assert 'platform: "Google Modo IA / Search"' in markdown
    assert "# 📝 Histórico de Conversa" in markdown
    assert "> **Data da Exportação:** 27/08/2026 às 14:30:05" in markdown


def test_cabecalho_personalizado() -> None:
    markdown = construir_markdown(
        Conversa(),
        _opcoes(titulo="Minha conversa", plataforma="ChatGPT"),
        agora=datetime(2026, 8, 27),
    )
    assert 'title: "Minha conversa"' in markdown
    assert 'platform: "ChatGPT"' in markdown


def test_sem_cabecalho_e_sem_turnos_retorna_vazio() -> None:
    markdown = construir_markdown(
        Conversa(), _opcoes(gerar_cabecalho=False), agora=datetime(2026, 8, 27)
    )
    assert markdown == ""


def test_um_turno_de_ia() -> None:
    conversa = Conversa(turnos=(Turno(autor="IA", texto="Resposta completa"),))
    markdown = construir_markdown(conversa, _opcoes(gerar_cabecalho=False))
    assert "### 🤖 IA:" in markdown
    assert "Resposta completa" in markdown
    assert "### 👤 Usuário" not in markdown


def test_alternancia_de_turnos_preservada() -> None:
    conversa = Conversa(
        turnos=(
            Turno(autor="usuário", texto="P1"),
            Turno(autor="IA", texto="R1"),
            Turno(autor="usuário", texto="P2"),
            Turno(autor="IA", texto="R2"),
        )
    )
    markdown = construir_markdown(conversa, _opcoes(gerar_cabecalho=False))

    primeiro_usuario = markdown.index("### 👤 Usuário")
    primeira_ia = markdown.index("### 🤖 IA")
    segundo_usuario = markdown.rindex("### 👤 Usuário")
    segunda_ia = markdown.rindex("### 🤖 IA")
    assert primeiro_usuario < primeira_ia < segundo_usuario < segunda_ia
    assert markdown.count("\n---\n") == 3


def test_texto_multilinha_e_preservado() -> None:
    texto = "Linha um\n\n```python\nx = 1\n    y = 2\n```\n\nLinha três"
    conversa = Conversa(turnos=(Turno(autor="usuário", texto=texto),))
    markdown = construir_markdown(conversa, _opcoes(gerar_cabecalho=False))
    assert "Linha um" in markdown
    assert "x = 1" in markdown
    assert "Linha três" in markdown
