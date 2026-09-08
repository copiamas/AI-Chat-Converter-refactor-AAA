# AI Chat Converter

Aplicativo desktop para converter páginas HTML salvas de chats de IA em Markdown legível. A interface React/Electron usa o motor Python para identificar, limpar e organizar as mensagens da conversa.

## Estrutura

- `frontend/`: interface React/Vite e processo Electron.
- `backend/`: biblioteca e CLI Python de conversão.
- `run.bat`: menu de execução no Windows.

## Executar no Windows

Com Node.js e Python instalados, execute:

```bat
run.bat install
run.bat electron
```

Para desenvolver apenas a interface web:

```bat
run.bat dev
```

## Validação

```bat
cd frontend && npm run build
cd ..\backend && python -m pytest
```

Consulte [`frontend/package.json`](frontend/package.json) e [`backend/README.md`](backend/README.md) para os comandos e detalhes de cada componente.
