@echo off
setlocal enabledelayedexpansion
:: ============================================================
:: AI Chat Converter - Electron Desktop App
:: ============================================================
:: Uso: run.bat [dev|build|electron|cli|python-test|install|clean|help]

title AI Chat Converter - Electron

:: Verificar Node
where node >nul 2>&1
if %errorlevel% neq 0 (echo [ERRO] Node.js nao encontrado & pause & exit /b 1)

:: Verificar Python
where python >nul 2>&1
if %errorlevel% neq 0 (where py >nul 2>&1)
if %errorlevel% neq 0 (echo [ERRO] Python nao encontrado & pause & exit /b 1) else set PYTHON=py
set PYTHON=python 2>nul

set PKG_MANAGER=npm
where pnpm >nul 2>&1 && set PKG_MANAGER=pnpm

set PROJECT_ROOT=%~dp0

if "%~1"=="dev" goto dev
if "%~1"=="build" goto build
if "%~1"=="electron" goto electron
if "%~1"=="cli" goto cli
if "%~1"=="python-test" goto python_test
if "%~1"=="install" goto install
if "%~1"=="clean" goto clean
if "%~1"=="help" goto help
if "%~1"=="--help" goto help
if "%~1"=="-h" goto help
if "%~1"=="" goto menu

echo [ERRO] Opcao desconhecida: %~1
exit /b 1

:menu
cls
echo ================================================================
echo  AI Chat Converter / Electron - React UI + Python Engine
echo ================================================================
echo [1] Dev Server  [2] Build  [3] Electron  [4] Cli
echo [5] Install    [6] Clean  [7] Help     [0] Sair
echo ================================================================
set /p c=Opcao:
if "%c%"=="1" goto dev
if "%c%"=="2" goto build
if "%c%"=="3" goto electron
if "%c%"=="4" goto cli
if "%c%"=="5" goto install
if "%c%"=="6" goto clean
if "%c%"=="7" goto help
if "%c%"=="0" goto exit

echo [ERRO] Opcao invalida!
pause
goto menu

:dev
cd /d %PROJECT_ROOT%frontend
call %PKG_MANAGER% run dev
pause
goto menu

:build
cd /d %PROJECT_ROOT%frontend
call %PKG_MANAGER% run build
echo [BUILD] Arquivos em frontend/dist/
pause
goto menu

:electron
echo [ELECTRON] Build do frontend...
if not exist "frontend/dist/index.html" (
    cd /d %PROJECT_ROOT%frontend && call %PKG_MANAGER% run build
    if %errorlevel% neq 0 echo [ERRO] Build falhou & pause & goto menu
)
echo [ELECTRON] Compilando main/preload (electron:build)...
cd /d %PROJECT_ROOT%frontend
call %PKG_MANAGER% run electron:build
if %errorlevel% neq 0 echo [ERRO] Compilacao Electron falhou & pause & goto menu

echo [ELECTRON] Verificando Python backend...
cd /d %PROJECT_ROOT%backend
set PYTHONIOENCODING=utf-8
%PYTHON% -m ai_converter_cli.cli "%PROJECT_ROOT%backend\exemplos" --indice 1 --force >nul 2>&1 && echo [PYTHON] Backend OK || echo [PYTHON] Backend nao instalado - use 'run.bat install'

echo [ELECTRON] Abrindo app desktop...
cd /d %PROJECT_ROOT%frontend
set ELECTRON_OVERRIDE_DIST_PATH=%PROJECT_ROOT%frontend\node_modules\electron\dist
npx electron dist-electron/main.cjs
pause
goto menu

:python_test
cd /d %PROJECT_ROOT%backend
if exist "exemplos" (echo [TESTE] Testando com exemplos... && %PYTHON% -m ai_converter_cli.cli exemplos --indice 1 --force) else (%PYTHON% -c "import ai_converter_cli; print('Python OK')")
pause
goto menu

:cli
echo [CLI] AI Chat Converter CLI
set CLI_DIR=%~2
if "%CLI_DIR%"=="" set CLI_DIR=%USERPROFILE%\Downloads
if not exist "%CLI_DIR%" (
    echo [ERRO] Diretorio nao encontrado: %CLI_DIR%
    pause
    if not "%~1"=="" exit /b 1
    goto menu
)
cd /d %PROJECT_ROOT%backend
echo [CLI] Procurando paginas HTML em: %CLI_DIR%
%PYTHON% -m ai_converter_cli.cli "%CLI_DIR%"
pause
if not "%~1"=="" exit /b %errorlevel%
goto menu

:install
cd /d %PROJECT_ROOT%frontend && call %PKG_MANAGER% install
cd /d %PROJECT_ROOT%frontend && call %PKG_MANAGER% rebuild electron
echo [INSTALL] Dependencias Node instaladas.
cd /d %PROJECT_ROOT%backend && %PYTHON% -m pip install -e ".[dev]" -q 2>nul || %PYTHON% -m pip install -e "." -q 2>nul
echo [INSTALL] Python backend instalado.
pause
goto menu

:clean
if exist "frontend/node_modules" rmdir /s /q frontend\node_modules
echo [CLEAN] node_modules removido.
pause
goto menu

:help
cls
echo  AI Chat Converter / Electron
echo  Uso: run.bat [dev^|build^|electron^|cli^|python-test^|install^|clean^|help]
echo  dev         - Servidor de desenvolvimento
echo  build       - Build de producao
echo  electron     - App desktop (Electron + Python)
echo  cli          - Abre a CLI interativa de conversao
echo  python-test - Testa CLI Python
echo  install      - Instala dependencias
echo  clean       - Limpa node_modules
echo  help        - Mostra esta ajuda
pause
if not "%~1"=="" exit /b 0
goto menu

:exit
exit /b 0
