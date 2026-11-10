' Codeniac — abre o servidor sem janela de terminal e o navegador.
' Argumentos: /background (inicia sem abrir o navegador)  /path:/celular (abre uma página específica)
Option Explicit
Dim sh, fso, appDir, dataDir, nodeExe, port, url, logFile, i, bg, pg, a, t
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = Replace(sh.ExpandEnvironmentStrings("%APPDATA%"), Chr(0), "") & "\Codeniac"
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
  sh.CurrentDirectory = appDir
  sh.Run """" & nodeExe & """ ""server\index.js"" ""--data-dir=" & dataDir & """ --port=" & port & " ""--log-file=" & logFile & """", 0, False
  For t = 1 To 50
    WScript.Sleep 400
    If Alive() Then Exit For
  Next
  If Not Alive() Then
    MsgBox "O Codeniac não conseguiu iniciar." & vbCrLf & vbCrLf & "Talvez a porta " & port & " esteja ocupada por outro programa." & vbCrLf & "Veja os detalhes no arquivo:" & vbCrLf & logFile, 48, "Codeniac"
    WScript.Quit 1
  End If
End If
If Not bg Then sh.Run url
