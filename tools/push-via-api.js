// tools/push-via-api.js —— github.com:443 连不上时，用 GitHub REST API 推送本地提交
//
//   node tools/push-via-api.js            # 推 main
//   node tools/push-via-api.js gh-pages   # 推 gh-pages
//
// 原理：Git Data API（create blob → create tree → create commit → update ref）。
// 只上传 origin/<branch>..HEAD 之间变化的文件，其余沿用远端已有的树。
// 前提：gh 已登录（api.github.com 通常比 git 用的 443 稳定）。
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRANCH = process.argv[2] || 'main';

const remoteUrl = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();
const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
if (!m) {
  console.error('无法从 origin 解析 owner/repo');
  process.exit(1);
}
const OWNER = m[1];
const REPO = m[2];

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}
function api(method, endpoint, payload) {
  const tmp = payload === undefined ? null : path.join(os.tmpdir(), 'gh-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  if (tmp) fs.writeFileSync(tmp, JSON.stringify(payload));
  const cmd = `gh api ${method ? '-X ' + method + ' ' : ''}repos/${OWNER}/${REPO}/${endpoint}${tmp ? ' --input "' + tmp + '"' : ''}`;
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out ? JSON.parse(out) : {};
  } finally {
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

console.log(`仓库：${OWNER}/${REPO}　分支：${BRANCH}`);

let remoteHead;
try {
  sh(`git fetch origin ${BRANCH} --depth=1`);
} catch (e) {
  console.log('（git fetch 失败，用 API 读远端 HEAD）');
}
let rev = '';
try {
  rev = sh(`git rev-parse origin/${BRANCH}`);
} catch (e) {
  rev = '';
}
remoteHead = /^[0-9a-f]{40}$/.test(rev) ? rev : api(null, `git/ref/heads/${BRANCH}`).object.sha;
const localHead = sh('git rev-parse HEAD');
if (localHead === remoteHead) {
  console.log('已是最新，无需推送');
  process.exit(0);
}
const commits = sh(`git log --format=%H --reverse ${remoteHead}..${localHead}`).split('\n').filter(Boolean);
console.log(`远端 ${remoteHead.slice(0, 7)} → 本地 ${localHead.slice(0, 7)}，${commits.length} 个提交\n`);

let baseTree = api(null, `git/commits/${remoteHead}`).tree.sha;
let parent = remoteHead;

for (const c of commits) {
  const files = sh(`git diff-tree --no-commit-id --name-status -r ${c}`)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      return { status: parts[0], file: parts.slice(1).join('\t') };
    });

  console.log(`提交 ${c.slice(0, 7)}（${files.length} 个文件）`);
  const tree = [];
  for (const f of files) {
    if (f.status === 'D') {
      tree.push({ path: f.file, mode: '100644', type: 'blob', sha: null });
      console.log('  - ' + f.file);
      continue;
    }
    const abs = path.join(ROOT, f.file);
    if (!fs.existsSync(abs)) continue;
    const buf = fs.readFileSync(abs);
    const blob = api('POST', 'git/blobs', { content: buf.toString('base64'), encoding: 'base64' });
    tree.push({ path: f.file, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`  + ${f.file}（${Math.max(1, Math.round(buf.length / 1024))} KB）`);
  }

  const newTree = api('POST', 'git/trees', { base_tree: baseTree, tree });
  const message = sh(`git log -1 --format=%B ${c}`);
  const commit = api('POST', 'git/commits', { message, tree: newTree.sha, parents: [parent] });
  baseTree = newTree.sha;
  parent = commit.sha;
  console.log(`  → ${commit.sha.slice(0, 7)}\n`);
}

api('PATCH', `git/refs/heads/${BRANCH}`, { sha: parent, force: false });
console.log(`✅ 已推送到 ${BRANCH}：${parent}`);
console.log(`   https://github.com/${OWNER}/${REPO}/commit/${parent}`);
