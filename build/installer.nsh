; installer.nsh - Custom NSIS macros included by electron-builder.
; Handles user-data cleanup prompts on reinstall and uninstall.

!macro customInstall
  ; On reinstall, ask if user wants to clear existing data
  IfFileExists "$APPDATA\.TutorMate\profile.json" 0 SkipReinstallPrompt
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Se encontraron datos de usuario de una instalacion anterior.$\n$\nDeseas eliminar los datos anteriores (perfil, progreso, configuracion)?$\nUbicacion: $APPDATA\.TutorMate" \
      /SD IDNO \
      IDYES ClearReinstallData IDNO SkipReinstallPrompt

    ClearReinstallData:
      RMDir /r "$APPDATA\.TutorMate"
      DetailPrint "User data cleared."

    SkipReinstallPrompt:
!macroend

!macro customUnInstall
  ; Ask the user if they want to remove their personal data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Deseas eliminar los datos de usuario de TutorMate?$\n$\nEsto borrara tu perfil, progreso y configuracion.$\nUbicacion: $APPDATA\.TutorMate" \
    /SD IDNO \
    IDYES RemoveUserData IDNO KeepUserData

  RemoveUserData:
    RMDir /r "$APPDATA\.TutorMate"
    DetailPrint "User data removed."
    Goto UninstallDataDone

  KeepUserData:
    DetailPrint "User data preserved."

  UninstallDataDone:
!macroend
