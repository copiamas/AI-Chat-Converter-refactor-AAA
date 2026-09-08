"""Montagem do documento Markdown final a partir da conversa extraída."""

from __future__ import annotations

from datetime import datetime

from .models import Conversa, OpcoesConversao, Turno

#: Separador entre blocos de diálogo no documento final.
SEPARADOR_BLOCOS = "\n---\n"

#: Cabeçalho exibido para cada autor de turno.
CABECALHOS_AUTOR: dict[str, str] = {
    "usuário": "### 👤 Usuário",
    "IA": "### 🤖 IA",
}


def construir_markdown(
    conversa: Conversa,
    opcoes: OpcoesConversao,
    agora: datetime | None = None,
) -> str:
    """Monta o documento Markdown completo (cabeçalho + blocos de diálogo).

    `agora` permite injetar data/hora em testes; por padrão usa o momento da
    execução.
    """
    partes: list[str] = []
    if opcoes.gerar_cabecalho:
        partes.append(_cabecalho(opcoes, agora or datetime.now()))
    partes.extend(_bloco_dialogo(turno) for turno in conversa.turnos)
    if not partes:
        return ""
    return SEPARADOR_BLOCOS.join(partes).strip() + "\n"


def _cabecalho(opcoes: OpcoesConversao, agora: datetime) -> str:
    """Cabeçalho YAML (front matter) com data e hora da exportação."""
    data = agora.strftime("%d/%m/%Y")
    hora = agora.strftime("%H:%M:%S")
    return (
        "---\n"
        f'title: "{opcoes.titulo}"\n'
        f"date: {data}\n"
        f"time: {hora}\n"
        f'platform: "{opcoes.plataforma}"\n'
        "---\n\n"
        "# 📝 Histórico de Conversa\n"
        f"> **Data da Exportação:** {data} às {hora}\n"
    )


def _bloco_dialogo(turno: Turno) -> str:
    """Formata um turno com o cabeçalho do autor."""
    cabecalho = CABECALHOS_AUTOR.get(turno.autor, "### 💬 Diálogo")
    return f"{cabecalho}:\n\n{turno.texto}"
