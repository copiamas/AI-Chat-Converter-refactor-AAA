"""Leitura, limpeza e extração do diálogo de um documento HTML."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, NavigableString, Tag

from .cleaner import limpar_botoes_e_lixo
from .models import Autor, Conversa, Turno
from .textutils import normalizar_texto, remover_payloads_google

#: Marcadores textuais que iniciam uma pergunta do usuário (caminho fallback).
GATILHOS_USUARIO: tuple[str, ...] = (
    "explique isso:",
    "agora essa aqui:",
    "contexto da pergunta:",
)

#: Marcadores textuais que iniciam uma resposta da IA (caminho fallback).
GATILHOS_IA: tuple[str, ...] = (
    "Essa questão lista",
    "Aqui está o compilado",
    "Ah, sensacional!",
    "Para esse cenário de",
)

#: Textos de interface que nunca devem entrar no diálogo (caminho fallback).
TEXTOS_DE_INTERFACE: tuple[str, ...] = (
    "Copiado",
    "Copiar",
    "Editar",
    "Compartilhar link público",
    "Boa resposta",
    "Resposta ruim",
    "Mais",
    "Sobre esta resposta",
    "Economizou tempo",
    "Limpar",
    "Útil",
    "Abrangente",
    "Outro",
    "Incorreto",
    "Inadequado",
    "Não funciona direito",
    "Não",
    "Uma cópia desta conversa será incluída.",
    "Enviar",
    "Agradecemos a informação",
    "Facebook",
    "Gmail",
    "X",
    "Reddit",
    "WhatsApp",
    "A IA pode cometer erros. Por isso, cheque as respostas",
    "Este link público é válido por 7 dias e compartilha uma conversa, "
    "incluindo as informações pessoais que você adicionou.",
)

#: Elementos HTML tratados como blocos (ganham quebras de linha ao redor).
BLOCOS_HTML: frozenset[str] = frozenset(
    {
        "p",
        "div",
        "ul",
        "ol",
        "pre",
        "blockquote",
        "table",
        "tr",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "section",
        "article",
    }
)


@dataclass(frozen=True)
class DocumentoHTML:
    """HTML já limpo estruturalmente, pronto para extração."""

    soup: BeautifulSoup
    removidos: int


def ler_e_limpar(caminho: Path) -> DocumentoHTML:
    """Lê um arquivo HTML e remove elementos de interface.

    Raises:
        FileNotFoundError: se o arquivo não existir.
        OSError: se o arquivo não puder ser lido.
    """
    if not caminho.is_file():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho}")
    soup = BeautifulSoup(caminho.read_text(encoding="utf-8"), "html.parser")
    removidos = limpar_botoes_e_lixo(soup)
    return DocumentoHTML(soup=soup, removidos=removidos)


def extrair_conversa(soup: BeautifulSoup) -> Conversa:
    """Localiza os blocos de pergunta/resposta e os organiza em turnos ordenados.

    O documento é varrido em ordem; blocos sem autor detectado são anexados ao
    turno em andamento, preservando a alternância original usuário → IA.
    """
    conversa_modo_ia = _extrair_conversa_modo_ia_google(soup)
    if conversa_modo_ia is not None:
        return conversa_modo_ia

    turnos: list[Turno] = []
    autor_atual: Autor | None = None
    linhas_atual: list[str] = []

    for elemento, autor in _blocos_candidatos(soup):
        if autor is None:
            if linhas_atual:
                linhas_atual.append(_serializar_linha(elemento))
            continue
        _finalizar_turno(turnos, autor_atual, linhas_atual)
        autor_atual = autor
        linhas_atual = [_serializar_linha(elemento)]
    _finalizar_turno(turnos, autor_atual, linhas_atual)

    return Conversa(turnos=tuple(turnos))


def _extrair_conversa_modo_ia_google(soup: BeautifulSoup) -> Conversa | None:
    """Extrai conversas do Modo IA do Google embutidas na página de pesquisa.

    Estrutura reconhecida: perguntas do usuário em `div.sUKAcb` e respostas da
    IA em `div.mZJni`, dentro de blocos `div.CKgc1d`. Retorna None quando a
    página não tem essa estrutura (deixando os outros caminhos de extração
    tentarem).
    """
    container = soup.select_one("div.WzWwpc.vve6Ce.CZntF") or soup
    if not container.select_one("div.CKgc1d"):
        return None

    turnos: list[Turno] = []
    for elemento in container.find_all(True):
        classes = elemento.get("class") or []
        if "sUKAcb" in classes:
            texto = normalizar_texto(remover_payloads_google(elemento.get_text(" ", strip=True)))
            if texto:
                turnos.append(Turno(autor="usuário", texto=texto))
        elif "mZJni" in classes:
            texto = normalizar_texto(remover_payloads_google(_serializar_no(elemento)))
            texto = _filtrar_linhas_de_interface(texto)
            if texto:
                turnos.append(Turno(autor="IA", texto=texto))

    if not any(turno.autor == "IA" for turno in turnos):
        return None
    return Conversa(turnos=tuple(turnos))


def _filtrar_linhas_de_interface(texto: str) -> str:
    """Remove linhas de texto que pertencem apenas à interface da plataforma."""
    linhas = [linha for linha in texto.split("\n") if not _eh_texto_de_interface(linha.strip())]
    return "\n".join(linhas).strip()


def _blocos_candidatos(soup: BeautifulSoup) -> list[tuple[Tag, Autor | None]]:
    """Blocos de diálogo em ordem de documento, com o autor detectado (ou None)."""
    blocos: list[tuple[Tag, Autor | None]] = []
    for div in soup.find_all("div"):
        # Ignora divs aninhadas dentro de uma mensagem já classificada.
        if any(div in bloco[0].descendants for bloco in blocos):
            continue
        autor = _autor_por_atributo(div)
        if autor is not None:
            blocos.append((div, autor))
    if not blocos:
        return _blocos_fallback(soup)
    return blocos


def _autor_por_atributo(elemento: Tag) -> Autor | None:
    """Detecta o autor do turno pelos atributos típicos das plataformas."""
    papel = _atributo(elemento, "data-message-author-role").lower()
    if papel in {"user", "human", "usuario", "usuário"}:
        return "usuário"
    if papel in {"assistant", "ai", "model", "bot"}:
        return "IA"
    classes = " ".join(_atributo(elemento, "class").split())
    if any(
        marca in classes for marca in ("user-message", "human-message", "user-turn", "user-query")
    ):
        return "usuário"
    if any(
        marca in classes
        for marca in ("assistant-message", "ai-message", "model-message", "gemini-message")
    ):
        return "IA"
    return None


def _blocos_fallback(soup: BeautifulSoup) -> list[tuple[Tag, Autor | None]]:
    """Segmenta o documento quando não há marcação de autor no HTML.

    Primeiro tenta blocos estruturados (`p`, `ul`, `pre`, `blockquote` etc.),
    serializados com a formatação rica; se nada for classificável, cai para
    segmentação linha a linha do texto puro.
    """
    blocos: list[tuple[Tag, Autor | None]] = []
    for bloco in _blocos_estruturados(soup):
        texto = _serializar_no(bloco)
        if not texto or _eh_texto_de_interface(texto):
            continue
        blocos.append((bloco, _classificar_linha(texto)))
    if any(autor is not None for _, autor in blocos):
        return blocos
    return _linhas_fallback(soup)


def _blocos_estruturados(soup: BeautifulSoup) -> list[Tag]:
    """Blocos de conteúdo em ordem de documento, ignorando aninhamentos."""
    selecionados: list[Tag] = []
    nomes = ("p", "ul", "ol", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6")
    for bloco in soup.find_all(nomes):
        if any(bloco in outro.descendants for outro in selecionados):
            continue
        selecionados.append(bloco)
    return selecionados


def _linhas_fallback(soup: BeautifulSoup) -> list[tuple[Tag, Autor | None]]:
    """Segmenta o texto puro linha a linha quando não há estrutura útil."""
    linhas = [linha.strip() for linha in soup.get_text("\n").split("\n") if linha.strip()]
    return [
        (_sintetizar(soup, linha), _classificar_linha(linha))
        for linha in linhas
        if not _eh_texto_de_interface(linha)
    ]


def _sintetizar(soup: BeautifulSoup, texto: str) -> Tag:
    """Cria um elemento artificial para carregar uma linha de texto puro."""
    tag = soup.new_tag("div")
    tag.append(NavigableString(texto))
    return tag


def _classificar_linha(linha: str) -> Autor | None:
    """Classifica uma linha pelos marcadores textuais de diálogo."""
    if any(gatilho in linha.lower() for gatilho in GATILHOS_USUARIO):
        return "usuário"
    if any(linha.startswith(gatilho) for gatilho in GATILHOS_IA):
        return "IA"
    return None


def _eh_texto_de_interface(linha: str) -> bool:
    """Verdadeiro quando a linha pertence apenas à interface da plataforma."""
    return (
        linha in TEXTOS_DE_INTERFACE
        or "O Google pode usar os dados" in linha
        or "solicitação de remoção judicial" in linha
    )


def _atributo(elemento: Tag, nome: str) -> str:
    """Lê um atributo garantindo retorno textual (vazio quando ausente).

    O BeautifulSoup devolve `class` como lista de strings; aqui listas são
    achatadas para permitir a busca por nomes de classe.
    """
    valor = elemento.get(nome)
    if isinstance(valor, list):
        return " ".join(item for item in valor if isinstance(item, str))
    return valor if isinstance(valor, str) else ""


def _finalizar_turno(turnos: list[Turno], autor: Autor | None, linhas: list[str]) -> None:
    """Fecha o turno em andamento, se houver conteúdo relevante."""
    if autor is None or not linhas:
        return
    texto = normalizar_texto("\n".join(linhas))
    if texto:
        turnos.append(Turno(autor=autor, texto=texto))


def _serializar_linha(elemento: Tag) -> str:
    """Serializa uma linha do diálogo em texto plano, sem cabeçalho de autor."""
    return normalizar_texto(remover_payloads_google(_serializar_no(elemento)))


def _serializar_no(no: Any) -> str:
    """Serializa recursivamente um nó do diálogo em texto (com sintaxe Markdown)."""
    if isinstance(no, NavigableString):
        # Guarda defensiva: strings são tratadas inline nos blocos; nunca chegam aqui.
        return str(no) if no.strip() else ""  # pragma: no cover
    if not isinstance(no, Tag):
        # Guarda defensiva: a recursão só entrega Tags ou strings.
        return ""  # pragma: no cover
    nome = no.name
    if nome in {"script", "style", "button"}:
        return ""
    if nome == "br":
        return "\n"
    classes = no.get("class") or []
    if "otQkpb" in classes:
        # Subtítulos de seção dentro das respostas do Modo IA do Google.
        return f"### {no.get_text(' ', strip=True)}"
    if nome in {"strong", "b"}:
        return f"**{no.get_text(' ', strip=True)}**"
    if nome in {"em", "i"}:
        return f"*{no.get_text(' ', strip=True)}*"
    if nome == "code":
        return f"`{no.get_text(' ', strip=True)}`"
    if nome == "pre":
        codigo = no.get_text()
        return f"```\n{codigo}\n```" if codigo.strip() else ""
    if nome == "a":
        return _link_markdown(no)
    if nome in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        return f"{'#' * int(nome[1])} {no.get_text(' ', strip=True)}"
    if nome == "ul":
        return _lista_markdown(no, ordenada=False)
    if nome == "ol":
        return _lista_markdown(no, ordenada=True)
    if nome == "blockquote":
        partes_citacao: list[str] = []
        for filho in no.children:
            if isinstance(filho, NavigableString):
                if filho.strip():
                    partes_citacao.append(str(filho).replace("\n", " "))
            elif isinstance(filho, Tag):
                partes_citacao.append(_serializar_no(filho))
        citacao = "".join(partes_citacao)
        return "\n".join(f"> {linha}" for linha in citacao.split("\n") if linha.strip())

    # Elementos de bloco: processa os filhos preservando quebras entre blocos.
    # Newlines dentro do texto são colapsados em espaço (como o navegador faz);
    # quebras reais vêm apenas de <br> ou de blocos aninhados.
    partes: list[str] = []
    for filho in no.children:
        if isinstance(filho, NavigableString):
            if filho.strip():
                partes.append(str(filho).replace("\n", " "))
        elif isinstance(filho, Tag):
            sub = _serializar_no(filho)
            if sub:
                if filho.name in BLOCOS_HTML or filho.name == "br":
                    partes.append(f"\n{sub}\n")
                else:
                    partes.append(sub)
    return "".join(partes)


def _lista_markdown(lista: Tag, ordenada: bool) -> str:
    """Converte uma lista <ul>/<ol> em itens Markdown."""
    marcador = "1." if ordenada else "-"
    itens = [li for li in lista.find_all("li", recursive=False) if li.get_text(strip=True)]
    return "\n".join(f"{marcador} {_serializar_no(li)}" for li in itens)


def _link_markdown(link: Tag) -> str:
    """Converte um link <a> em sintaxe Markdown, preservando href e título.

    Links de redirecionamento do Google (timestamps de vídeo, rastreamento)
    são lixo de interface: mantém-se o texto visível sem a URL gigante.
    """
    href = _atributo(link, "href")
    texto = link.get_text(" ", strip=True) or href
    if not href or "google.com/goto" in href:
        return texto
    titulo = _atributo(link, "title")
    sufixo = f' "{titulo}"' if titulo else ""
    return f"[{texto}]({href}{sufixo})"
