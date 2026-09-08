"""Utilitários de normalização de texto compartilhados entre módulos."""

from __future__ import annotations

import re

_ESPACOS_MULTIPLOS = re.compile(r"[ \t]{2,}")

#: Marcadores de payloads de dados que o Google embute no HTML (hovercards,
#: tooltips e informações de interação). Aparecem como texto cru no documento.
MARCADORES_PAYLOAD: tuple[str, ...] = ("TgQPHd", "qkimaf")


def remover_payloads_google(texto: str) -> str:
    """Remove payloads de dados do Google intercalados no texto extraído.

    O Google embute blocos como `TgQPHd|||[...]` e `qkimaf <token>` dentro do
    HTML renderizado; eles não pertencem à conversa e precisam ser descartados.
    Colchetes aninhados são balanceados para remover o payload por completo.
    """
    if not any(marcador in texto for marcador in MARCADORES_PAYLOAD):
        return texto

    partes: list[str] = []
    i = 0
    n = len(texto)
    while i < n:
        ocorrencias = [texto.find(m, i) for m in MARCADORES_PAYLOAD]
        ocorrencias = [pos for pos in ocorrencias if pos != -1]
        if not ocorrencias:
            partes.append(texto[i:])
            break
        pos = min(ocorrencias)
        partes.append(texto[i:pos])

        if texto.startswith("qkimaf", pos):
            # `qkimaf <token>` — pula até o próximo payload ou fim do texto.
            j = pos + len("qkimaf")
            while j < n and not texto.startswith("TgQPHd", j):
                j += 1
            i = j
        else:
            # `TgQPHd<token>|||[JSON balanceado]` — pula o JSON por completo.
            j = texto.find("||", pos)
            if j == -1:
                j = n
            else:
                j += 2
                while j < n and texto[j] == "|":
                    j += 1
                if j < n and texto[j] == "[":
                    profundidade = 0
                    while j < n:
                        if texto[j] == "[":
                            profundidade += 1
                        elif texto[j] == "]":
                            profundidade -= 1
                            if profundidade == 0:
                                j += 1
                                break
                        j += 1
            i = j
    return "".join(partes)


def normalizar_texto(texto: str) -> str:
    """Colapsa espaços e linhas em branco repetidas, preservando blocos de código.

    Linhas dentro de cercas ``` ... ``` são mantidas exatamente como estão,
    evitando que código fonte seja alterado pela limpeza de espaços.
    """
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    linhas_finais: list[str] = []
    em_codigo = False
    linhas_vazias = 0

    for linha in texto.split("\n"):
        if linha.strip().startswith("```"):
            em_codigo = not em_codigo
            linhas_finais.append(linha)
            linhas_vazias = 0
            continue
        if em_codigo:
            linhas_finais.append(linha)
            continue
        if not linha.strip():
            linhas_vazias += 1
            if linhas_vazias > 1:
                continue
        else:
            linhas_vazias = 0
            linha = _ESPACOS_MULTIPLOS.sub(" ", linha)
        linhas_finais.append(linha)

    return "\n".join(linhas_finais).strip()
