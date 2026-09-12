@echo off
setlocal enabledelayedexpansion
:: ============================================================
:: AI Chat Converter - Electron Desktop App
:: ============================================================
:: Uso: run.bat [dev|build|electron|cli|python-test|install|clean|opendesign|sync|help]

title AI Chat Converter - Electron

:: OpenDesign artifact path
set OPENDESIGN_HTML=%USERPROFILE%\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\ai-chat-converter-reader-ui\ai-chat-converter.html

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
if "%~1"=="opendesign" goto opendesign
if "%~1"=="sync" goto sync
if "%~1"=="help" goto help
if "%~1"=="--help" goto help
if "%~1"=="-h" goto help
if "%~1"=="1" goto dev
if "%~1"=="2" goto build
if "%~1"=="3" goto electron
if "%~1"=="4" goto cli
if "%~1"=="5" goto install
if "%~1"=="6" goto clean
if "%~1"=="7" goto help
if "%~1"=="0" goto exit
if "%~1"=="" goto menu

echo [ERRO] Opcao desconhecida: %~1
exit /b 1

:menu
cls
echo ================================================================
echo  AI Chat Converter / Electron - React UI + Python Engine
echo ================================================================
echo [1] Dev Server  [2] Build  [3] Electron  [4] Cli
echo [5] Install    [6] Clean  [7] Help     [8] Sync OpenDesign [0] Sair
echo ================================================================
set /p c=Opcao:
if "%c%"=="1" goto dev
if "%c%"=="2" goto build
if "%c%"=="3" goto electron
if "%c%"=="4" goto cli
if "%c%"=="5" goto install
if "%c%"=="6" goto clean
if "%c%"=="7" goto help
if "%c%"=="8" goto sync
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
echo [OPEN DESIGN] Sincronizando UI do OpenDesign...
if exist "%OPENDESIGN_HTML%" (
    copy /y "%OPENDESIGN_HTML%" "frontend\dist\index.html" >nul
    echo [OPEN DESIGN] UI copiada para frontend\dist\index.html
) else (
    echo [AVISO] Artifacto do OpenDesign nao encontrado em:
    echo  %OPENDESIGN_HTML%
    echo  Abra o projeto "AI Chat Converter Reader UI" no OpenDesign e tente novamente.
    pause
    goto menu
)
echo [OPEN DESIGN] Aplicando patch para aba "Pagina original"...
node frontend\scripts\patch-opendesign.cjs "frontend\dist\index.html"
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao aplicar patch do OpenDesign.
    pause
    goto menu
)
echo [ELECTRON] Build do frontend...
if not exist "frontend/dist/index.html" (
    cd /d %PROJECT_ROOT%frontend && call npm run build
    if %errorlevel% neq 0 echo [ERRO] Build falhou & pause & goto menu
)
echo [ELECTRON] Compilando main/preload (electron:build)...
cd /d %PROJECT_ROOT%frontend
call npm run electron:build
if %errorlevel% neq 0 echo [ERRO] Compilacao Electron falhou & pause & goto menu

echo [ELECTRON] Verificando Python backend...
cd /d %PROJECT_ROOT%backend
set PYTHONIOENCODING=utf-8
%PYTHON% -m ai_converter_cli.cli "%PROJECT_ROOT%backend\exemplos" --indice 1 --force >nul 2>&1 && echo [PYTHON] Backend OK || echo [PYTHON] Backend nao instalado - use 'run.bat install'

echo [ELECTRON] Abrindo app desktop...
cd /d %PROJECT_ROOT%frontend
set ELECTRON_OVERRIDE_DIST_PATH=%PROJECT_ROOT%frontend\node_modules\electron\dist
if not exist "node_modules\electron\dist\electron.exe" (
    echo [ELECTRON] Binario ausente; baixando runtime do Electron...
    call npm install --ignore-scripts=false electron@44.0.0 --save-dev
    if exist "node_modules\electron\install.js" node "node_modules\electron\install.js"
)
if not exist "node_modules\electron\dist\electron.exe" (
    echo [ERRO] Binario do Electron nao foi instalado.
    echo Execute 'run.bat install' e tente novamente.
    pause
    goto menu
)
call "node_modules\.bin\electron.cmd" dist-electron/main.cjs
pause
goto menu

:python_test
cd /d %PROJECT_ROOT%backend
if exist "exemplos" (echo [TESTE] Testando com exemplos... && %PYTHON% -m ai_converter_cli.cli exemplos --indice 1 --force) else (%PYTHON% -c "import ai_converter_cli; print('Python OK')")
pause
goto menu

:cli
echo [CLI] AI Chat Converter CLI
set CLI_FILE=%~2
if "%CLI_FILE%"=="" set /p CLI_FILE=Informe o caminho do arquivo .html: 
set "CLI_FILE=%CLI_FILE:"=%"
if "%CLI_FILE%"=="" (
    echo [ERRO] Nenhum arquivo informado.
    pause
    if not "%~1"=="" exit /b 1
    goto menu
)
cd /d %PROJECT_ROOT%backend
echo [CLI] Processando: %CLI_FILE%
%PYTHON% -m ai_converter_cli.cli --arquivo "%CLI_FILE%"
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

:sync
echo [OPEN DESIGN] Sincronizando UI para frontend\dist\index.html...
if exist "%OPENDESIGN_HTML%" (
    copy /y "%OPENDESIGN_HTML%" "frontend\dist\index.html" >nul
    echo [OPEN DESIGN] UI copiada.
    echo [OPEN DESIGN] Aplicando patch para aba "Pagina original"...
    node frontend\scripts\patch-opendesign.cjs "frontend\dist\index.html"
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao aplicar patch.
        pause
        goto menu
    )
    echo [OK] UI sincronizada com sucesso.
) else (
    echo [ERRO] Artifacto do OpenDesign nao encontrado.
    echo  Verifique se o projeto esta aberto no OpenDesign:
    echo  AI Chat Converter Reader UI
)
pause
goto menu

:opendesign
start "" "%USERPROFILE%\AppData\Roaming\Open Design\Open Design.exe"
echo [OPEN DESIGN] Abrindo OpenDesign...
pause
goto menu

:help
cls
echo  AI Chat Converter / Electron
echo  Uso: run.bat [dev^|build^|electron^|cli^|python-test^|install^|clean^|opendesign^|sync^|help]
echo  dev         - Servidor de desenvolvimento
echo  build       - Build de producao
echo  electron     - App desktop (Electron + OpenDesign UI)
echo  cli          - Abre a CLI interativa de conversao
echo  python-test - Testa CLI Python
echo  install      - Instala dependencias
echo  clean       - Limpa node_modules
echo  opendesign   - Abre o OpenDesign
echo  sync        - Sincroniza a UI do OpenDesign para dist/
echo  help        - Mostra esta ajuda
pause
if not "%~1"=="" exit /b 0
goto menu

:exit
exit /b 0
