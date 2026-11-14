/**
 * tools/fill-info.js —— 一条命令把"待填写"全部替换掉（含重出 PDF 与 PPT）
 *
 *   node tools/fill-info.js --dry                       # 只看会改哪些地方，不写文件
 *   node tools/fill-info.js \
 *     --school "河南XX大学" --group "B 组" \
 *     --members "张三、李四、王五" --teacher "李老师" \
 *     --repo "https://github.com/xxx/ich" --demo "https://ich.onrender.com"
 *
 * 作用范围：README.md / docs/技术文档.md / docs/ppt/答辩口播稿.md / 提交材料清单.md / docs/ppt/gen-deck.py
 * 改完自动：① 重出技术文档 PDF　② 重出答辩 PPT（如果把 --no-build 去掉）
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const NO_BUILD = argv.includes('--no-build');

function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
}

const info = {
  school: arg('school', ''),
  group: arg('group', ''),
  members: arg('members', ''),
  teacher: arg('teacher', ''),
  repo: arg('repo', ''),
  demo: arg('demo', ''),
};

if (!Object.values(info).some(Boolean)) {
  console.log('用法示例：');
  console.log(
    '  node tools/fill-info.js --school "河南XX大学" --group "B 组" --members "张三、李四" --teacher "李老师" --repo "https://github.com/you/ich" --demo "https://ich.onrender.com"'
  );
  console.log('\n只查看会改什么：加 --dry');
  process.exit(2);
}

/** 每条规则：文件、正则、替换（仅当传了对应参数才替换） */
const RULES = [
  // README 团队信息表
  { file: 'README.md', key: 'school', from: /\| 学校 \| （待填写） \|/g, to: `| 学校 | ${'$'}SCHOOL |` },
  { file: 'README.md', key: 'group', from: /\| 组别 \| （B 组 \/ C 组，按官方规则自选） \|/g, to: `| 组别 | ${'$'}GROUP |` },
  { file: 'README.md', key: 'members', from: /\| 队员 \| （待填写） \|/g, to: `| 队员 | ${'$'}MEMBERS |` },
  { file: 'README.md', key: 'teacher', from: /\| 指导老师 \| （待填写） \|/g, to: `| 指导老师 | ${'$'}TEACHER |` },
  { file: 'README.md', key: 'demo', from: /\| 演示地址 \| `（待填：https:\/\/xxx\.onrender\.com）` \|/g, to: `| 演示地址 | \`${'$'}DEMO\` |` },
  // 技术文档封面
  { file: 'docs/技术文档.md', key: 'team', from: /^> 团队：.*$/m, to: '> 团队：$MEMBERS　　学校：$SCHOOL　　组别：$GROUP　　指导教师：$TEACHER　　版本：v2.1' },
  { file: 'docs/技术文档.md', key: 'repo', from: /^> 代码仓库：（待填写：GitHub \/ Gitee 公开地址）　　在线演示：（待填写）$/gm, to: '> 代码仓库：$REPO　　在线演示：$DEMO' },
  // 口播稿
  { file: 'docs/ppt/答辩口播稿.md', key: 'members', from: /我们是 XX 团队，作品是/g, to: '我们是$MEMBERS 团队，作品是' },
  // 提交材料清单（部署/仓库两行备注）
  { file: '提交材料清单.md', key: 'repo', from: /本地已是 git 仓库（\d+ 次提交），\*\*待推送\*\*：`git remote add origin <url> && git push -u origin main`/g, to: '已推送：`$REPO`' },
];

const targets = [...new Set(RULES.map((r) => r.file))];
const planned = [];

for (const file of targets) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    console.log(`跳过（不存在）：${file}`);
    continue;
  }
  let text = fs.readFileSync(abs, 'utf8');
  const before = text;
  for (const r of RULES.filter((x) => x.file === file)) {
    const val = r.key === 'team' ? '' : info[r.key];
    if (r.key !== 'team' && !val) continue;
    const repl = r.to
      .replace(/\$SCHOOL/g, info.school || '（待填写）')
      .replace(/\$GROUP/g, info.group || '（待填写）')
      .replace(/\$MEMBERS/g, info.members || '（待填写）')
      .replace(/\$TEACHER/g, info.teacher || '（待填写）')
      .replace(/\$REPO/g, info.repo || '（待填写）')
      .replace(/\$DEMO/g, info.demo || '（待填写）');
    if (r.from.test(text)) {
      text = text.replace(r.from, repl);
      planned.push({ file, key: r.key });
    }
  }
  if (text !== before && !DRY) fs.writeFileSync(abs, text, 'utf8');
}

// PPT 生成脚本里的封面与结尾占位
const deckPath = path.join(ROOT, 'docs/ppt/gen-deck.py');
if (fs.existsSync(deckPath)) {
  let d = fs.readFileSync(deckPath, 'utf8');
  const before = d;
  if (info.members) d = d.replace(/\("团队：（待填写）"/g, `("团队：${info.members}"`);
  if (info.school) {
    d = d.replace(/\("学校：（待填写）　　指导教师：（待填写）"/g, `("学校：${info.school}　　组别：${info.group || '（待填写）'}　　指导教师：${info.teacher || '（待填写）'}"`);
  }
  if (info.demo || info.repo) {
    d = d.replace(
      /\("在线演示：（待填写）　　仓库：（待填写）"/g,
      `("在线演示：${info.demo || '（待填写）'}　　仓库：${info.repo || '（待填写）'}"`
    );
    d = d.replace(/\("在线演示：（待填写）", 12, False/g, `("在线演示：${info.demo || '（待填写）'}", 12, False`);
    d = d.replace(/\("代码仓库：（待填写）　评审账号：reviewer \/ （待填写）"/g, `("代码仓库：${info.repo || '（待填写）'}　评审账号：reviewer / Reviewer@2026"`);
  }
  if (d !== before) {
    planned.push({ file: 'docs/ppt/gen-deck.py', key: 'ppt' });
    if (!DRY) fs.writeFileSync(deckPath, d, 'utf8');
  }
}

console.log(DRY ? '【DRY RUN】会修改：' : '已修改：');
if (!planned.length) console.log('  （没有匹配到任何占位符 —— 可能已经填过了，或参数名不对）');
for (const p of planned) console.log(`  · ${p.file}  ← ${p.key}`);

if (!DRY && !NO_BUILD && planned.length) {
  console.log('\n重新生成 PDF 与 PPT ...');
  try {
    if (planned.some((p) => p.file.includes('技术文档'))) {
      execSync('node tools/build-pdf.js', { cwd: ROOT, stdio: 'inherit' });
    }
    if (planned.some((p) => p.file.includes('gen-deck'))) {
      execSync('node -e "1"', { cwd: ROOT }); // 占位，避免误用系统 python
      console.log('  → PPT 请运行：python docs/ppt/gen-deck.py');
    }
  } catch (e) {
    console.log('  构建失败：', e.message);
  }
}

// 收尾：报告还剩多少占位符
const left = [];
for (const f of ['README.md', 'docs/技术文档.md', 'docs/ppt/答辩口播稿.md', '提交材料清单.md']) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) continue;
  const n = (fs.readFileSync(abs, 'utf8').match(/待填写/g) || []).length;
  if (n) left.push(`${f} ×${n}`);
}
console.log('\n剩余"待填写"：' + (left.length ? left.join('；') : '无 ✅'));
