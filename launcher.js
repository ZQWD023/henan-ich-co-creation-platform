#!/usr/bin/env node
/**
 * launcher.js —— 一键启动器
 *
 * 双击「启动网站.bat」后实际执行的就是这个文件：
 *   1. 检查项目文件是否完整
 *   2. 首次运行自动安装依赖（backend/node_modules）
 *   3. 首次运行自动复制 .env
 *   4. 启动后端服务（server.js 会在启动后自动打开浏览器、自动导入演示数据）
 *
 * 说明：.bat 里只写英文命令，中文提示全部由这里的 Node 输出，
 *       这样可以彻底避开 cmd 在 chcp 切换时把 UTF-8 批处理读错行的老问题。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BACKEND = path.join(ROOT, 'backend');

function log(msg = '') {
  console.log(msg);
}

function banner() {
  log('');
  log('  ╔════════════════════════════════════════════════════╗');
  log('  ║   河南省非遗共创平台 · 一键启动                    ║');
  log('  ╚════════════════════════════════════════════════════╝');
  log('');
}

function fail(msg, hint) {
  log('');
  log('  [启动失败] ' + msg);
  if (hint) log('  ' + hint);
  log('');
  process.exit(1);
}

banner();

/* 1. 文件完整性 */
if (!fs.existsSync(path.join(BACKEND, 'server.js'))) {
  fail('没有找到 backend/server.js，请确认整个项目文件夹是否复制完整。');
}

/* 2. 依赖 */
if (!fs.existsSync(path.join(BACKEND, 'node_modules'))) {
  log('  [1/3] 首次运行，正在安装依赖（约 1-2 分钟，只需要一次）...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], {
    cwd: BACKEND,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    fail('依赖安装失败。', '可先切换国内镜像再重试：npm config set registry https://registry.npmmirror.com');
  }
  log('  [1/3] 依赖安装完成。');
} else {
  log('  [1/3] 依赖已就绪。');
}

/* 3. 环境变量文件 */
const envPath = path.join(BACKEND, '.env');
if (!fs.existsSync(envPath)) {
  const example = path.join(BACKEND, '.env.example');
  if (fs.existsSync(example)) {
    fs.copyFileSync(example, envPath);
    log('  [2/3] 已生成 backend/.env（可填入 QWEN_API_KEY 启用大模型，不填也能正常用）。');
  } else {
    log('  [2/3] 未找到 .env.example，使用默认配置启动。');
  }
} else {
  log('  [2/3] 配置文件已就绪。');
}

/* 4. 启动 */
log('  [3/3] 正在启动网站服务，首次启动会自动导入非遗数据与演示数据...');
log('');
log('        网站首页： http://localhost:3000/');
log('        停止服务： 关闭这个窗口 / 按 Ctrl+C');
log('');

process.env.AUTO_OPEN_BROWSER = process.env.AUTO_OPEN_BROWSER || '1';
process.env.AUTO_SETUP = process.env.AUTO_SETUP || '1';

// dotenv 从当前工作目录读取 .env，所以必须先切到 backend
process.chdir(BACKEND);

try {
  const { bootstrap } = require(path.join(BACKEND, 'server.js'));
  bootstrap();
} catch (err) {
  fail('启动时出现错误：' + (err && err.message ? err.message : err));
}
