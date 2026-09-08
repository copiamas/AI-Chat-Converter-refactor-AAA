"""Testes de normalização de texto."""

from __future__ import annotations

from ai_converter_cli.textutils import normalizar_texto


def test_colapsa_espacos_repetidos() -> None:
    assert normalizar_texto("Olá     mundo") == "Olá mundo"


def test_colapsa_linhas_em_branco_repetidas() -> None:
    assert normalizar_texto("A\n\n\n\nB") == "A\n\nB"


def test_preserva_blocos_de_codigo() -> None:
    texto = "Antes\n\n```\ndef f():\n    return  1\n```\n\nDepois"
    resultado = normalizar_texto(texto)
    assert "    return  1" in resultado
    assert "```" in resultado


def test_normaliza_quebras_de_linha_windows() -> None:
    assert normalizar_texto("linha1\r\nlinha2") == "linha1\nlinha2"


def test_remove_espacos_das_extremidades() -> None:
    assert normalizar_texto("  texto  \n") == "texto"
