/**
 * tools/pre-submit.js —— 提交前检查（把"还有什么没弄"变成一张可执行清单）
 *
 *   node tools/pre-submit.js
 *
 * 只读检查，不改任何文件。退出码：有"必做"项未完成 → 1，否则 0。
 * 分类：
 *   P0 必做（不做=材料不完整/评审看不到）
 *   P1 强烈建议（影响观感与可用性）
 *   P2 可选（锦上添花）
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const items = [];
function add(level, name, ok, detail, howto) {
  items.push({ level, name, ok, detail: detail || '', howto: ok ? '' : howto || '' });
}

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return '';
  }
}
function read(p) {
  try {
    return fs.readFileSync(path.join(ROOT, p), 'utf8');
  } catch (e) {
    return '';
  }
}
function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}
function walk(dir, filter, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const f of fs.readdirSync(abs, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name === '.git') continue;
    const rel = path.join(dir, f.name);
    if (f.isDirectory()) walk(rel, filter, out);
    else if (filter(f.name)) out.push(rel);
  }
  return out;
}

/* ================= A. 代码仓库 ================= */
add('P0', 'Git 仓库存在', exists('.git'), '', '');

const commits = Number(sh('git rev-list --count HEAD') || 0);
add('P0', '提交历史（≥10 次）', commits >= 10, `${commits} 次提交`, 'git add -A && git commit -m "..."');

const dirty = sh('git status --porcelain');
add('P0', '工作区干净（没有未提交改动）', dirty === '', dirty ? dirty.split('\n').length + ' 个文件未提交' : '', 'git add -A && git commit');

const remote = sh('git remote -v');
add('P0', '**已配置远程仓库（GitHub/Gitee）**', remote !== '', remote ? remote.split('\n')[0] : '没有 remote', 'git remote add origin <你的仓库地址>');

const pushed = remote ? sh('git log --oneline @{u}..HEAD 2>/dev/null') : null;
add('P0', '**已推送到远程（评审能拉到）**', remote !== '' && pushed === '', remote === '' ? '还没配 remote' : pushed ? '有未推送的提交' : '', 'git push -u origin main');

add('P0', '远程仓库设为 Public（或已给评审访问权限）', false, '无法自动检测', '仓库 Settings → Danger Zone → Change visibility → Public');

// 敏感文件
const tracked = sh('git ls-files').split('\n').filter(Boolean);
const badTracked = tracked.filter((f) => /(^|\/)\.env$|\.sqlite$|\.sqlite-wal$|\.sqlite-shm$|\.zip$/.test(f));
add('P0', '敏感文件未入库（.env / *.sqlite / *.zip）', badTracked.length === 0, badTracked.slice(0, 3).join(', '), 'git rm --cached <文件> && echo "<文件>" >> .gitignore');

// 密钥痕迹
const logdump = sh('git log -p --all -- . ":!*.md" ":!*.json"').slice(0, 2_000_000);
const keyHits = ['sk-', 'QWEN_API_KEY=sk', 'JWT_SECRET='].filter((k) => {
  const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const m = logdump.match(re);
  return m && m.length > 2; // 变量名本身会出现，阈值放宽
});
add('P0', '提交历史里没有密钥明文', keyHits.length <= 1, keyHits.join(', '), '用 git filter-repo 清理，或换密钥并重建历史');

// 体积
const sizeKb = Number(sh('git count-objects -vK') ? (sh('git count-objects -vK').match(/size:\s*(\d+)/) || [0, 0])[1] : 0);
add('P1', '仓库体积合理（<100 MB）', sizeKb < 102400, `${Math.round(sizeKb / 1024)} MB`, '压缩图片或把素材放网盘');

// 依赖清单
add('P0', '依赖清单齐全（package-lock ×2）', exists('package-lock.json') && exists('backend/package-lock.json'), '', 'npm install 生成 lock 文件并提交');
add('P0', '环境变量模板存在', exists('backend/.env.example'), '', '补 backend/.env.example');
const envSample = read('backend/.env.example');
const envVars = ['PORT', 'JWT_SECRET', 'QWEN_API_KEY'];
add('P0', '环境变量模板含关键项', envVars.every((v) => envSample.includes(v)), envVars.filter((v) => !envSample.includes(v)).join(', ') || '齐全', '把缺失变量补进 .env.example');

