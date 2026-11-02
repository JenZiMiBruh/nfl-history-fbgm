@echo off
setlocal
title NFL History for Football GM
cd /d "%~dp0"
rem Gets a private Node 24 (Football GM needs exactly 24; newer versions dropped corepack) and Git, then hands over to
rem mod\launcher.mjs, which updates the mod automatically, sets up Football GM and starts the game.
set "NODEVER=v24.22.2"
set "NODEDIR=%~dp0node"
set "LOG=%~dp0install_log.txt"

if not exist "%NODEDIR%\node.exe" (
  echo Downloading Node.js %NODEVER% for this folder...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $z=Join-Path $env:TEMP 'nfl-node.zip'; Invoke-WebRequest 'https://nodejs.org/dist/%NODEVER%/node-%NODEVER%-win-x64.zip' -OutFile $z; tar -xf $z -C '%~dp0'; if ($LASTEXITCODE) { Expand-Archive $z -DestinationPath '%~dp0' -Force }; Rename-Item '%~dp0node-%NODEVER%-win-x64' 'node'; Remove-Item $z" >>"%LOG%" 2>&1 || goto :fail
)
set "PATH=%NODEDIR%;%PATH%"

where git >nul 2>nul || (
  echo Installing Git...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements >>"%LOG%" 2>&1 || goto :fail
  set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
)

rem The launcher may replace this file while updating, so nothing runs after it
"%NODEDIR%\node.exe" "%~dp0mod\launcher.mjs" & pause & exit /b

:fail
echo.
echo Something went wrong. Run Install_and_Play again first (it picks up where it stopped).
echo If it still fails, open an issue on GitHub and attach install_log.txt from this folder:
echo   https://github.com/JenZiMiBruh/nfl-history-fbgm/issues
pause
