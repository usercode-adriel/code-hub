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
VIProductVersion "1.6.1.0"
VIAddVersionKey "ProductName" "Codeniac"
VIAddVersionKey "FileDescription" "Codeniac"
VIAddVersionKey "FileVersion" "1.6.1"
VIAddVersionKey "LegalCopyright" "Codeniac"
Section
  ${GetParameters} $0
  Exec '"$SYSDIR\wscript.exe" "$EXEDIR\${SCRIPT}" $0'
SectionEnd
