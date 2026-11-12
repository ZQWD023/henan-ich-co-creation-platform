@echo off
chcp 65001 >nul
echo ============================================
echo   河南省非遗共创平台 - 后端启动脚本
echo ============================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node 20 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo [信息] Node 版本：%%v

if not exist "node_modules" (
  echo [信息] 首次运行，正在安装依赖（约 1-2 分钟）...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络或改用国内镜像：npm config set registry https://registry.npmmirror.com
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo [信息] 未找到 .env，正在从 .env.example 复制...
  copy ".env.example" ".env" >nul
  echo [提示] 请打开 .env 修改 JWT_SECRET（生产环境必须改），并填入 QWEN_API_KEY 以启用 AI
)

if not exist "database.sqlite" (
  echo [信息] 首次运行，正在初始化数据库...
  call npm run seed
  call npm run demo
)

echo.
echo [信息] 启动服务...
echo.
call npm start

pause
