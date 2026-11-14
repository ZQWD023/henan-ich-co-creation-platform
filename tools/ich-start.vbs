' ich-start.vbs -- launcher invoked by the ich:// protocol handler
'
' Why this file is ASCII-only:
'   wscript reads .vbs as ANSI unless the file has a BOM. A UTF-8 file with Chinese
'   comments gets decoded as GBK and can break parsing (VBScript error 1058).
'   So: keep this file ASCII-only.
'
' What it does: same as double-clicking "启动网站.bat", but without a console window.
Option Explicit

Dim fso, sh, root, js
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' This file lives in <project root>\tools\, so root is two levels up.
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
js = root & "\launcher.js"

If Not fso.FileExists(js) Then
    MsgBox "launcher.js not found." & vbCrLf & _
           "Project root resolved as: " & root & vbCrLf & vbCrLf & _
           "Please keep the whole project folder together.", 16, "ICH Launcher"
    WScript.Quit 1
End If

sh.CurrentDirectory = root
' 0 = hidden window, False = do not wait
sh.Run "cmd /c chcp 65001>nul && node """ & js & """", 0, False

WScript.Quit 0
