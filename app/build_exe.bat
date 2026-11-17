@echo off
rem Builds "NFL History.exe" (the player's app) with the C# compiler that comes with Windows. Nothing to install.
rem   build_exe.bat              -> NFL History.exe in the repo folder
rem   build_exe.bat <out folder> -> NFL History.exe in that folder (publish.js uses this for the release zip)
setlocal
cd /d "%~dp0"
set "OUT=%~1"
if "%OUT%"=="" set "OUT=%~dp0.."
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /optimize /win32icon:app.ico /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll /r:System.Core.dll /r:System.Web.Extensions.dll /out:"%OUT%\NFL History.exe" NFLHistoryApp.cs
