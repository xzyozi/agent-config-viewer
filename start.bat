@echo off
rem agent-config-viewer 起動スクリプト (Windows)
rem リポジトリのルートで server.py を起動し、127.0.0.1:8765 で待受します。

setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    py server.py
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    python server.py
    goto :end
)

echo Python が見つかりません。Python をインストールしてください。 1>&2
exit /b 1

:end
endlocal
