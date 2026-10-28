@echo off
chcp 65001 > nul
echo =======================================================
echo   Iniciando Backend LC PETRO (Serviço de Gráficos e API)
echo =======================================================
cd /d "%~dp0servico-graficos"

if not exist ".venv\Scripts\python.exe" (
    echo [ERRO] Ambiente virtual .venv não encontrado em servico-graficos!
    pause
    exit /b 1
)

echo Verificando porta 8010...
netstat -ano | findstr :8010 | findstr LISTENING > nul
if %errorlevel% == 0 (
    echo [AVISO] Já existe um processo rodando na porta 8010!
    echo O backend já está ativo em http://127.0.0.1:8010
) else (
    echo Subindo uvicorn na porta 8010...
    ".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8010 --reload
)

pause
