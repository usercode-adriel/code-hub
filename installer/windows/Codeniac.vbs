' Codeniac — abre o servidor sem janela de terminal e o navegador.
' Argumentos: /background (inicia sem abrir o navegador)  /path:/celular (abre uma página específica)
' A porta começa em 3000; se ela estiver ocupada, o servidor usa a seguinte e grava a escolhida em porta.txt.
Option Explicit
Dim sh, fso, appDir, dataDir, nodeExe, port, url, logFile, i, bg, pg, a, t, portaFile, q, cmdLine
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = Replace(sh.ExpandEnvironmentStrings("%APPDATA%"), Chr(0), "") & "\Codeniac"
portaFile = dataDir & "\porta.txt"
q = Chr(34)
port = "3000"
bg = False
pg = "/"
For i = 0 To WScript.Arguments.Count - 1
  a = WScript.Arguments(i)
  If LCase(a) = "/background" Then bg = True
  If LCase(Left(a, 6)) = "/path:" Then pg = Mid(a, 7)
Next
If Not fso.FolderExists(dataDir) Then fso.CreateFolder dataDir
logFile = dataDir & "\codeniac.log"
nodeExe = appDir & "\node\node.exe"
' já há uma instância do Codeniac aberta? reaproveita a porta dela
If fso.FileExists(portaFile) Then port = Trim(fso.OpenTextFile(portaFile, 1).ReadAll())
url = "http://localhost:" & port & pg

Function Alive()
  Dim h
  On Error Resume Next
  Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  h.setTimeouts 1000, 1000, 1500, 1500
  h.open "GET", "http://127.0.0.1:" & port & "/api/health", False
  h.send
  Alive = (Err.Number = 0)
  If Alive Then Alive = (h.status = 200 And InStr(h.responseText, "codeniac") > 0)
  Err.Clear
  On Error GoTo 0
End Function

If Not Alive() Then
  If Not fso.FileExists(nodeExe) Then
    MsgBox "Não encontrei o Node.js do Codeniac em:" & vbCrLf & nodeExe & vbCrLf & vbCrLf & "Reinstale o Codeniac.", 16, "Codeniac"
    WScript.Quit 1
  End If
  ' limpa o registro de uma execução anterior que não terminou direito
  If fso.FileExists(portaFile) Then fso.DeleteFile portaFile, True
  port = "3000"
  ' as variáveis de ambiente são o que o servidor lê (PORT e DATA_DIR); a saída vai para o codeniac.log
  sh.Environment("PROCESS")("PORT") = "3000"
  sh.Environment("PROCESS")("DATA_DIR") = dataDir
  sh.CurrentDirectory = appDir
  cmdLine = "cmd /c " & q & q & nodeExe & q & " " & q & "server\index.js" & q & " > " & q & logFile & q & " 2>&1" & q
  sh.Run cmdLine, 0, False
  For t = 1 To 60
    WScript.Sleep 500
    If fso.FileExists(portaFile) Then
      port = Trim(fso.OpenTextFile(portaFile, 1).ReadAll())
      url = "http://localhost:" & port & pg
      If Alive() Then Exit For
    End If
  Next
  If Not Alive() Then
    MsgBox "O Codeniac não conseguiu iniciar." & vbCrLf & vbCrLf & "Veja os detalhes no arquivo:" & vbCrLf & logFile, 48, "Codeniac"
    WScript.Quit 1
  End If
End If
If Not bg Then sh.Run url
