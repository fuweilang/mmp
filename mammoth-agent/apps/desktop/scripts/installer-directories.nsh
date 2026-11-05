!include "LogicLib.nsh"

Var mmpFinalDirectory
Var mmpNewDirectory
Var mmpOldDirectory
Var mmpOldMoved
Var mmpNewMoved
Var mmpDirectoryError
Var mmpDirectorySource
Var mmpDirectoryDestination
Var mmpRestoreError
Var mmpDirectoryLogDirectory
Var mmpRecoveryStopped

; MoveFileEx preserves the destination and exposes the Windows error before rollback changes it.
; Open files inside a directory can make its rename return access denied (5).
!macro mmpDirectoryOperation SOURCE DESTINATION RESULT PHASE
  Push $0
  Push $1
  Push $2
  StrCpy $0 0
  ${Do}
    ${If} "${DESTINATION}" == ""
      System::Call 'kernel32::RemoveDirectoryW(w "${SOURCE}") i.r1 ?e'
    ${Else}
      System::Call 'kernel32::MoveFileExW(w "${SOURCE}", w "${DESTINATION}", i 0) i.r1 ?e'
    ${EndIf}
    Pop ${RESULT}
    ${If} "${DESTINATION}" == ""
      ${If} ${RESULT} == 2
      ${OrIf} ${RESULT} == 3
        StrCpy $1 1
      ${EndIf}
    ${EndIf}
    ${If} $1 != 0
      StrCpy ${RESULT} 0
      ${ExitDo}
    ${EndIf}
    ClearErrors
    FileOpen $2 "$PLUGINSDIR\directory-operations.log" a
    ${IfNot} ${Errors}
      FileSeek $2 0 END
      FileWrite $2 "${PHASE}: Windows error: ${RESULT}$\r$\n"
      FileClose $2
    ${EndIf}
    ${If} ${RESULT} != 5
    ${AndIf} ${RESULT} != 32
    ${AndIf} ${RESULT} != 33
      ${ExitDo}
    ${EndIf}
    IntOp $0 $0 + 1
    ${If} $0 >= 10
      ${ExitDo}
    ${EndIf}
    IntOp $1 $0 * 250
    Sleep $1
  ${Loop}
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro mmpReportDirectoryFailure
  ${If} $mmpRestoreError != 0
    StrCpy $mmpRecoveryStopped "1"
  ${EndIf}
  !ifmacrodef customInstallerDirectoryFailed
    !insertmacro customInstallerDirectoryFailed
  !else
    DetailPrint "Directory operation failed ($mmpDirectoryError): $mmpDirectorySource -> $mmpDirectoryDestination; restore error: $mmpRestoreError"
  !endif
!macroend

!macro mmpExtractPayload FILE
  !ifmacrodef customInstallerExtract
    !insertmacro customInstallerExtract "${FILE}"
  !else
    nsExec::ExecToStack '"$PLUGINSDIR\mmp-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
    Pop $R0
    Pop $R1
  !endif
  ${If} $R0 != 0
    DetailPrint $R1
    Call mmpRollbackDirectories
    !ifmacrodef customInstallerExtractFailed
      !insertmacro customInstallerExtractFailed "${FILE}"
    !else
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    !endif
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro mmpStageApplication
  !ifdef MMP_INSTALLER_LOG_DIR
    ; electron-builder defines the cache name after including our function bodies, before this section expands.
    StrCpy $mmpDirectoryLogDirectory "${MMP_INSTALLER_LOG_DIR}"
  !endif
  StrCpy $mmpFinalDirectory $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  ${If} $1 != 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $mmpNewDirectory "$INSTDIR.new-$0"
  StrCpy $mmpOldDirectory "$INSTDIR.old-$0"
  StrCpy $mmpOldMoved ""
  StrCpy $mmpNewMoved ""
  StrCpy $mmpDirectoryError 0
  StrCpy $mmpRestoreError 0
  StrCpy $mmpRecoveryStopped ""
  ClearErrors
  CreateDirectory $mmpNewDirectory
  ${If} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  File /oname=$PLUGINSDIR\mmp-7za.exe "${MMP_SEVENZIP_PATH}"
  StrCpy $INSTDIR $mmpNewDirectory
  SetOutPath $INSTDIR
  !insertmacro installApplicationFiles
  !ifdef MMP_SEVENZIP_LICENSE_DIR
    File /oname=7zip-installer-LICENSE.txt "${MMP_SEVENZIP_LICENSE_DIR}\LICENSE.txt"
    File /oname=7zip-installer-COPYING.txt "${MMP_SEVENZIP_LICENSE_DIR}\COPYING"
  !endif
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  StrCpy $INSTDIR $mmpFinalDirectory
  SetOutPath $PLUGINSDIR
