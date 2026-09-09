# Design: leitor local de páginas salvas

Status: validado em brainstorming

## Entendimento

- O produto importa páginas salvas pelo navegador com `Ctrl+S`.
- O foco inicial são conversas de IA, com suporte futuro a outros tipos de página.
- A entrada principal é um arquivo `.html`, selecionado ou arrastado para o app.
- O app procura a pasta de recursos associada para preservar imagens e estilos.
- A tela principal mostra o conteúdo extraído; a página original fica disponível em uma segunda visualização.
- O sistema extrai texto, links, imagens, tabelas, código, autores, datas, títulos e outros metadados.
- A primeira versão processa um arquivo por vez, preparando a arquitetura para uma biblioteca futura organizada por pastas.

## Objetivo

Transformar uma página salva em um documento local compreensível, pesquisável e exportável, mantendo uma referência visual da página original quando os recursos estiverem disponíveis.

## Fora do escopo inicial

- Edição manual do conteúdo extraído.
- Biblioteca completa de documentos.
- Observação automática de uma pasta.
- Sincronização, contas ou processamento em servidor.
- Reconstrução da página original quando a pasta de recursos estiver incompleta.

## Experiência principal

O fluxo será:

```text
.html + recursos → importação → diagnóstico → extração → leitura/busca → Markdown
```

A entrada terá uma área de arrastar e soltar e um seletor de arquivos. Após a importação, o app exibirá o nome da fonte, o tipo detectado e o estado dos recursos. O workspace terá uma navegação lateral com título, origem, data, tipo e informações detectadas. A área principal terá as abas **Conteúdo extraído** e **Página original**.

O conteúdo extraído será a visão padrão. Ele organizará mensagens, texto, links, imagens, tabelas, código e metadados com tratamentos visuais próprios. A busca ficará disponível no topo e mostrará ocorrências com o tipo da informação encontrada. A página original será aberta sob demanda, em uma visualização isolada.

## Direção visual

O frontend usará uma estética de arquivo inteligente: fundo escuro refinado, superfícies bem separadas, tipografia legível, espaçamento generoso, ícones discretos e estados vazios claros. O visual neon existente será refinado para reduzir ruído e dar prioridade ao conteúdo importado.

O design será desktop-first, responsivo e preparado para o futuro painel de pastas.

## Arquitetura

### Importador local

Recebe o `.html` pelo seletor ou arrastar e soltar. A partir do caminho, procura a pasta de recursos associada e registra recursos encontrados e referências quebradas. A fonte original nunca é sobrescrita.

### Documento intermediário

O HTML será convertido para um modelo independente da apresentação original, com campos para título, origem, data, texto, turnos, links, imagens, tabelas, código, recursos locais e diagnósticos. O extrator atual de conversas será o primeiro adaptador.

### Workspace

O workspace consome o documento intermediário e fornece leitura semântica, busca, visualização original e diagnósticos. A tela principal não dependerá diretamente do HTML bruto.

### Exportador

Gera Markdown a partir do documento intermediário, com metadados e referências locais. No futuro poderá gerar um pacote contendo o Markdown e seus recursos.

## Estados e erros

- **Pronto**: conteúdo e recursos encontrados.
- **Parcial**: conteúdo extraído, mas há recursos visuais ausentes.
- **Revisão necessária**: baixa confiança na identificação de blocos ou papéis.
- **Falha**: arquivo vazio, inválido, grande demais ou ilegível.

HTML malformado será recuperado quando possível, com diagnóstico visível. A ausência de recursos não impede a leitura textual, mas a aba original informará que a fidelidade visual pode ser parcial. O Markdown será salvo em destino escolhido pelo usuário, com proteção contra sobrescrita.

## Requisitos não funcionais

- Processamento local, sem servidor, conta ou sincronização.
- Limite inicial de 20 MB para o HTML.
- Operações demoradas fora do ciclo principal da interface.
- Processamento individual na primeira versão.
- Índice local e biblioteca por pastas apenas em uma etapa futura.

## Testes

Serão cobertos limpeza, extração, classificação, Markdown, importação com recursos, fixtures anonimizadas e estados visuais. Também serão testados arquivos sem recursos, nomes com acentos, caminhos longos, scripts, tabelas grandes, imagens quebradas e conversas com baixa confiança.

## Decision log

| Decisão | Alternativas | Motivo |
| --- | --- | --- |
| Começar com um conversor local de duas visualizações | Biblioteca imediata; pipeline extensível completo | Entrega valor rápido e aproveita o projeto existente |
| Conteúdo extraído é a tela principal | Página original como tela principal | Leitura, busca e exportação são os objetivos centrais |
| Página original fica sob demanda | Mostrar as duas simultaneamente | Mantém o foco sem perder a conferência visual |
| Usar modelo intermediário | Componentes consumindo HTML diretamente | Permite novos extratores sem reescrever o workspace |
| Suportar `.html` e pasta associada | Aceitar apenas `.html`; aceitar ZIP | Preserva recursos sem ampliar o escopo inicial |
| Sem edição manual na primeira versão | Editor completo integrado | Reduz escopo e mantém o foco em extração confiável |
| Biblioteca futura organizada por pastas | Banco local imediato; monitoramento automático | Adia complexidade sem bloquear a evolução |
| Recuperação parcial com diagnósticos | Falha total em qualquer problema | Preserva o conteúdo útil e torna as limitações claras |
| Processamento local | Backend remoto ou sincronização | Privacidade dos chats e menor custo operacional |

## Próximo passo

Transformar este design em um plano de implementação incremental, começando pelo modelo intermediário, importação do `.html` com recursos associados e o novo workspace visual.
