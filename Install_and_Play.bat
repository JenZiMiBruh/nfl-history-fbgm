@echo off
setlocal
title NFL History for Football GM
cd /d "%~dp0"
set "GAME=%~dp0football-gm"
set "BASE=bda1fa5"
rem Football GM needs Node 24 exactly (newer Node versions dropped corepack, which installs its packages).
rem A private copy lives in this folder, so whatever Node is on the computer doesn't matter and nothing is installed system-wide.
set "NODEVER=v24.22.2"
set "NODEDIR=%~dp0node"
set "LOG=%~dp0install_log.txt"

echo.
echo   NFL History for Football GM
echo   ---------------------------
echo   The first run sets everything up (about 5-10 minutes). After that it starts in seconds.
echo.

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

if not exist "%GAME%\.nfl-installed" (
  if not exist "%GAME%\.git" (
    echo Downloading Football GM source...
    git clone https://github.com/zengm-games/zengm.git "%GAME%" >>"%LOG%" 2>&1 || goto :fail
  )
  pushd "%GAME%"
  rem Start from a clean copy every time, so a run that stopped halfway can't block the next one
  git checkout -q -f %BASE% >>"%LOG%" 2>&1 || goto :fail
  git clean -q -fd -e node_modules >>"%LOG%" 2>&1
  echo Applying the NFL History mod...
  git apply --whitespace=nowarn "%~dp0mod\nfl-history-mod.patch" >>"%LOG%" 2>&1 || goto :fail
  if not exist "public\football\nfl" mkdir "public\football\nfl"
  copy /y "%~dp0mod\public\nfl\nfl_mod.js" "public\football\nfl\" >nul || goto :fail
  echo Installing packages, the longest step...
  call corepack enable >>"%LOG%" 2>&1
  call corepack pnpm install >>"%LOG%" 2>&1 || goto :fail
  echo done> .nfl-installed
  popd
)

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set "IP=%%a"
set "IP=%IP: =%"
echo.
echo   Ready. Opening http://localhost:3000
echo   On your phone (same Wi-Fi): http://%IP%:3000
echo   Keep this window open while you play.
echo.
start "" http://localhost:3000
cd /d "%GAME%"
set SPORT=football
call node --run dev -- --host
goto :eof

:fail
echo.
echo Something went wrong. Run Install_and_Play again first (it picks up where it stopped).
echo If it still fails, open an issue on GitHub and attach install_log.txt from this folder:
echo   https://github.com/JenZiMiBruh/nfl-history-fbgm/issues
pause
