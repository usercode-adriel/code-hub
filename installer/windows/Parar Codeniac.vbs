' Encerra o servidor do Codeniac com segurança (salva os dados antes de fechar).
' Argumento: /silent (não mostra mensagens; usado pelo instalador)
Option Explicit
Dim sh, fso, appDir, dataDir, tokenFile, token, h, ok, silent, nodeExe, wmi, p, killed
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = Replace(sh.ExpandEnvironmentStrings("%APPDATA%"), Chr(0), "") & "\Codeniac"
tokenFile = dataDir & "\.control-token"
nodeExe = LCase(appDir & "\node\node.exe")
silent = False
If WScript.Arguments.Count > 0 Then silent = (LCase(WScript.Arguments(0)) = "/silent")
ok = False

If fso.FileExists(tokenFile) Then
  token = Trim(fso.OpenTextFile(tokenFile, 1).ReadAll())
  On Error Resume Next
  Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  h.setTimeouts 1000, 1000, 3000, 3000
  h.open "POST", "http://127.0.0.1:3000/api/system/shutdown", False
  h.setRequestHeader "x-codeniac-control", token
  h.send
  ok = (Err.Number = 0)
  If ok Then ok = (h.status = 200)
  Err.Clear
  On Error GoTo 0
End If

If Not ok Then
  ' plano B: fecha apenas o node.exe que pertence a esta instalação
  killed = 0
  On Error Resume Next
  Set wmi = GetObject("winmgmts:\\.\root\cimv2")
  For Each p In wmi.ExecQuery("Select * From Win32_Process Where Name = 'node.exe'")
    If LCase(p.ExecutablePath) = nodeExe Then
      p.Terminate
      killed = killed + 1
    End If
  Next
  On Error GoTo 0
  ok = (killed > 0)
End If

WScript.Sleep 800
If Not silent Then
  If ok Then
    MsgBox "O Codeniac foi encerrado. Seus dados estão salvos.", 64, "Codeniac"
  Else
    MsgBox "O Codeniac não estava aberto.", 64, "Codeniac"
  End If
End If
