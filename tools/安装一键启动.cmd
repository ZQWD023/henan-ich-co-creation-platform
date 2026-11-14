@echo off
chcp 65001 >nul
title 注册 ich:// 一键启动协议
cd /d "%~dp0"

echo ============================================
echo   注册 ich:// 一键启动协议（可选）
echo ============================================
echo.
echo   作用：让网页上的「一键启动后端」按钮可以拉起本地服务，
echo         等价于双击 启动网站.bat，但不显示命令行窗口。
echo.
echo   只写入当前用户注册表 HKEY_CURRENT_USER，
echo   随时可以双击 tools\卸载一键启动.cmd 卸载。
echo.
echo   路径：%~dp0
echo.
pause

set "VBS=%~dp0ich-start.vbs"
if not exist "%VBS%" (
  echo [错误] 找不到 ich-start.vbs
  pause
  exit /b 1
)

set "REG=%~dp0ich.reg"
> "%REG%" echo Windows Registry Editor Version 5.00
>>"%REG%" echo.
>>"%REG%" echo [HKEY_CURRENT_USER\Software\Classes\ich]
>>"%REG%" echo @="URL:ICH Launcher Protocol"
>>"%REG%" echo "URL Protocol"=""
>>"%REG%" echo.
>>"%REG%" echo [HKEY_CURRENT_USER\Software\Classes\ich\DefaultIcon]
>>"%REG%" echo @="\"%%SystemRoot%%\\System32\\shell32.dll,25\""
>>"%REG%" echo.
>>"%REG%" echo [HKEY_CURRENT_USER\Software\Classes\ich\shell]
>>"%REG%" echo.
>>"%REG%" echo [HKEY_CURRENT_USER\Software\Classes\ich\shell\open]
>>"%REG%" echo.
>>"%REG%" echo [HKEY_CURRENT_USER\Software\Classes\ich\shell\open\command]
>>"%REG%" echo @="wscript.exe \"%VBS%\" \"%%1\""

reg import "%REG%" >nul 2>nul
if errorlevel 1 (
  echo [错误] 注册表导入失败，可以手动双击 ich.reg 试试。
  pause
  exit /b 1
)

echo.
echo [完成] 已注册 ich:// 协议。
echo        现在网页上的「一键启动后端」按钮可以直接拉起服务了。
echo        （如果浏览器弹出"是否打开 ich"的提示，点「打开」即可）
echo.
pause
