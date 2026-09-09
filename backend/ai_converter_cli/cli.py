"""Interface de linha de comando do AI Converter CLI."""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.prompt import Prompt
from rich.table import Table

from .converter import converter_arquivo
from .models import SUFIXOS_HTML, OpcoesConversao, ResultadoConversao

# Force UTF-8 console on Windows to avoid encoding issues with emojis
if sys.platform == "win32":
    import os
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    # Use a console that supports UTF-8
    console = Console(force_terminal=True, legacy_windows=False)
else:
    console = Console()


def exibir_banner(console_ativo: Console | None = None) -> None:
    """Desenha a tela de abertura do programa."""
    alvo = console_ativo or console
    alvo.clear()
    # Use text-based banner without emojis to avoid Windows encoding issues
    banner = (
        "[bold cyan]AI CHAT CONVERTER CLI[/bold cyan]\n"
        "[dim]Transforme paginas HTML salvas do Google Modo IA / ChatGPT em Markdown limpo[/dim]"
    )
    alvo.print(Panel(banner, border_style="cyan", expand=False))


def listar_arquivos_html(diretorio: Path) -> list[Path]:
    """Lista arquivos HTML do diretório, ordenados por nome."""
    return sorted(
        caminho
        for caminho in diretorio.iterdir()
        if caminho.is_file() and caminho.suffix.lower() in SUFIXOS_HTML
    )


def _tabela_arquivos(arquivos: Sequence[Path]) -> Table:
    """Tabela rich com os arquivos disponíveis para seleção."""
    tabela = Table(title="Arquivos HTML Disponíveis", title_style="bold magenta", box=None)
    tabela.add_column("ID", justify="center", style="cyan", no_wrap=True)
    tabela.add_column("Nome do Arquivo", style="green")
    for indice, arquivo in enumerate(arquivos, start=1):
        tabela.add_row(str(indice), arquivo.name)
    return tabela


def _validar_escolha(entrada: str, quantidade: int) -> int:
    """Converte a entrada do usuário em índice válido (0-based)."""
    if not entrada.strip().isdigit():
        raise ValueError("Digite apenas números.")
    indice = int(entrada) - 1
    if not 0 <= indice < quantidade:
        raise IndexError(f"ID inválido: {entrada}")
    return indice


class _ProvedorEntrada(Protocol):
    """Contrato de entrada do usuário (compatível com `Prompt.ask`)."""

    def __call__(self, prompt: str, *, default: str = "") -> str: ...


def _escolher_arquivo(
    arquivos: Sequence[Path],
    obter_entrada: _ProvedorEntrada | None = None,
) -> Path:
    """Apresenta a lista de arquivos e devolve o arquivo escolhido pelo usuário."""
    provedor = obter_entrada or Prompt.ask
    console.print(_tabela_arquivos(arquivos))
    console.print("\n")
    while True:
        entrada = provedor("[bold yellow]Selecione o ID do arquivo[/bold yellow]", default="1")
        try:
            return arquivos[_validar_escolha(entrada, len(arquivos))]
        except (ValueError, IndexError) as erro:
            console.print(f"[bold red]{erro}[/bold red]")


def _processar(arquivo: Path, opcoes: OpcoesConversao) -> ResultadoConversao:
    """Processa um arquivo exibindo indicador de progresso."""
    with Progress(
        SpinnerColumn(spinner_name="dots"),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
        console=console,
    ) as progress:
        progress.add_task(
            description=f"Processando fluxo de texto e reconstruindo diálogos de {arquivo.name}...",
            total=None,
        )
        return converter_arquivo(arquivo, opcoes)


def _exibir_resultado(resultado: ResultadoConversao) -> None:
    """Exibe o resumo do processamento na interface."""
    console.print(f"\n[bold green][OK] Sucesso![/bold green] {resultado.resumo}")
    if resultado.conversa.vazio:
        console.print(
            "[yellow]⚠ Nenhum bloco de diálogo foi detectado — "
            "o arquivo contém apenas o cabeçalho.[/yellow]"
        )
    console.print(f"👉 [bold white]{resultado.destino}[/bold white]\n")


def _formatar_erro(erro: Exception) -> str:
    """Formata exceções conhecidas em mensagens amigáveis."""
    if isinstance(erro, FileNotFoundError):
        return f"Arquivo não encontrado: {erro.filename or erro}"
    if isinstance(erro, FileExistsError):
        return str(erro)
    if isinstance(erro, PermissionError):
        return "Sem permissão de escrita no diretório de destino."
    return str(erro)


