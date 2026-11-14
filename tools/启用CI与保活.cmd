@echo off
chcp 65001 >nul
title 启用 CI 与演示保活（需要 workflow 权限）
cd /d "%~dp0.."

echo ============================================================
echo   启用 GitHub Actions：CI（lint/类型/单测/评测）+ 演示保活
echo ============================================================
echo.
echo 为什么需要这一步：
echo   推送到 GitHub 时被拒过一次：
echo     refusing to allow an OAuth App to create or update workflow
echo     `.github/workflows/ci.yml` without `workflow` scope
echo   意思是本机的 Git 凭据只有 repo 权限，没有 workflow 权限，
echo   所以两个工作流暂时放在了 docs\ci-example\ 里。
echo.
echo 本脚本会做三件事：
echo   1. 给 gh 凭据补上 workflow 权限（会打开浏览器让你确认一次）
echo   2. 把 docs\ci-example\*.yml 复制回 .github\workflows\
echo   3. 提交并推送
echo.
echo 如果不想动权限，直接关掉这个窗口即可，不影响作品与评审。
echo.
pause

where gh >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 gh 命令行。请先安装 GitHub CLI：https://cli.github.com/
  pause
  exit /b 1
)

echo.
echo [1/3] 补充 workflow 权限 ...
call gh auth refresh -s workflow
if errorlevel 1 (
  echo [错误] 授权失败或被取消。可以稍后重试本脚本。
  pause
  exit /b 1
)

echo.
echo [2/3] 复制工作流到 .github\workflows ...
if not exist ".github\workflows" mkdir ".github\workflows"
copy /Y "docs\ci-example\ci.yml" ".github\workflows\ci.yml" >nul
copy /Y "docs\ci-example\keepalive.yml" ".github\workflows\keepalive.yml" >nul
echo     已复制 ci.yml、keepalive.yml

echo.
echo [3/3] 提交并推送 ...
git add .github\workflows
git -c user.name="ich-team" -c user.email="dev@ich.local" commit -m "ci: 启用 GitHub Actions（lint/类型/单测/评测 + 演示保活）"
if errorlevel 1 (
  echo     没有需要提交的改动（可能已经启用过）
)
git -c http.version=HTTP/1.1 push
if errorlevel 1 (
  echo.
  echo [提示] 推送失败。可能是网络问题，重试一次即可：
  echo        git push
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   完成：CI 与保活已启用
echo ============================================================
echo.
echo 建议再配一个演示地址，让保活生效：
echo   仓库 - Settings - Secrets and variables - Actions - Variables
echo   新建变量  DEMO_URL = https://zqwd023.github.io/henan-ich-co-creation-platform/
echo.
echo 之后每次 push 都会自动跑 CI，每 10 分钟 ping 一次演示站。
echo.
pause
