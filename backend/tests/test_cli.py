"""Testes da camada de interface de linha de comando."""

from __future__ import annotations

from pathlib import Path

import pytest
from ai_converter_cli.cli import (
    _escolher_arquivo,
    _formatar_erro,
    _validar_escolha,
    listar_arquivos_html,
    main,
)
from rich.prompt import Prompt

pytestmark = pytest.mark.cli

HTML_MINIMO = """<html><body>
<div data-message-author-role="user"><p>Qual a capital do Brasil?</p></div>
<div data-message-author-role="assistant"><p>Brasília.</p></div>
</body></html>"""


def _criar_arquivo(diretorio: Path, nome: str, conteudo: str = HTML_MINIMO) -> Path:
    caminho = diretorio / nome
    caminho.write_text(conteudo, encoding="utf-8")
    return caminho


# ---------------------------------------------------------------------------
# listar_arquivos_html
# ---------------------------------------------------------------------------


def test_listar_arquivos_html_ordena_e_filtra(tmp_path: Path) -> None:
    _criar_arquivo(tmp_path, "b.html")
    _criar_arquivo(tmp_path, "a.HTML")
    _criar_arquivo(tmp_path, "c.htm")
    _criar_arquivo(tmp_path, "d.txt")
    _criar_arquivo(tmp_path, "e.md")
    (tmp_path / "subdir").mkdir()

    nomes = [caminho.name for caminho in listar_arquivos_html(tmp_path)]
    assert nomes == ["a.HTML", "b.html", "c.htm"]


def test_listar_arquivos_html_diretorio_vazio(tmp_path: Path) -> None:
    assert listar_arquivos_html(tmp_path) == []


# ---------------------------------------------------------------------------
# _validar_escolha
# ---------------------------------------------------------------------------


def test_validar_escolha_aceita_valores_validos() -> None:
    assert _validar_escolha("1", 3) == 0
    assert _validar_escolha("3", 3) == 2
    assert _validar_escolha(" 2 ", 3) == 1


def test_validar_escolha_rejeita_texto() -> None:
    with pytest.raises(ValueError):
        _validar_escolha("abc", 3)
    with pytest.raises(ValueError):
        _validar_escolha("1.5", 3)


def test_validar_escolha_rejeita_fora_do_intervalo() -> None:
    with pytest.raises(IndexError):
        _validar_escolha("0", 3)
    with pytest.raises(IndexError):
        _validar_escolha("4", 3)


# ---------------------------------------------------------------------------
# _escolher_arquivo
# ---------------------------------------------------------------------------


def test_escolher_arquivo_usa_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    arquivos = [Path("a.html"), Path("b.html")]
    monkeypatch.setattr(Prompt, "ask", lambda *args, **kwargs: "2")
    assert _escolher_arquivo(arquivos) == Path("b.html")