def _configurar_parse_args() -> argparse.ArgumentParser:
    """Parser de argumentos da linha de comando."""
    parser = argparse.ArgumentParser(
        prog="ai-converter",
        description=(
            "Converte páginas HTML de conversas com IA "
            "(Google Modo IA / ChatGPT) em Markdown limpo."
        ),
    )
    parser.add_argument(
        "diretorio",
        nargs="?",
        type=Path,
        default=None,
        help="Diretório com os arquivos .html (padrão: diretório atual)",
    )
    parser.add_argument(
        "-i",
        "--indice",
        type=int,
        default=None,
        help="ID do arquivo a processar (sem interação)",
    )
    parser.add_argument(
        "-a",
        "--auto",
        action="store_true",
        help="Processa todos os arquivos sem perguntar",
    )
    parser.add_argument(
        "-f",
        "--force",
        action="store_true",
        help="Sobrescreve arquivos .md existentes",
    )
    parser.add_argument(
        "-s",
        "--sem-cabecalho",
        action="store_true",
        help="Não gera o cabeçalho YAML (front matter)",
    )
    parser.add_argument(
        "--html-original",
        action="store_true",
        help="Embute o HTML limpo no arquivo .md final",
    )
    parser.add_argument(
        "--plataforma",
        default="Google Modo IA / Search",
        help="Plataforma registrada no cabeçalho YAML",
    )
    parser.add_argument(
        "--titulo",
        default="Conversa Exportada via AI Converter CLI",
        help="Título registrado no cabeçalho YAML",
    )
    parser.add_argument(
        "--arquivo",
        type=Path,
        default=None,
        help="Caminho direto para um arquivo .html ou .htm",
    )
    return parser


def _mensagem_sem_arquivos() -> str:
    """Mensagem exibida quando nenhum arquivo HTML é encontrado."""
    return "[bold red]❌ Erro:[/bold red] Nenhum arquivo `.html` encontrado no diretório atual."


def _executar_modo_interativo(diretorio: Path, opcoes: OpcoesConversao) -> int:
    """Fluxo original: lista arquivos e pergunta qual processar."""
    arquivos = listar_arquivos_html(diretorio)
    if not arquivos:
        console.print(_mensagem_sem_arquivos())
        return 1
    arquivo = _escolher_arquivo(arquivos)
    _exibir_resultado(_processar(arquivo, opcoes))
    return 0


def _executar_modo_automatico(arquivos: Sequence[Path], opcoes: OpcoesConversao) -> int:
    """Processa uma lista de arquivos sem interação; 1 se houver alguma falha."""
    falhas = 0
    for arquivo in arquivos:
        try:
            resultado = _processar(arquivo, opcoes)
            console.print(f"[green][OK][/green] {resultado.resumo}")
        except OSError as erro:
            falhas += 1
            console.print(f"[red]✘[/red] {arquivo.name}: {_formatar_erro(erro)}")
    return 1 if falhas else 0


def _executar(argumentos: argparse.Namespace) -> int:
    """Roteia a execução conforme os argumentos informados."""
    diretorio = argumentos.diretorio or Path.cwd()
    opcoes = OpcoesConversao(
        diretorio=diretorio,
        gerar_cabecalho=not argumentos.sem_cabecalho,
        sobreescrever=argumentos.force,
        html_original=argumentos.html_original,
        plataforma=argumentos.plataforma,
        titulo=argumentos.titulo,
    )
    if argumentos.arquivo is not None:
        arquivo = argumentos.arquivo.expanduser()
        if arquivo.suffix.lower() not in SUFIXOS_HTML:
            console.print("[bold red]❌ Erro:[/bold red] O arquivo deve ter extensão .html ou .htm.")
            return 1
        if not arquivo.is_file():
            console.print(f"[bold red]❌ Erro:[/bold red] Arquivo não encontrado: {arquivo}")
            return 1
        opcoes = replace(opcoes, diretorio=arquivo.parent)
        try:
            _exibir_resultado(_processar(arquivo, opcoes))
            return 0
        except OSError as erro:
            console.print(f"[bold red]❌ Erro:[/bold red] {_formatar_erro(erro)}")
            return 1
    if argumentos.auto:
        arquivos = listar_arquivos_html(diretorio)
        if not arquivos:
            console.print(_mensagem_sem_arquivos())
            return 1
        return _executar_modo_automatico(arquivos, opcoes)
    if argumentos.indice is not None:
        arquivos = listar_arquivos_html(diretorio)
        if not arquivos:
            console.print(_mensagem_sem_arquivos())
            return 1
        try:
            arquivo = arquivos[_validar_escolha(str(argumentos.indice), len(arquivos))]
        except (ValueError, IndexError) as erro:
            console.print(f"[bold red]{erro}[/bold red]")
            return 1
        return _executar_modo_automatico([arquivo], opcoes)
    return _executar_modo_interativo(diretorio, opcoes)


def main(argv: Sequence[str] | None = None) -> int:
    """Ponto de entrada do programa; devolve o código de saída do processo."""
    exibir_banner()
    argumentos = _configurar_parse_args().parse_args(argv)
    try:
        return _executar(argumentos)
    except KeyboardInterrupt:
        console.print("\n[dim]Operação cancelada pelo usuário.[/dim]")
        return 130
    except OSError as erro:
        console.print(f"[bold red]❌ Erro:[/bold red] {_formatar_erro(erro)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
