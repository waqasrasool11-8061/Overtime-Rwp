' Silent Background Runner for Turso Sync
' Runs node scripts/sync-from-turso.js with no console window popping up.

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strProjectDir = objFSO.GetParentFolderName(strScriptDir)

objShell.CurrentDirectory = strProjectDir

strNodePath = "C:\Users\waqas\AppData\Local\Programs\nodejs\node.exe"
If Not objFSO.FileExists(strNodePath) Then
    strNodePath = "node.exe"
End If

strCmd = """" & strNodePath & """ """ & strScriptDir & "\sync-from-turso.js"""
objShell.Run strCmd, 0, True
