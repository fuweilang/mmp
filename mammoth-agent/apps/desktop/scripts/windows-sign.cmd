@echo off
setlocal DisableDelayedExpansion
set "signTool=%MMP_DESKTOP_WINDOWS_SIGNTOOL%"
set "certificateFile=%MMP_DESKTOP_WINDOWS_CER_FILE%"
set "tokenPin=%MMP_DESKTOP_WINDOWS_TOKEN_PIN%"
set "keyContainer=%MMP_DESKTOP_WINDOWS_KEY_CONTAINER%"
set "targetFile=%MMP_DESKTOP_WINDOWS_SIGN_TARGET%"
set "appendSignature="
if "%MMP_DESKTOP_WINDOWS_SIGN_APPEND%"=="1" set "appendSignature=/as"
set "MMP_DESKTOP_WINDOWS_SIGNTOOL="
set "MMP_DESKTOP_WINDOWS_CER_FILE="
set "MMP_DESKTOP_WINDOWS_TOKEN_PIN="
set "MMP_DESKTOP_WINDOWS_KEY_CONTAINER="
set "MMP_DESKTOP_WINDOWS_SIGN_TARGET="
set "MMP_DESKTOP_WINDOWS_SIGN_APPEND="
set "signTool=" & set "certificateFile=" & set "tokenPin=" & set "keyContainer=" & set "targetFile=" & set "appendSignature=" & "%signTool%" sign /v /fd sha256 /f "%certificateFile%" /kc "[{{%tokenPin%}}]=%keyContainer%" /csp "eToken Base Cryptographic Provider" %appendSignature% "%targetFile%"
exit /b %errorlevel%
