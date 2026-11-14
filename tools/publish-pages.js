/**
 * tools/publish-pages.js —— 把「算法网站(3)」发布到 gh-pages 分支（GitHub Pages 静态演示）
 *
 *   node tools/publish-pages.js            # 同步 + 提交 + 推送
 *   node tools/publish-pages.js --dry      # 只看会同步哪些文件
 *
 * 为什么需要它：前端改动后 main 分支会更新，但 GitHub Pages 读的是 gh-pages 分支，
 * 不同步的话线上演示还是旧页面。这个脚本用 git worktree 完成"复制 → 提交 → 推送"。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, '算法网站(3)');
const DRY = process.argv.includes('--dry');
const WORK = path.join(os.tmpdir(), 'ich-gh-pages-' + Date.now());

function sh(cmd, cwd) {
  return execSync(cmd, { cwd: cwd || ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
function rmExceptGit(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    fs.rmSync(path.join(dir, e.name), { recursive: true, force: true });
  }
}
function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}

if (DRY) {
  console.log('会发布这些目录/文件（到 gh-pages 根目录）：');
  for (const e of fs.readdirSync(SITE)) console.log('  ·', e);
  console.log('站点文件数：', countFiles(SITE));
  process.exit(0);
}

console.log('① 建立 gh-pages worktree ...');
try {
  sh('git worktree remove --force "' + WORK + '"');
} catch (e) {
  /* 不存在就算了 */
}
if (fs.existsSync(WORK)) fs.rmSync(WORK, { recursive: true, force: true });
try {
  sh('git fetch origin gh-pages --depth=1');
  sh('git worktree add -B gh-pages "' + WORK + '" origin/gh-pages');
} catch (e) {
  sh('git worktree add -B gh-pages "' + WORK + '"');
}

console.log('② 清空并复制站点文件 ...');
rmExceptGit(WORK);
copyDir(SITE, WORK);
fs.writeFileSync(path.join(WORK, '.nojekyll'), '');
const n = countFiles(WORK);
console.log('   已复制', n, '个文件');

console.log('③ 提交 ...');
sh('git add -A', WORK);
let status = '';
try {
  status = sh('git status --porcelain', WORK);
} catch (e) {
  status = '';
}
if (!status) {
  console.log('   没有变化，跳过提交');
} else {
  const msg = 'gh-pages: 同步站点（' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '）';
  sh('git -c user.name="ich-team" -c user.email="dev@ich.local" commit -q -m "' + msg + '"', WORK);
  console.log('   已提交');
}

console.log('④ 推送到 origin gh-pages ...');
try {
  const out = execSync('git -c http.version=HTTP/1.1 push --force origin gh-pages', { cwd: WORK, encoding: 'utf8' });
  console.log(out.trim() || '   已推送');
} catch (e) {
  console.log('   推送失败（可稍后重试）：', ((e.stderr || '') + (e.stdout || '')).slice(0, 300));
}

console.log('⑤ 清理 worktree ...');
try {
  sh('git worktree remove --force "' + WORK + '"');
} catch (e) {
  console.log('   清理失败，可手动删除：', WORK);
}

const remote = sh('git remote get-url origin');
const repo = (remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/) || []);
if (repo.length === 3) {
  console.log('\n演示地址：https://' + repo[1].toLowerCase() + '.github.io/' + repo[2] + '/');
  console.log('（Pages 构建约需 30-60 秒，稍等再刷新）');
}
