@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\猛犸智能体.exe" --expose-internals "%~dp0..\..\..\app.asar\mmp\node_modules\@deepseek-ai\mmp-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
