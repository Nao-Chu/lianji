@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 里安记 · 本地网站服务

set "PORT=8765"

netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo 网站服务已经在运行，直接打开浏览器...
  start "" "http://127.0.0.1:%PORT%/"
  timeout /t 2 >nul
  exit /b 0
)

set "PYCMD="
where py >nul 2>nul && set "PYCMD=py -3"
if not defined PYCMD (
  where python >nul 2>nul && set "PYCMD=python"
)
if not defined PYCMD (
  echo 未找到 Python，请先安装 Python 3 后再运行本脚本。
  pause
  exit /b 1
)

echo.
echo   里安记 · 本地网站服务
echo   ------------------------------------------
echo   本机访问:   http://127.0.0.1:%PORT%/
for /f "tokens=1,2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%c in ("%%b") do echo   局域网访问: http://%%c:%PORT%/
)
echo   停止服务:   关闭服务窗口，或在该窗口按 Ctrl+C
echo   ------------------------------------------
echo.

start "里安记服务" %PYCMD% -m http.server %PORT% --bind 0.0.0.0
%SystemRoot%\System32\ping.exe -n 3 127.0.0.1 >nul

start "" "http://127.0.0.1:%PORT%/"

echo 服务已在新的命令行窗口运行，关闭那个窗口即可停止网站。
%SystemRoot%\System32\ping.exe -n 4 127.0.0.1 >nul
exit /b 0