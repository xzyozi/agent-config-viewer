@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 goto use_py

where python >nul 2>nul
if not errorlevel 1 goto use_python

echo Python was not found. 1>&2
set "exit_code=1"
goto finish

:use_py
py -3 server.py
set "exit_code=%errorlevel%"
goto finish

:use_python
python server.py
set "exit_code=%errorlevel%"

:finish
endlocal & exit /b %exit_code%
