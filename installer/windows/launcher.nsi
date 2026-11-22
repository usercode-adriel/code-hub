; Pequeno .exe que chama o script .vbs (sem janela). Compilado duas vezes:
;   makensis -DOUT=Codeniac.exe -DSCRIPT=Codeniac.vbs launcher.nsi
;   makensis "-DOUT=Parar Codeniac.exe" "-DSCRIPT=Parar Codeniac.vbs" launcher.nsi
Unicode true
!include FileFunc.nsh
Name "Codeniac"
OutFile "${OUT}"
Icon "codeniac.ico"
SilentInstall silent
RequestExecutionLevel user
VIProductVersion "2.3.0.0"
VIAddVersionKey "ProductName" "Codeniac"
VIAddVersionKey "FileDescription" "Codeniac"
VIAddVersionKey "FileVersion" "2.3.0"
VIAddVersionKey "LegalCopyright" "Codeniac"
Section
  ${GetParameters} $0
  ; o .exe precisa estar na mesma pasta do script; copiado para outro lugar (área de trabalho, por exemplo) ele não tem como achar o programa
  IfFileExists "$EXEDIR\${SCRIPT}" 0 semScript
    Exec '"$SYSDIR\wscript.exe" "$EXEDIR\${SCRIPT}" $0'
    Goto fim
  semScript:
    MessageBox MB_OK|MB_ICONSTOP "Não encontrei ${SCRIPT} ao lado deste atalho.$\r$\n$\r$\nAbra o Codeniac pelo menu Iniciar (Codeniac) ou pelo atalho da área de trabalho, que apontam para a pasta de instalação."
  fim:
SectionEnd
