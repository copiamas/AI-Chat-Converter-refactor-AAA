"""Testes de leitura e extração do diálogo do HTML."""

from __future__ import annotations

from pathlib import Path

import pytest
from ai_converter_cli.html_parser import extrair_conversa, ler_e_limpar
from bs4 import BeautifulSoup

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURA_REALISTA = FIXTURES / "chat_realista.html"


def test_ler_e_limpar_arquivo_inexistente() -> None:
    with pytest.raises(FileNotFoundError):
        ler_e_limpar(FIXTURES / "nao_existe.html")


def test_ler_e_limpar_arquivo_valido() -> None:
    documento = ler_e_limpar(FIXTURA_REALISTA)
    assert documento.removidos > 0
    assert documento.soup.find("script") is None
    assert documento.soup.find("style") is None
    assert documento.soup.find("button") is None
    assert documento.soup.find("nav") is None
    assert documento.soup.find("header") is None
    assert documento.soup.find("footer") is None


def test_ler_e_limpar_aceita_extensao_htm(tmp_path: Path) -> None:
    arquivo = tmp_path / "conversa.htm"
    arquivo.write_text("<html><body><button>x</button><p>oi</p></body></html>", encoding="utf-8")
    documento = ler_e_limpar(arquivo)
    assert documento.removidos == 1
    assert documento.soup.get_text().strip() == "oi"


def test_extrair_conversa_por_atributos_de_papel() -> None:
    documento = ler_e_limpar(FIXTURA_REALISTA)
    conversa = extrair_conversa(documento.soup)

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA", "usuário", "IA"]
    assert conversa.quantidade_turnos == 4
    assert not conversa.vazio

    usuario_1, ia_1, _, ia_2 = conversa.turnos
    assert "**explique isso:** como funciona o `merge sort` em Python?" in usuario_1.texto
    assert "Ah, sensacional!" in ia_1.texto
    assert "```" in ia_1.texto and "def merge_sort" in ia_1.texto
    assert '[a documentação](https://exemplo.com/merge "docs")' in ia_1.texto
    assert "*O(n log n)*" in ia_2.texto
    assert "- espaço: O(n)" in ia_2.texto
    assert "- estável: sim" in ia_2.texto


def test_extrair_conversa_ignora_interface() -> None:
    documento = ler_e_limpar(FIXTURA_REALISTA)
    conversa = extrair_conversa(documento.soup)
    texto_completo = "\n".join(turno.texto for turno in conversa.turnos)
    for lixo in ("Boa resposta", "Resposta ruim", "Menu", "Privacidade", "var fake", "color: red"):
        assert lixo not in texto_completo


def test_extrair_conversa_fallback_por_marcadores() -> None:
    html = """<html><body>
    <div>
      <p>Copiar</p>
      <p>Boa resposta</p>
      <p>explique isso: o que é pytest?</p>
      <p>Ah, sensacional! pytest automatiza os testes.</p>
      <p>agora essa aqui: como instalo?</p>
      <p>Essa questão lista: pip install pytest.</p>
    </div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA", "usuário", "IA"]
    assert "pytest" in conversa.turnos[0].texto
    assert "pip install pytest" in conversa.turnos[3].texto
    assert "Copiar" not in conversa.turnos[0].texto
    assert "Boa resposta" not in conversa.turnos[1].texto


def test_extrair_conversa_fallback_filtra_texto_longo_de_interface() -> None:
    html = """<html><body>
      <p>explique isso: qual a capital do Brasil?</p>
      <p>A IA pode cometer erros. Por isso, cheque as respostas</p>
      <p>Ah, sensacional! A capital é Brasília.</p>
      <p>Este link público é válido por 7 dias e compartilha uma conversa, incluindo as informações pessoais que você adicionou.</p>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA"]
    assert "Brasília" in conversa.turnos[1].texto
    assert "link público" not in conversa.turnos[1].texto
    assert "cheque as respostas" not in conversa.turnos[1].texto


