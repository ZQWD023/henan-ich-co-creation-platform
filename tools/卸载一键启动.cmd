@echo off
chcp 65001 >nul
title 卸载 ich:// 一键启动协议
echo 正在删除 HKEY_CURRENT_USER\Software\Classes\ich ...
reg delete "HKEY_CURRENT_USER\Software\Classes\ich" /f >nul 2>nul
if errorlevel 1 (
  echo [提示] 没有找到该协议，或已经被删除。
) else (
  echo [完成] 已卸载 ich:// 协议。网页上的「一键启动后端」按钮将不再生效。
)
echo.
pause