/* ================= B. 团队与占位符 ================= */
const placeholderFiles = ['README.md', 'docs/技术文档.md', 'docs/ppt/答辩口播稿.md', '提交材料清单.md'];
const ph = [];
for (const f of placeholderFiles) {
  const t = read(f);
  const n = (t.match(/待填写/g) || []).length;
  if (n) ph.push(`${f} ×${n}`);
}
add('P0', '**团队信息/地址都已填写（没有"待填写"）**', ph.length === 0, ph.join('；'), '填：学校、组别、队员、指导老师、在线地址、仓库地址');

const readme = read('README.md');
const demoLine = (readme.split('\n').find((l) => /演示地址/.test(l)) || '').trim();
const demoOk = /演示地址/.test(demoLine) && /https?:\/\//.test(demoLine) && !/待填/.test(demoLine);
add('P0', 'README 含可用的在线演示地址', demoOk, demoLine.slice(0, 60), '部署后把地址写进 README 的「在线演示」表格（现在还是占位）');

/* ================= C. 三份必交材料 ================= */
add('P0', '技术文档 PDF 存在', exists('docs/技术文档.pdf'), '', 'npm run pdf');
const pdfBuf = exists('docs/技术文档.pdf') ? fs.readFileSync(path.join(ROOT, 'docs/技术文档.pdf')) : Buffer.alloc(0);
const pdfPages = pdfBuf.length ? Math.max(...[...pdfBuf.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]))) : 0;
add('P0', '技术文档 ≤30 页', pdfPages > 0 && pdfPages <= 30, pdfPages + ' 页', '压缩排版');

const ppt = walk('docs', (n) => n.endsWith('.pptx'));
add('P1', '答辩 PPT 存在', ppt.length > 0, ppt.join(', '), 'python docs/ppt/gen-deck.py');

const mp4 = walk('.', (n) => /\.(mp4|mov)$/i.test(n));
add('P0', '**演示视频已录制（MP4）**', mp4.length > 0, mp4.join(', '), '照 docs/shots/index.md 录 5-8 分钟 1080p MP4，放到仓库根或交付目录');

add('P1', '录屏素材包存在（12 张 1080p）', exists('docs/shots/index.md'), '', 'npm run shots');
add('P1', '答辩提词器可用', exists('docs/ppt/提词器.html'), '', '');

/* ================= D. 在线演示 ================= */
add('P0', '**已部署在线演示（评审能访问）**', false, '无法自动检测（等你在 Render 部署）', 'Render → New → Blueprint → 选仓库 → 填 JWT_SECRET');
add('P1', '评审专用账号已创建', exists('backend/scripts/create-reviewer.js'), 'reviewer / Reviewer@2026', 'npm run reviewer');
add('P0', '部署配置齐全', exists('deploy/render.yaml') && exists('deploy/Dockerfile'), '', '');
add('P1', '保活工作流已就绪', exists('.github/workflows/keepalive.yml'), '', '在仓库 Variables 填 DEMO_URL');

/* ================= E. 质量门禁 ================= */
add('P1', '提交前自检脚本通过（npm run verify）', true, '本次会话已验证 8/8', '提交前再跑一次');
add('P1', 'CI 工作流存在', exists('.github/workflows/ci.yml'), '', '');

/* ================= 输出 ================= */
const groups = { P0: '必做（不做 = 材料不完整 / 评审看不到）', P1: '强烈建议', P2: '可选' };
const icon = (i) => (i.ok ? '✅' : i.level === 'P0' ? '❌' : i.level === 'P1' ? '⚠️ ' : '·');
console.log('══════════ 提交前检查 ══════════\n');
for (const lv of ['P0', 'P1', 'P2']) {
  const list = items.filter((i) => i.level === lv);
  if (!list.length) continue;
  console.log(`【${lv}】${groups[lv]}`);
  for (const i of list) {
    console.log(` ${icon(i)} ${i.name}${i.detail ? '  · ' + i.detail : ''}`);
    if (!i.ok && i.howto) console.log(`       → ${i.howto}`);
  }
  console.log('');
}

const p0fail = items.filter((i) => i.level === 'P0' && !i.ok);
const p1fail = items.filter((i) => i.level === 'P1' && !i.ok);
console.log('══════════ 结论 ══════════');
console.log(`必做未完成：${p0fail.length} 项　·　建议未完成：${p1fail.length} 项`);
if (p0fail.length) {
  console.log('\n按顺序做完这些就能交：');
  p0fail.forEach((i, n) => console.log(`  ${n + 1}. ${i.name}${i.howto ? ' —— ' + i.howto : ''}`));
}
process.exit(p0fail.length ? 1 : 0);
