@echo off
setlocal

:: ============================================================
:: AI Chat Converter / Refactor AAA - Script de Execucao
:: ============================================================
:: Uso: run.bat [opcao]
::   Sem argumento = menu interativo
::   Com argumento  = executa direto (dev, build, preview, install, clean)
:: ============================================================

title AI Chat Converter - Refactor AAA

:: Verificar se Node.js esta instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Node.js nao encontrado!
    echo Instale em https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Verificar se npm/pnpm esta disponivel
set "PKG_MANAGER=npm"
where pnpm >nul 2>&1
if %errorlevel% equ 0 (
    set "PKG_MANAGER=pnpm"
)

:: Verificar se node_modules existe
if not exist "node_modules" (
    echo.
    echo [INFO] node_modules nao encontrado. Executando install...
    echo.
    call :install
)

:: Menu interativo ou execucao direta
if "%~1"=="" goto :menu
if "%~1"=="dev" goto :dev
if "%~1"=="build" goto :build
if "%~1"=="preview" goto :preview
if "%~1"=="install" goto :install
if "%~1"=="clean" goto :clean
if "%~1"=="help" goto :help
if "%~1"=="--help" goto :help
if "%~1"=="-h" goto :help

echo.
echo [ERRO] Opcao desconhecida: %~1
echo Use 'run.bat help' para ver as opcoes disponiveis.
echo.
exit /b 1

:menu
cls
echo.
echo  ============================================================
echo   AI Chat Converter / Refactor AAA
echo   Pipeline de 6 estagios - TypeScript strict - 16 testes
echo  ============================================================
echo.
echo   Gerenciador de pacotes: %PKG_MANAGER%
echo.
echo   [1] Dev Server          - Inicia servidor de desenvolvimento
echo   [2] Build               - Build de producao
echo   [3] Preview             - Preview do build
echo   [4] Install             - Instala dependencias
echo   [5] Clean               - Limpa node_modules e reinstala
echo   [6] Help                - Mostra ajuda completa
echo   [0] Sair
echo.
echo  ============================================================
echo.

set /p choice="Escolha uma opcao: "

if "%choice%"=="1" goto :dev
if "%choice%"=="2" goto :build
if "%choice%"=="3" goto :preview
if "%choice%"=="4" goto :install
if "%choice%"=="5" goto :clean
if "%choice%"=="6" goto :help
if "%choice%"=="0" goto :exit

echo.
echo [ERRO] Opcao invalida!
echo.
pause
goto :menu

:dev
echo.
echo [DEV] Iniciando servidor de desenvolvimento...
echo [DEV] Acesse http://localhost:5173
echo [DEV] Ctrl+C para parar
echo.
call %PKG_MANAGER% run dev
goto :end

:build
echo.
echo [BUILD] Executando build de producao...
echo.
call %PKG_MANAGER% run build
if %errorlevel% equ 0 (
    echo.
    echo [BUILD] Build concluido com sucesso!
    echo [BUILD] Arquivos em: dist/
) else (
    echo.
    echo [ERRO] Build falhou!
)
echo.
pause
goto :menu

:preview
echo.
echo [PREVIEW] Iniciando preview do build...
echo [PREVIEW] Acesse http://localhost:4173
echo [PREVIEW] Ctrl+C para parar
echo.
call %PKG_MANAGER% run preview
goto :end

:install
echo.
echo [INSTALL] Instalando dependencias com %PKG_MANAGER%...
echo.
call %PKG_MANAGER% install
if %errorlevel% equ 0 (
    echo.
    echo [INSTALL] Dependencias instaladas com sucesso!
) else (
    echo.
    echo [ERRO] Falha ao instalar dependencias!
)
echo.
pause
goto :menu

:clean
echo.
echo [CLEAN] Removendo node_modules...
echo.
if exist "node_modules" (
    rmdir /s /q "node_modules"
    echo [CLEAN] node_modules removido
)
if exist "package-lock.json" (
    del /f /q "package-lock.json"
    echo [CLEAN] package-lock.json removido
)
echo.
echo [CLEAN] Reinstalando dependencias...
echo.
call %PKG_MANAGER% install
if %errorlevel% equ 0 (
    echo.
    echo [CLEAN] Limpeza e reinstalacao concluidas!
) else (
    echo.
    echo [ERRO] Falha na reinstalacao!
)
echo.
pause
goto :menu

:help
cls
echo.
echo  ============================================================
echo   AI Chat Converter / Refactor AAA - Ajuda
echo  ============================================================
echo.
echo   USO:
echo     run.bat              Menu interativo
echo     run.bat dev          Inicia dev server (porta 5173)
echo     run.bat build        Build de producao (pasta dist/)
echo     run.bat preview      Preview do build (porta 4173)
echo     run.bat install      Instala dependencias
echo     run.bat clean        Limpa e reinstala tudo
echo     run.bat help         Mostra esta ajuda
echo.
echo   ESTRUTURA DO PROJETO:
echo     src/
echo       App.tsx            App principal (Studio, Agentes, Codigo, Testes)
echo       main.tsx           Entry point React + Vite
echo       components/        UI (Studio, AgentArena, CodeExplorer, TestLab)
echo       engine/            Pipeline de 6 estagios (convert, segment, roles...)
echo       lib/               Renderizador Markdown leve
echo       utils/             Utilitarios diversos
echo.
echo   DESENVOLVIMENTO:
echo     1. Clone o repositorio
echo     2. Execute 'run.bat install' ou 'run.bat dev' (instala automatico)
echo     3. Acesse http://localhost:5173
echo     4. Use a aba Studio para testar conversao HTML para Markdown
echo.
echo   COMANDOS UTEIS:
echo     %PKG_MANAGER% run dev          Dev server
echo     %PKG_MANAGER% run build        Build producao
echo     %PKG_MANAGER% run preview      Preview build
echo     %PKG_MANAGER% test            Executa testes (se configurado)
echo     %PKG_MANAGER% run lint         Lint (se configurado)
echo.
echo  ============================================================
echo.
pause
goto :menu

:exit
echo.
echo Saindo...
echo.
exit /b 0

:end
endlocal
