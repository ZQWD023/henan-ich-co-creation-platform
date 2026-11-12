// db/import-data.js —— 从旧版前端 data.js 抽取内容，生成 seed-data.json
// 这样"内容库"从静态 JS 迁移到数据库只需一条命令，且可重复执行：
//   npm run import-data && npm run seed
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 默认取同级目录下的前端工程，可用命令行参数覆盖
const defaultCandidates = [
  path.join(__dirname, '..', '..', '算法网站(3)', 'js', 'data.js'),
  path.join(__dirname, '..', '..', '..', '算法网站(3)', 'js', 'data.js'),
  path.join(__dirname, '..', 'data.js'),
];

function findSource() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  for (const p of defaultCandidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function main() {
  const src = findSource();
  if (!src) {
    console.error('未找到 data.js，请显式传入路径：node db/import-data.js <path-to-data.js>');
    process.exit(1);
  }

  console.log('读取源文件：', src);
  let code = fs.readFileSync(src, 'utf8');
  // data.js 里有部分 const 没有挂到 window 上，这里补一段导出
  code +=
    '\nwindow.events=events;window.news=news;window.ichAchievements=ichAchievements;' +
    'window.cityOf=cityOf;';

  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 10000 });

  const keys = [
    'ichCategories',
    'heritageProjects',
    'inheritors',
    'coCreateWorks',
    'events',
    'news',
    'ichAchievements',
  ];

  const out = {};
  let missing = [];
  for (const k of keys) {
    const v = sandbox.window[k];
    if (!Array.isArray(v)) {
      missing.push(k);
      out[k] = [];
      continue;
    }
    out[k] = v;
  }

  const dest = path.join(__dirname, 'seed-data.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 1), 'utf8');

  console.log('抽取结果：');
  for (const k of keys) console.log(`  ${k.padEnd(20)} ${out[k].length}`);
  if (missing.length) console.warn('  ⚠️ 未找到：', missing.join(', '));
  console.log('已写入：', dest);
  console.log('\n下一步：npm run seed');
}

main();