!macroend

Function .onGUIEnd
  Call mmpCleanupDirectories
FunctionEnd

Function mmpCleanupDirectories
  ${If} $mmpRecoveryStopped == "1"
    Return
  ${EndIf}
  ${If} $mmpFinalDirectory != ""
    Call mmpRollbackDirectories
  ${EndIf}
FunctionEnd

; Only directories created or renamed by this installer are removed during rollback.
Function mmpRollbackDirectories
  SetOutPath $PLUGINSDIR
  ${If} $mmpNewMoved == "1"
    RMDir /r "\\?\$mmpFinalDirectory"
    StrCpy $mmpNewMoved ""
  ${EndIf}
  ${If} $mmpOldMoved == "1"
    !insertmacro mmpDirectoryOperation "$mmpOldDirectory" "$mmpFinalDirectory" $mmpRestoreError "restore"
    ${If} $mmpRestoreError != 0
      ; Leave the complete backup in place if another process prevents restoration.
      DetailPrint $mmpOldDirectory
      RMDir /r "\\?\$mmpNewDirectory"
      Return
    ${EndIf}
    StrCpy $mmpOldMoved ""
  ${EndIf}
  ${If} $mmpNewDirectory != ""
    RMDir /r "\\?\$mmpNewDirectory"
  ${EndIf}
  StrCpy $INSTDIR $mmpFinalDirectory
FunctionEnd

Function mmpPromoteDirectories
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 2
  !endif
  ; SetOutPath opens a directory handle; release it before either rename.
  SetOutPath $PLUGINSDIR
  ClearErrors
  ${If} ${FileExists} "$mmpFinalDirectory\*.*"
    StrCpy $mmpDirectorySource $mmpFinalDirectory
    StrCpy $mmpDirectoryDestination $mmpOldDirectory
    !insertmacro mmpDirectoryOperation "$mmpDirectorySource" "$mmpDirectoryDestination" $mmpDirectoryError "backup"
    ${If} $mmpDirectoryError != 0
      Call mmpRollbackDirectories
      !insertmacro mmpReportDirectoryFailure
      SetErrors
      Return
    ${EndIf}
    StrCpy $mmpOldMoved "1"
  ${Else}
    ; NSIS can create the destination before the install section starts.
    StrCpy $mmpDirectorySource $mmpFinalDirectory
    StrCpy $mmpDirectoryDestination ""
    !insertmacro mmpDirectoryOperation "$mmpDirectorySource" "" $mmpDirectoryError "remove-empty"
    ${If} $mmpDirectoryError != 0
      Call mmpRollbackDirectories
      !insertmacro mmpReportDirectoryFailure
      SetErrors
      Return
    ${EndIf}
  ${EndIf}
  ClearErrors
  StrCpy $mmpDirectorySource $mmpNewDirectory
  StrCpy $mmpDirectoryDestination $mmpFinalDirectory
  !insertmacro mmpDirectoryOperation "$mmpDirectorySource" "$mmpDirectoryDestination" $mmpDirectoryError "promote"
  ${If} $mmpDirectoryError != 0
    Call mmpRollbackDirectories
    !insertmacro mmpReportDirectoryFailure
    SetErrors
    Return
  ${EndIf}
  StrCpy $mmpNewMoved "1"
  SetOutPath $mmpFinalDirectory
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 3
  !endif
  ClearErrors
FunctionEnd

!macro mmpFinishDirectories
  StrCpy $mmpNewMoved ""
  ${If} $mmpOldMoved == "1"
    RMDir /r "\\?\$mmpOldDirectory"
    StrCpy $mmpOldMoved ""
  ${EndIf}
!macroend
