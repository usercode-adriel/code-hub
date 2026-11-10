; Instalador do Codeniac para Windows (por usuário, sem precisar de administrador).
Unicode true
!define APP "Codeniac"
!define VERSION "1.5.0"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Codeniac"
!include MUI2.nsh
!include FileFunc.nsh

Name "${APP} ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Codeniac"
InstallDirRegKey HKCU "Software\Codeniac" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Codeniac ${VERSION}"

!define MUI_ICON "codeniac.ico"
!define MUI_UNICON "codeniac.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Codeniac ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Seu hub pessoal de projetos, rotina, InDrive, finanças e estudos.$\r$\n$\r$\nNovidades: visual novo (menu de ícones e versão para celular), 16 temas escuros, chats com personagens e a aba Livros com biblioteca de PDF e EPUB.$\r$\n$\r$\nSe você já usa o Codeniac, seus dados e seu logo são mantidos."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION OpenNow
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Codeniac agora"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\LEIA-ME.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Ler as instruções (LEIA-ME)"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductName" "Codeniac"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileDescription" "Instalador do Codeniac"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "LegalCopyright" "Codeniac"

Section "Codeniac (obrigatório)" SecMain
  SectionIn RO
  ; fecha a versão aberta (salva os dados antes)
  IfFileExists "$INSTDIR\Parar Codeniac.vbs" 0 +3
    ExecWait '"$SYSDIR\wscript.exe" "$INSTDIR\Parar Codeniac.vbs" /silent'
    Sleep 1000

  ; guarda o logo atual (o seu logo personalizado continua após a atualização)
  InitPluginsDir
  CreateDirectory "$PLUGINSDIR\keep"
  StrCpy $0 0
  IfFileExists "$INSTDIR\public\assets\logo.png" 0 nokeep
    CopyFiles /SILENT "$INSTDIR\public\assets\*.png" "$PLUGINSDIR\keep"
    CopyFiles /SILENT "$INSTDIR\codeniac.ico" "$PLUGINSDIR\keep"
    StrCpy $0 1
  nokeep:
  ClearErrors

  ; remove arquivos antigos do programa (os dados ficam em %APPDATA%\Codeniac e não são tocados)
  RMDir /r "$INSTDIR\public"
  RMDir /r "$INSTDIR\server"
  RMDir /r "$INSTDIR\node_modules"

  SetOutPath "$INSTDIR"
  File /r "app\*.*"

  StrCmp $0 1 0 norestore
    CopyFiles /SILENT "$PLUGINSDIR\keep\*.png" "$INSTDIR\public\assets"
    IfFileExists "$PLUGINSDIR\keep\codeniac.ico" 0 norestore
      CopyFiles /SILENT "$PLUGINSDIR\keep\codeniac.ico" "$INSTDIR"
  norestore:
  ClearErrors

  ; atalhos
  Delete "$SMPROGRAMS\Codeniac\Desligar acesso pelo celular.lnk"
  Delete "$SMPROGRAMS\Codeniac\Inteligência artificial.lnk"
  CreateDirectory "$SMPROGRAMS\Codeniac"
  CreateShortcut "$SMPROGRAMS\Codeniac\Codeniac.lnk" "$INSTDIR\Codeniac.exe" "" "$INSTDIR\codeniac.ico"
  CreateShortcut "$SMPROGRAMS\Codeniac\Parar Codeniac.lnk" "$INSTDIR\Parar Codeniac.exe" "" "$INSTDIR\codeniac.ico"
  CreateShortcut "$SMPROGRAMS\Codeniac\Codeniac no celular.lnk" "$INSTDIR\Codeniac.exe" "/path:/celular" "$INSTDIR\codeniac.ico"
  CreateShortcut "$SMPROGRAMS\Codeniac\IA local.lnk" "$INSTDIR\Codeniac.exe" "/path:/ia" "$INSTDIR\codeniac.ico"
  CreateShortcut "$SMPROGRAMS\Codeniac\LEIA-ME.lnk" "$INSTDIR\LEIA-ME.txt"
  CreateShortcut "$SMPROGRAMS\Codeniac\Desinstalar Codeniac.lnk" "$INSTDIR\Desinstalar.exe"

  ; registro e desinstalador
  WriteRegStr HKCU "Software\Codeniac" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Codeniac"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Codeniac"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\codeniac.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $1 $2 $3
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" $1
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
SectionEnd

Section "Atalho na área de trabalho" SecDesktop
  CreateShortcut "$DESKTOP\Codeniac.lnk" "$INSTDIR\Codeniac.exe" "" "$INSTDIR\codeniac.ico"
SectionEnd

Section /o "Iniciar com o Windows (em segundo plano)" SecStartup
  CreateShortcut "$SMSTARTUP\Codeniac.lnk" "$INSTDIR\Codeniac.exe" "/background" "$INSTDIR\codeniac.ico"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "Programa, Node.js embutido e atalhos no menu Iniciar."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Cria o ícone do Codeniac na área de trabalho."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartup} "Liga o Codeniac quando o Windows inicia, sem abrir o navegador. Bom para receber o briefing da manhã, lembretes, backup diário e usar pelo celular."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function OpenNow
  Exec '"$SYSDIR\wscript.exe" "$INSTDIR\Codeniac.vbs"'
FunctionEnd

Function .onInit
  ; atualização: se o atalho de inicialização já existia, mantém marcado
  IfFileExists "$SMSTARTUP\Codeniac.lnk" 0 +2
    SectionSetFlags ${SecStartup} ${SF_SELECTED}
FunctionEnd

Section "Uninstall"
  IfFileExists "$INSTDIR\Parar Codeniac.vbs" 0 +3
    ExecWait '"$SYSDIR\wscript.exe" "$INSTDIR\Parar Codeniac.vbs" /silent'
    Sleep 800
  RMDir /r "$SMPROGRAMS\Codeniac"
  Delete "$DESKTOP\Codeniac.lnk"
  Delete "$SMSTARTUP\Codeniac.lnk"
  RMDir /r "$INSTDIR\public"
  RMDir /r "$INSTDIR\server"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\node"
  Delete "$INSTDIR\*.vbs"
  Delete "$INSTDIR\*.exe"
  Delete "$INSTDIR\*.ico"
  Delete "$INSTDIR\*.txt"
  Delete "$INSTDIR\*.json"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\Codeniac"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Apagar também os seus dados (tarefas, páginas, finanças, diário, imagens)?$\r$\n$\r$\nPasta: $APPDATA\Codeniac$\r$\n$\r$\nEscolha Não para manter (recomendado)." /SD IDNO IDNO keep
    RMDir /r "$APPDATA\Codeniac"
  keep:
SectionEnd
