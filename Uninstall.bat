@echo off
setlocal
title Uninstall NFL History for Football GM
cd /d "%~dp0"
rem Removes NFL History for Football GM: stops the game if it's running, then deletes this folder (the mod, the
rem downloaded Football GM files and the private copy of Node). Nothing else on the computer is touched unless you
rem say so below.

if not exist "%~dp0mod\launcher.mjs" (
  echo This doesn't look like the NFL History for Football GM folder, so nothing was removed.
  pause
  exit /b
)

echo.
echo   Uninstall NFL History for Football GM
echo   -------------------------------------
echo   This will:
echo     - stop the game if it's running
echo     - delete this folder: %~dp0
echo       (the mod, the downloaded Football GM files and the private copy of Node.js)
echo.
echo   Your leagues are saved in your web browser, not in this folder.
echo   To delete them too: before uninstalling, open http://localhost:3000, go to Leagues and delete them.
echo.
choice /c YN /m "  Uninstall now"
if errorlevel 2 exit /b

echo   Stopping the game...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('%~dp0', 'OrdinalIgnoreCase') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo.
choice /c YN /m "  Also delete pnpm's shared download cache (choose N if you use pnpm for anything else)"
if not errorlevel 2 rmdir /s /q "%LOCALAPPDATA%\pnpm\store" >nul 2>&1

echo.
echo   If the installer added Git for you, it stays installed (other programs may use it).
echo   You can remove it from Windows Settings, Apps, if you don't need it.
echo.

rem A folder can't delete itself while this window runs from it: a hidden helper deletes it a few seconds after
set "TARGET=%~dp0"
set "TARGET=%TARGET:~0,-1%"
rem (an apostrophe in the path is doubled for PowerShell)
set "PSTARGET=%TARGET:'=''%"
echo   Removing the folder... this window will close, and the folder disappears in a few seconds.
cd /d "%TEMP%"
start "" /d "%TEMP%" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Set-Location $env:TEMP; Start-Sleep -Seconds 3; Remove-Item -LiteralPath '%PSTARGET%' -Recurse -Force -ErrorAction SilentlyContinue"
ping -n 2 127.0.0.1 >nul
exit
