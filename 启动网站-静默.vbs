' Henan ICH Platform - silent start (no console window)
' Double-click this file: starts the server in background and opens the browser automatically.
' To stop it: Task Manager -> end node.exe.  (For daily use, prefer "启动网站.bat".)
Option Explicit
Dim fso, sh, base, js
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)
js = base & "\launcher.js"
If Not fso.FileExists(js) Then
    MsgBox "launcher.js not found. Please keep the whole project folder together.", 16, "ICH Platform"
    WScript.Quit 1
End If
sh.CurrentDirectory = base
sh.Run "cmd /c chcp 65001>nul && node """ & js & """", 0, False
