"""Modelos de domínio: turnos da conversa, opções e resultados de conversão."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

#: Autores possíveis de um turno de diálogo.
Autor = Literal["usuário", "IA"]

#: Sufixos reconhecidos como arquivos HTML (comparação case-insensitive).
SUFIXOS_HTML: tuple[str, ...] = (".html", ".htm")

#: Extensão padrão dos arquivos gerados.
SUFIXO_MARKDOWN = ".md"


@dataclass(frozen=True)
class Turno:
    """Um bloco de diálogo: texto de um autor, na ordem em que aparece no documento."""

    autor: Autor
    texto: str


@dataclass(frozen=True)
class Conversa:
    """Diálogo completo extraído de um documento HTML."""

    turnos: tuple[Turno, ...] = ()

    @property
    def vazio(self) -> bool:
        """Verdadeiro quando nenhum turno foi detectado."""
        return not self.turnos

    @property
    def quantidade_turnos(self) -> int:
        """Número de blocos de diálogo extraídos."""
        return len(self.turnos)


@dataclass(frozen=True)
class OpcoesConversao:
    """Parâmetros que controlam a conversão de um arquivo."""

    diretorio: Path
    gerar_cabecalho: bool = True
    sobreescrever: bool = False
    html_original: bool = False
    plataforma: str = "Google Modo IA / Search"
    titulo: str = "Conversa Exportada via AI Converter CLI"

    @property
    def caminho_saida(self) -> Path:
        """Diretório onde os arquivos Markdown são gravados."""
        return self.diretorio


@dataclass(frozen=True)
class ResultadoConversao:
    """Resultado do processamento de um único arquivo."""

    origem: Path
    destino: Path
    conversa: Conversa
    removidos: int = 0

    @property
    def resumo(self) -> str:
        """Resumo de uma linha para exibição na interface."""
        turnos = self.conversa.quantidade_turnos
        removidos = self.removidos
        plural_turnos = "s" if turnos != 1 else ""
        plural_removidos = "s" if removidos != 1 else ""
        return (
            f"{self.destino.name} — {turnos} bloco{plural_turnos} de diálogo, "
            f"{removidos} elemento{plural_removidos} removidos"
        )
