@echo off
setlocal
title NFL History for Football GM
cd /d "%~dp0"
set "GAME=%~dp0football-gm"
set "BASE=bda1fa5"

echo.
echo   NFL History for Football GM
echo   ---------------------------
echo   The first run sets everything up (about 5-10 minutes). After that it starts in seconds.
echo.

where node >nul 2>nul || (
  echo Installing Node.js...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements || goto :fail
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
where git >nul 2>nul || (
  echo Installing Git...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements || goto :fail
  set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
)

if not exist "%GAME%\.nfl-installed" (
  if not exist "%GAME%" (
    echo Downloading Football GM source...
    git clone https://github.com/zengm-games/zengm.git "%GAME%" || goto :fail
  )
  pushd "%GAME%"
  git checkout -q %BASE% || goto :fail
  echo Applying the NFL History mod...
  git apply --whitespace=nowarn "%~dp0mod\nfl-history-mod.patch" || goto :fail
  if not exist "public\football\nfl" mkdir "public\football\nfl"
  copy /y "%~dp0mod\public\nfl\nfl_mod.js" "public\football\nfl\" >nul || goto :fail
  echo Installing packages...
  call corepack enable >nul 2>nul
  call corepack pnpm install || goto :fail
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
echo Something went wrong above. Screenshot this window and open an issue on GitHub.
pause