def test_linhas_nao_classificadas_sao_anexadas_ao_turno() -> None:
    html = """<html><body>
      <p>explique isso: o que é X?</p>
      <p>texto solto anexado ao turno</p>
      <p>Ah, sensacional! resposta oficial.</p>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA"]
    assert "texto solto anexado" in conversa.turnos[0].texto


def test_serializacao_descarta_script_dentro_de_mensagem() -> None:
    html = """<html><body>
      <div data-message-author-role="user"><script>var x = 1</script><p>ok</p></div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert conversa.turnos[0].texto == "ok"
    assert "var x" not in conversa.turnos[0].texto


def test_serializacao_ignora_nos_vazios() -> None:
    html = """<html><body>
      <div data-message-author-role="user">
        <pre>   </pre>
        <blockquote>linha um<br>linha dois</blockquote>
        <p>conteúdo válido</p>
      </div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário"]
    assert "conteúdo válido" in conversa.turnos[0].texto
    assert "> linha um" in conversa.turnos[0].texto
    assert "> linha dois" in conversa.turnos[0].texto


def test_fallback_linha_a_linha_quando_sem_estrutura() -> None:
    html = """<html><body>
      <div>explique isso: teste sem marcação de p</div>
      <div>Ah, sensacional! resposta também sem p.</div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA"]
    assert "teste sem marcação" in conversa.turnos[0].texto


def test_fallback_estruturado_preserva_formatacao() -> None:
    html = """<html><body>
      <div class="conteudo">
        <h2>Título fora do diálogo</h2>
        <p>explique isso: o que é <code>TLS</code>?</p>
        <p>Ah, sensacional! É a camada que <strong>protege</strong> a conexão.</p>
        <ul><li>item um</li><li>item dois</li></ul>
        <p>Detalhe em <a href="https://exemplo.com">exemplo</a>.</p>
        <blockquote><p>citação com p aninhado</p></blockquote>
        <p>Boa resposta</p>
      </div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA"]
    assert "`TLS`" in conversa.turnos[0].texto
    assert "**protege**" in conversa.turnos[1].texto
    assert "- item um" in conversa.turnos[1].texto
    assert "[exemplo](https://exemplo.com)" in conversa.turnos[1].texto
    assert "> citação com p aninhado" in conversa.turnos[1].texto
    assert "Boa resposta" not in conversa.turnos[1].texto
    assert "Título fora do diálogo" not in conversa.turnos[1].texto


def test_extrair_conversa_modo_ia_google(tmp_path: Path) -> None:
    """Página de Pesquisa Google com conversa do Modo IA embutida."""
    documento = ler_e_limpar(FIXTURES / "chat_modo_ia_google.html")
    conversa = extrair_conversa(documento.soup)

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA", "usuário", "IA"]
    assert "resuma esse video em detalhes" in conversa.turnos[0].texto
    assert "**análise detalhada**" in conversa.turnos[1].texto
    assert "### Mistérios da Cidade" in conversa.turnos[1].texto
    assert "- Cidade Cenográfica" in conversa.turnos[1].texto
    assert "construtos podem ser permanentes" in conversa.turnos[2].texto
    assert "**não são permanentes**" in conversa.turnos[3].texto


def test_extrair_conversa_modo_ia_google_remove_payloads(tmp_path: Path) -> None:
    documento = ler_e_limpar(FIXTURES / "chat_modo_ia_google.html")
    conversa = extrair_conversa(documento.soup)
    texto = "\n".join(turno.texto for turno in conversa.turnos)

    assert "TgQPHd" not in texto
    assert "qkimaf" not in texto
    assert "Mostrar menos" not in texto
    assert "Mostrar tudo" not in texto
    assert "Compartilhar link público" not in texto
    assert "Boa resposta" not in texto


def test_remover_payloads_google_direto() -> None:
    from ai_converter_cli.textutils import remover_payloads_google

    assert (
        remover_payloads_google("TgQPHd|||[]O vídeo traz uma análise") == "O vídeo traz uma análise"
    )
    assert remover_payloads_google("texto normal") == "texto normal"
    assert remover_payloads_google('TgQPHd|||[[3,4],"LEhvAe",false]fim') == "fim"
    assert remover_payloads_google("a|[]b") == "a|[]b"
    assert remover_payloads_google("qkimaf token") == ""
    assert remover_payloads_google("TgQPHd sem separador") == ""
    assert remover_payloads_google("TgQPHd|||[{&quot;s&quot;:false}](pós)") == "(pós)"


def test_extrair_conversa_modo_ia_google_sem_blocos_ckgc1d_cai_no_fallback() -> None:
    """Página de pesquisa sem o container CKgc1d usa os caminhos normais."""
    html = "<html><body><div class='WzWwpc'><p>explique isso: teste</p><p>Ah, sensacional! resposta</p></div></body></html>"
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))
    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA"]


def test_extrair_conversa_modo_ia_google_com_ckgc1d_mas_sem_ia_retorna_vazio() -> None:
    """Blocos CKgc1d presentes, mas nenhuma resposta de IA: vira conversa vazia."""
    html = """<html><body>
      <div class="WzWwpc vve6Ce CZntF">
        <div class="CKgc1d"><div class="sUKAcb">pergunta sem resposta</div></div>
      </div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))
    assert conversa.vazio