def test_escolher_arquivo_tenta_novamente_apos_entrada_invalida(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    respostas = iter(["abc", "9", "1"])
    monkeypatch.setattr(Prompt, "ask", lambda *args, **kwargs: next(respostas))
    assert _escolher_arquivo([Path("a.html"), Path("b.html")]) == Path("a.html")


# ---------------------------------------------------------------------------
# _formatar_erro
# ---------------------------------------------------------------------------


def test_formatar_erro_mapeia_excecoes_conhecidas() -> None:
    assert "não encontrado" in _formatar_erro(FileNotFoundError("x.html"))
    assert "já existe" in _formatar_erro(FileExistsError("já existe: a.md"))
    assert "permissão" in _formatar_erro(PermissionError())
    assert "erro genérico" in _formatar_erro(ValueError("erro genérico"))


# ---------------------------------------------------------------------------
# main — fluxos completos
# ---------------------------------------------------------------------------


def test_main_sem_arquivos_retorna_1(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    assert main([]) == 1


def test_main_interativo_converte_arquivo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _criar_arquivo(tmp_path, "conversa.html")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(Prompt, "ask", lambda *args, **kwargs: "1")

    assert main([]) == 0
    conteudo = (tmp_path / "conversa.md").read_text(encoding="utf-8")
    assert "### 👤 Usuário" in conteudo
    assert "Brasília" in conteudo


def test_main_interativo_com_diretorio_explicito(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _criar_arquivo(tmp_path, "conversa.html")
    monkeypatch.chdir(tmp_path.parent)
    monkeypatch.setattr(Prompt, "ask", lambda *args, **kwargs: "1")

    assert main([str(tmp_path)]) == 0
    assert (tmp_path / "conversa.md").is_file()


def test_main_interativo_avisa_quando_nao_há_dialogo(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _criar_arquivo(tmp_path, "solto.html", "<html><body><p>só texto</p></body></html>")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(Prompt, "ask", lambda *args, **kwargs: "1")

    assert main([]) == 0
    saida = capsys.readouterr().out
    assert "Nenhum bloco de diálogo" in saida


def test_main_auto_converte_todos(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _criar_arquivo(tmp_path, "a.html")
    _criar_arquivo(tmp_path, "b.html")
    monkeypatch.chdir(tmp_path)

    assert main(["--auto"]) == 0
    assert (tmp_path / "a.md").is_file()
    assert (tmp_path / "b.md").is_file()


def test_main_auto_sem_arquivos_retorna_1(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    assert main(["--auto"]) == 1


def test_main_indice_converte_arquivo_especifico(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _criar_arquivo(tmp_path, "a.html")
    _criar_arquivo(tmp_path, "b.html")
    monkeypatch.chdir(tmp_path)

    assert main(["--indice", "2"]) == 0
    assert not (tmp_path / "a.md").exists()
    assert (tmp_path / "b.md").is_file()


def test_main_arquivo_converte_caminho_direto(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arquivo = _criar_arquivo(tmp_path, "selecionado.html")
    monkeypatch.chdir(tmp_path.parent)

    assert main(["--arquivo", str(arquivo)]) == 0
    assert (tmp_path / "selecionado.md").is_file()


def test_main_arquivo_rejeita_extensao_invalida(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arquivo = _criar_arquivo(tmp_path, "selecionado.txt")
    monkeypatch.chdir(tmp_path.parent)

    assert main(["--arquivo", str(arquivo)]) == 1


def test_main_indice_invalido_retorna_1(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _criar_arquivo(tmp_path, "a.html")
    monkeypatch.chdir(tmp_path)

    assert main(["--indice", "5"]) == 1
    assert main(["--indice", "0"]) == 1


def test_main_indice_sem_arquivos_retorna_1(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    assert main(["--indice", "1"]) == 1


def test_main_sem_force_falha_quando_md_existe(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _criar_arquivo(tmp_path, "a.html")
    _criar_arquivo(tmp_path, "a.md", "já existe")
    monkeypatch.chdir(tmp_path)

    assert main(["--indice", "1"]) == 1
    assert (tmp_path / "a.md").read_text(encoding="utf-8") == "já existe"


def test_main_force_sobrescreve(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _criar_arquivo(tmp_path, "a.html")
    _criar_arquivo(tmp_path, "a.md", "já existe")
    monkeypatch.chdir(tmp_path)

    assert main(["--indice", "1", "--force"]) == 0
    assert "Brasília" in (tmp_path / "a.md").read_text(encoding="utf-8")


def test_main_auto_continua_apos_falha(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _criar_arquivo(tmp_path, "ok.html")
    _criar_arquivo(tmp_path, "falha.html")
    _criar_arquivo(tmp_path, "falha.md", "já existe")
    monkeypatch.chdir(tmp_path)

    assert main(["--auto"]) == 1
    assert (tmp_path / "ok.md").is_file()
    assert (tmp_path / "falha.md").read_text(encoding="utf-8") == "já existe"


def test_main_sem_cabecalho_e_html_original(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _criar_arquivo(tmp_path, "a.html")
    monkeypatch.chdir(tmp_path)

    assert main(["--indice", "1", "--sem-cabecalho", "--html-original"]) == 0
    conteudo = (tmp_path / "a.md").read_text(encoding="utf-8")
    assert "title:" not in conteudo
    assert "<details>" in conteudo


def test_main_diretorio_inexistente_retorna_1(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    assert main([str(tmp_path / "nao_existe")]) == 1


def test_main_cancela_com_teclado_retorna_130(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _criar_arquivo(tmp_path, "a.html")
    monkeypatch.chdir(tmp_path)

    def interromper(*args: object, **kwargs: object) -> str:
        raise KeyboardInterrupt

    monkeypatch.setattr(Prompt, "ask", interromper)
    assert main([]) == 130
