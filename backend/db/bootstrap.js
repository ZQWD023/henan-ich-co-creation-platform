// db/bootstrap.js —— 首次运行自动初始化
// 作用：后端启动时若发现数据库还没有内容，就自动灌入官方演示数据 + 共创演示数据，
//       让"双击启动 → 打开网页"之后直接就是有内容的完整站点，不需要手动 npm run seed。
const path = require('path');
const { execFileSync } = require('child_process');
const { db, initDatabase } = require('./database');
const config = require('../config');

function count(table) {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
    return row ? row.c : 0;
  } catch (e) {
    return 0;
  }
}

function runScript(relPath) {
  const file = path.join(__dirname, '..', relPath);
  try {
    execFileSync(process.execPath, [file], {
      cwd: config.root,
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
    });
    return true;
  } catch (e) {
    console.warn(`[自动初始化] ${relPath} 执行失败：`, (e.stderr || e.message || '').toString().split('\n')[0]);
    return false;
  }
}

/**
 * @returns {{seeded:boolean, demo:boolean}}
 */
function runBootstrap() {
  initDatabase();

  const out = { seeded: false, demo: false };
  if (String(process.env.AUTO_SETUP || '1') === '0') return out;

  // 1) 内容库（分类 / 非遗项目 / 传承人 / 作品 / 活动 / 资讯）
  if (count('heritage') === 0 || count('category') === 0) {
    console.log('[自动初始化] 检测到内容库为空，正在导入非遗数据...');
    try {
      require('./seed').seed();
      out.seeded = true;
    } catch (e) {
      console.warn('[自动初始化] 非遗数据导入失败：', e.message);
    }
  }

  // 2) 共创项目演示数据（共创广场/工作台/后台看板需要它）
  if (count('co_project') === 0) {
    console.log('[自动初始化] 正在生成共创演示项目...');
    out.demo = runScript(path.join('scripts', 'demo-data.js'));
    runScript(path.join('scripts', 'demo-social.js'));
  }

  return out;
}

module.exports = { runBootstrap };

if (require.main === module) {
  const r = runBootstrap();
  console.log('[自动初始化] 完成：', r);
}