def test_extrair_conversa_sem_dialogo_retorna_vazio() -> None:
    conversa = extrair_conversa(
        BeautifulSoup("<html><body><p>só texto solto</p></body></html>", "html.parser")
    )
    assert conversa.vazio
    assert conversa.quantidade_turnos == 0


def test_extrair_conversa_deduplica_divs_aninhadas() -> None:
    html = """<html><body>
      <div data-message-author-role="user">
        <div class="wrapper"><p>pergunta aninhada</p></div>
      </div>
      <div data-message-author-role="assistant"><p>resposta</p></div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA"]
    assert "pergunta aninhada" in conversa.turnos[0].texto


def test_extrair_conversa_ignora_mensagem_vazia() -> None:
    html = """<html><body>
      <div data-message-author-role="user"></div>
      <div data-message-author-role="assistant"><p>resposta</p></div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["IA"]
    assert conversa.turnos[0].texto == "resposta"


def test_deteccao_de_papeis_variados() -> None:
    html = """<html><body>
      <div class="user-message"><p>pergunta A</p></div>
      <div data-message-author-role="model"><p>resposta A</p></div>
      <div class="assistant-message"><p>resposta B</p></div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA", "IA"]
    assert "pergunta A" in conversa.turnos[0].texto
    assert "resposta B" in conversa.turnos[2].texto


def test_serializacao_rica_de_elementos() -> None:
    html = """<html><body>
      <div data-message-author-role="user">
        <h2>Pergunta</h2>
        <p>Texto com <strong>negrito</strong>, <em>itálico</em>, quebra<br>de linha
        e <code>cod</code>.</p>
        <blockquote>Uma citação importante</blockquote>
      </div>
      <div data-message-author-role="assistant">
        <ol>
          <li>primeiro</li>
          <li>segundo</li>
        </ol>
        <p><a>link sem href</a></p>
        <pre></pre>
      </div>
    </body></html>"""
    conversa = extrair_conversa(BeautifulSoup(html, "html.parser"))

    assert [turno.autor for turno in conversa.turnos] == ["usuário", "IA"]
    usuario = conversa.turnos[0].texto
    assert "## Pergunta" in usuario
    assert "**negrito**" in usuario
    assert "*itálico*" in usuario
    assert "`cod`" in usuario
    assert "> Uma citação importante" in usuario
    ia = conversa.turnos[1].texto
    assert "1. primeiro" in ia
    assert "1. segundo" in ia
    assert "link sem href" in ia
